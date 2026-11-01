/* Personal Phrommayan backend. No credentials belong in this repository.
 * Existing ADMIN_USER / ADMIN_PASS may be retained privately in the deployed
 * project for one-time migration. Once migrated, only Script Properties apply.
 */
var OWNER_KEY_ = 'PHROMMAYAN_OWNER_V1';
var SESSION_PREFIX_ = 'PMY_SESSION_';
var SESSION_TTL_ = 8 * 60 * 60 * 1000;
var FAILURE_KEY_ = 'PMY_LOGIN_FAILURES';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== 'object') throw new Error('BAD_REQUEST');
    var output;
    if (data.action === 'login') output = ownerLogin_(data);
    else if (data.action === 'logout') output = ownerLogout_(data);
    else if (data.action === 'updateAccount') output = ownerUpdate_(data);
    else if (data.action === 'saveResult') output = ownerSave_(data);
    else throw new Error('FORBIDDEN');
    return ownerJson_(output);
  } catch (error) {
    var messages = {
      BAD_REQUEST: 'ข้อมูลไม่ถูกต้อง', FORBIDDEN: 'ไม่มีสิทธิ์ใช้งาน',
      NOT_READY: 'ยังไม่ได้ตั้งค่าบัญชีส่วนตัว', LOGIN_FAILED: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      RATE_LIMIT: 'ลองใหม่อีกครั้งใน 5 นาที', SESSION_EXPIRED: 'กรุณาเข้าสู่ระบบอีกครั้ง',
      CURRENT_PASSWORD: 'รหัสผ่านปัจจุบันไม่ถูกต้อง', PASSWORD_LENGTH: 'รหัสผ่านใหม่ต้องมี 12–128 ตัวอักษร',
      USERNAME: 'ชื่อผู้ใช้ต้องมี 1–80 ตัวอักษร', BUSY: 'ระบบกำลังบันทึก ลองอีกครั้ง',
      REQUEST_CONFLICT: 'รหัสรายการนี้ถูกใช้กับผลอื่นแล้ว'
    };
    var code = Object.prototype.hasOwnProperty.call(messages, error.message) ? error.message : 'SERVER_ERROR';
    return ownerJson_({ success: false, code: code, message: messages[code] || 'บันทึกไม่สำเร็จ ลองอีกครั้ง' });
  }
}

function ownerJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function ownerProperties_() { return PropertiesService.getScriptProperties(); }

function ownerLock_(operation) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('BUSY');
  try { return operation(); } finally { lock.releaseLock(); }
}

function ownerRandom_() { return Utilities.getUuid() + Utilities.getUuid(); }

function ownerDigest_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function ownerPassword_(password, salt, pepper) {
  // The key (pepper) remains server-side in Script Properties, separate from Git.
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(salt + '\n' + password, pepper, Utilities.Charset.UTF_8));
}

function ownerEqual_(left, right) {
  left = String(left); right = String(right);
  var different = left.length ^ right.length;
  for (var i = 0; i < Math.max(left.length, right.length); i++) different |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return different === 0;
}

function ownerConfig_() {
  var raw = ownerProperties_().getProperty(OWNER_KEY_);
  if (!raw) throw new Error('NOT_READY');
  return JSON.parse(raw);
}

function ownerMigrate_() {
  var properties = ownerProperties_();
  if (properties.getProperty(OWNER_KEY_)) return;
  if (typeof ADMIN_USER === 'undefined' || typeof ADMIN_PASS === 'undefined') throw new Error('NOT_READY');
  var salt = ownerRandom_(), pepper = ownerRandom_();
  properties.setProperty(OWNER_KEY_, JSON.stringify({
    username: String(ADMIN_USER), salt: salt, pepper: pepper,
    passwordHash: ownerPassword_(String(ADMIN_PASS), salt, pepper), version: ownerRandom_()
  }));
}

function ownerFailures_() {
  var raw = ownerProperties_().getProperty(FAILURE_KEY_);
  var state = raw ? JSON.parse(raw) : { count: 0, until: 0 };
  return state.until > Date.now() ? state : { count: 0, until: 0 };
}

function ownerFailure_(state) {
  state.count++;
  if (!state.until) state.until = Date.now() + 5 * 60 * 1000;
  ownerProperties_().setProperty(FAILURE_KEY_, JSON.stringify(state));
}

function ownerSession_(config) {
  var properties = ownerProperties_();
  var all = properties.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(SESSION_PREFIX_) !== 0) return;
    var session = JSON.parse(all[key]);
    if (session.expiresAt <= Date.now() || session.version !== config.version) properties.deleteProperty(key);
  });
  var token = ownerRandom_();
  properties.setProperty(SESSION_PREFIX_ + ownerDigest_(token), JSON.stringify({ version: config.version, expiresAt: Date.now() + SESSION_TTL_ }));
  return { success: true, role: 'owner', username: config.username, sessionToken: token };
}

