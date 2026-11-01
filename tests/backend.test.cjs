const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function backend() {
  const properties = new Map();
  const rows = [['วันที่บันทึก', 'Username', 'ประเภท', 'คำถาม', 'ไพ่', 'รูปแบบ']];
  let now = Date.now(), lockAvailable = true, locks = 0;
  const store = {
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => properties.set(key, value),
    deleteProperty: key => properties.delete(key),
    getProperties: () => Object.fromEntries(properties)
  };
  const sheet = {
    getLastRow: () => rows.length,
    getRange: (row, column, count = 1, width = 1) => ({
      getValue: () => rows[row - 1]?.[column - 1] || '',
      setValue: value => { rows[row - 1][column - 1] = value; },
      getValues: () => Array.from({ length: count }, (_, offset) => Array.from({ length: width }, (_, col) => rows[row + offset - 1]?.[column + col - 1] || ''))
    }),
    appendRow: row => rows.push(row)
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, JSON, Set, Object, String, Number, Math, Error,
    ADMIN_USER: 'qa-owner', ADMIN_PASS: 'legacy-test-password',
    PropertiesService: { getScriptProperties: () => store },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (lockAvailable) locks++; return lockAvailable; }, releaseLock: () => { locks--; } }) },
    Utilities: {
      getUuid: crypto.randomUUID,
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, text) => crypto.createHash('sha256').update(text).digest(),
      computeHmacSha256Signature: (text, key) => crypto.createHmac('sha256', key).update(text).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
      formatDate: () => '31/10/2026 22:00:00'
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => { assert.equal(name, 'Results'); return sheet; } }), flush() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), context);
  const call = data => { context.request = { postData: { contents: JSON.stringify(data) } }; return vm.runInContext('doPost(request)', context); };
  const login = () => call({ action: 'login', username: 'qa-owner', password: 'legacy-test-password' });
  const payload = { action: 'saveResult', requestId: crypto.randomUUID(), type: '12 ใบ', cards: '101, 102, 103, 104, 105, 106, 107, 201, 202, 203, 204, 205', question: '=SUM(1,2)', fullPattern: 'ผลทดสอบ' };
  return { call, login, properties, rows, payload, advance: duration => { now += duration; }, setLock: value => { lockAvailable = value; }, locks: () => locks };
}

test('only the owner can sign in; retired user-management routes reject all callers', () => {
  const state = backend();
  assert.equal(state.call({ action: 'login', username: 'other', password: 'legacy-test-password' }).success, false);
  const owner = state.login(); assert.equal(owner.role, 'owner'); assert.ok(owner.sessionToken);
  for (const action of ['generate', 'list']) assert.equal(state.call({ action, sessionToken: owner.sessionToken }).code, 'FORBIDDEN');
  const stored = state.properties.get('PHROMMAYAN_OWNER_V1');
  assert.equal(stored.includes('legacy-test-password'), false);
  assert.equal(state.locks(), 0);
});

test('saving requires an unexpired session and derives username from the owner record', () => {
  const state = backend();
  assert.equal(state.call(state.payload).code, 'SESSION_EXPIRED');
  const owner = state.login();
  assert.equal(state.call({ ...state.payload, username: 'spoofed-name', sessionToken: owner.sessionToken }).success, true);
  assert.equal(state.rows[1][1], 'qa-owner');
  assert.equal(state.rows[1][3], "'=SUM(1,2)");
  state.advance(9 * 60 * 60 * 1000);
  assert.equal(state.call({ ...state.payload, sessionToken: owner.sessionToken }).code, 'SESSION_EXPIRED');
});

test('repeating an uncertain save creates only one row and conflicting payloads are rejected', () => {
  const state = backend(), owner = state.login();
  const payload = { ...state.payload, sessionToken: owner.sessionToken };
  assert.equal(state.call(payload).success, true);
  assert.equal(state.call(payload).duplicate, true);
  assert.equal(state.rows.length, 2);
  assert.equal(state.call({ ...payload, question: 'different-question' }).code, 'REQUEST_CONFLICT');
  assert.equal(state.rows.length, 2);
});

test('changing owner credentials requires the old password and invalidates all existing sessions', () => {
  const state = backend(), first = state.login(), second = state.login();
  const change = { action: 'updateAccount', sessionToken: first.sessionToken, username: 'renamed-owner', currentPassword: 'wrong-password', newPassword: 'new-local-password' };
  assert.equal(state.call(change).code, 'CURRENT_PASSWORD');
  assert.equal(state.call({ ...change, currentPassword: 'legacy-test-password', newPassword: 'short' }).code, 'PASSWORD_LENGTH');
  const result = state.call({ ...change, currentPassword: 'legacy-test-password' });
  assert.equal(result.success, true); assert.ok(result.sessionToken);
  assert.equal(state.call({ ...state.payload, sessionToken: second.sessionToken }).code, 'SESSION_EXPIRED');
  assert.equal(state.login().code, 'LOGIN_FAILED');
  const newLogin = state.call({ action: 'login', username: 'renamed-owner', password: 'new-local-password' });
  assert.equal(newLogin.success, true);
  assert.equal(state.properties.get('PHROMMAYAN_OWNER_V1').includes('new-local-password'), false);
});

test('renaming the owner can preserve the password and logout revokes its session', () => {
  const state = backend(), owner = state.login();
  const changed = state.call({ action: 'updateAccount', sessionToken: owner.sessionToken, username: 'renamed', currentPassword: 'legacy-test-password', newPassword: '' });
  assert.equal(changed.success, true);
  const login = state.call({ action: 'login', username: 'renamed', password: 'legacy-test-password' });
  assert.equal(login.success, true);
  state.call({ action: 'logout', sessionToken: login.sessionToken });
  assert.equal(state.call({ ...state.payload, sessionToken: login.sessionToken }).code, 'SESSION_EXPIRED');
});

test('login attempts are throttled and concurrent writes fail safely', () => {
  const state = backend();
  for (let i = 0; i < 8; i++) state.call({ action: 'login', username: 'qa-owner', password: 'wrong' });
  assert.equal(state.login().code, 'RATE_LIMIT');
  state.advance(6 * 60 * 1000); assert.equal(state.login().success, true);
  state.setLock(false); assert.equal(state.login().code, 'BUSY'); assert.equal(state.locks(), 0);
});