function ownerAuthenticate_(data) {
  if (typeof data.sessionToken !== 'string' || data.sessionToken.length > 200) throw new Error('SESSION_EXPIRED');
  var config = ownerConfig_();
  var raw = ownerProperties_().getProperty(SESSION_PREFIX_ + ownerDigest_(data.sessionToken));
  if (!raw) throw new Error('SESSION_EXPIRED');
  var session = JSON.parse(raw);
  if (session.expiresAt <= Date.now() || session.version !== config.version) throw new Error('SESSION_EXPIRED');
  return config;
}

function ownerLogin_(data) {
  return ownerLock_(function() {
    var failures = ownerFailures_();
    if (failures.count >= 8) throw new Error('RATE_LIMIT');
    ownerMigrate_();
    var config = ownerConfig_();
    if (typeof data.password !== 'string' || data.password.length > 128 || data.username !== config.username ||
        !ownerEqual_(ownerPassword_(data.password, config.salt, config.pepper), config.passwordHash)) {
      ownerFailure_(failures); throw new Error('LOGIN_FAILED');
    }
    ownerProperties_().deleteProperty(FAILURE_KEY_);
    return ownerSession_(config);
  });
}

function ownerLogout_(data) {
  if (typeof data.sessionToken === 'string' && data.sessionToken.length <= 200) {
    ownerProperties_().deleteProperty(SESSION_PREFIX_ + ownerDigest_(data.sessionToken));
  }
  return { success: true };
}

function ownerUpdate_(data) {
  return ownerLock_(function() {
    var config = ownerAuthenticate_(data);
    var failures = ownerFailures_();
    if (failures.count >= 8) throw new Error('RATE_LIMIT');
    if (typeof data.currentPassword !== 'string' || data.currentPassword.length > 128 ||
        !ownerEqual_(ownerPassword_(data.currentPassword, config.salt, config.pepper), config.passwordHash)) {
      ownerFailure_(failures); throw new Error('CURRENT_PASSWORD');
    }
    if (typeof data.username !== 'string' || !data.username.trim() || data.username.trim().length > 80) throw new Error('USERNAME');
    if (typeof data.newPassword !== 'string' || (data.newPassword && (data.newPassword.length < 12 || data.newPassword.length > 128))) throw new Error('PASSWORD_LENGTH');
    config.username = data.username.trim();
    if (data.newPassword) {
      config.salt = ownerRandom_();
      config.passwordHash = ownerPassword_(data.newPassword, config.salt, config.pepper);
    }
    config.version = ownerRandom_();
    ownerProperties_().setProperty(OWNER_KEY_, JSON.stringify(config));
    ownerProperties_().deleteProperty(FAILURE_KEY_);
    return ownerSession_(config);
  });
}

function ownerCell_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }

function ownerSave_(data) {
  return ownerLock_(function() {
    var config = ownerAuthenticate_(data);
    if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{20,80}$/.test(data.requestId)) throw new Error('BAD_REQUEST');
    if (data.type !== '12 ใบ' && data.type !== '3 ใบ') throw new Error('BAD_REQUEST');
    if (typeof data.cards !== 'string' || typeof data.question !== 'string' || typeof data.fullPattern !== 'string' ||
        data.cards.length > 200 || data.question.length > 8000 || data.fullPattern.length > 16000) throw new Error('BAD_REQUEST');
    var cards = data.cards.split(/,\s*/).map(Number);
    var valid = cards.every(function(id) { return (id >= 101 && id <= 107) || (id >= 201 && id <= 212) || (id >= 301 && id <= 312) || (id >= 401 && id <= 436); });
    if (!valid || new Set(cards).size !== cards.length || (data.type === '12 ใบ' ? cards.length !== 12 : cards.length < 3 || cards.length > 6)) throw new Error('BAD_REQUEST');
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Results');
    if (!sheet) throw new Error('NOT_READY');
    // Existing A:F history is preserved; G holds a durable idempotency key.
    var last = sheet.getLastRow();
    var recordKey = data.requestId + ':' + ownerDigest_(JSON.stringify([data.type, data.question, data.cards, data.fullPattern]));
    if (last > 1) {
      var existing = sheet.getRange(2, 7, last - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).split(':')[0] !== data.requestId) continue;
        if (String(existing[i][0]) !== recordKey) throw new Error('REQUEST_CONFLICT');
        return { success: true, duplicate: true };
      }
    }
    var header = sheet.getRange(1, 7, 1, 1);
    if (!header.getValue()) header.setValue('รหัสรายการ');
    else if (header.getValue() !== 'รหัสรายการ') throw new Error('BAD_REQUEST');
    var timestamp = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
    sheet.appendRow([timestamp, ownerCell_(config.username), data.type, ownerCell_(data.question), data.cards, ownerCell_(data.fullPattern), recordKey]);
    SpreadsheetApp.flush();
    return { success: true };
  });
}
