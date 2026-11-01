const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function setup(saveResponse = { success: true }, loginRole = 'owner', initializeSelection = true) {
  const elements = new Map();
  class Element {
    constructor() {
      this.style = {}; this.dataset = {}; this.children = []; this.attributes = {}; this.value = ''; this.disabled = false;
      this.className = ''; this.textContent = ''; this._html = '';
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' ').trim(); },
        remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
        toggle: (name, enabled) => { if (enabled) this.classList.add(name); else this.classList.remove(name); }
      };
    }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    addEventListener() {}
    focus() { this.focused = true; }
    scrollIntoView() {}
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
  const document = {
    body: new Element(),
    addEventListener() {},
    getElementById: id => { assert.ok(elements.has(id), `Element exists: ${id}`); return elements.get(id); },
    createElement: () => new Element(),
    querySelectorAll: selector => {
      if (selector === '#card-board .card') return elements.get('card-board').children;
      if (selector === '#card-area .card-item') return elements.get('card-area').children;
      return [];
    },
    querySelector: selector => selector.includes('card:not') ? elements.get('card-board').children.find(card => !card.classList.contains('selected')) : new Element()
  };
  const requests = [];
  const context = vm.createContext({ document, console, Math, Date, String, Number, Promise, Array, setTimeout, alert() {}, confirm: () => true, window: { scrollTo() {} }, location: { reload() {} }, navigator: {}, crypto: require('node:crypto').webcrypto, fetch: async (url, options) => {
    const payload = JSON.parse(options.body); requests.push(payload);
    const response = payload.action === 'login' ? { success: true, role: loginRole, username: payload.username, sessionToken: 'qa-token' } : payload.action === 'updateAccount' ? { success: true, username: payload.username, sessionToken: 'qa-new-token' } : saveResponse;
    return { ok: true, json: async () => response };
  } });
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  if (initializeSelection) run("sessionToken = 'qa-token'; loginUserGlobal = 'qa-owner'; startReading(12, false); continueToSelection();");
  return { elements, requests, run };
}

test('12 cards are not revealed or saved until explicit confirmation', async () => {
  const { run, requests, elements } = setup();
  run('autoPickCards()');
  assert.equal(run('selectedCards.length'), 12);
  assert.equal(requests.length, 0);
  assert.equal(elements.get('confirm-selection').disabled, false);
  assert.equal(elements.get('selection-count').textContent, 'เลือกแล้ว 12 จาก 12 ใบ');
  await run('showResults()');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].type, '12 ใบ');
  assert.equal(requests[0].cards.split(', ').length, 12);
  assert.match(elements.get('save-status').textContent, /บันทึกแล้ว/);
  await run('showResults()');
  run('selectCard(deck[0]); autoPickCards(); shuffleAndReset()');
  assert.equal(requests.length, 1);
  assert.equal(run('selectedCards.length'), 12);
});

test('owner login opens the home choice without selecting a reading or calling user management', async () => {
  const state = setup({ success: true }, 'owner', false);
  state.elements.get('login-user').value = 'qa-owner';
  state.elements.get('login-pass').value = 'local-test-only';
  await state.run('attemptLogin()');
  assert.equal(state.elements.get('tarot-view').style.display, 'block');
  assert.equal(state.run('currentStage'), 'home');
  assert.equal(state.elements.get('reading-home').hidden, false);
  assert.equal(state.elements.get('card-selection-area').style.display, 'none');
  assert.equal(state.run('sessionToken'), 'qa-token');
  assert.deepEqual(state.requests.map(request => request.action), ['login']);
  assert.equal(state.elements.get('login-pass').value, '');
  assert.equal(state.elements.has('admin-toolbar'), false);
});

test('home offers direct three-card and twelve-card starts', () => {
  const state = setup({ success: true }, 'owner', false);
  state.run('showHome(); startReading(3)');
  assert.equal(state.run('currentMode'), 3);
  assert.equal(state.run('currentStage'), 'details');
  assert.equal(state.elements.get('reading-home').hidden, true);
  assert.equal(state.elements.get('question-block').style.display, 'block');
  state.run('showHome(); startReading(12)');
  assert.equal(state.run('currentMode'), 12);
  assert.equal(state.elements.get('user-info-12').style.display, 'block');
  state.run('showHome()');
  assert.equal(state.elements.get('home-button').attributes['aria-pressed'], 'true');
  assert.equal(state.elements.get('new-12').attributes['aria-pressed'], 'false');
  assert.equal(state.elements.get('new-3').attributes['aria-pressed'], 'false');
});

test('legacy client and admin roles cannot enter the owner workspace', async () => {
  for (const role of ['client', 'admin']) {
    const state = setup({ success: true }, role, false);
    state.elements.get('login-user').value = 'someone'; state.elements.get('login-pass').value = 'test';
    await state.run('attemptLogin()');
    assert.notEqual(state.elements.get('tarot-view').style.display, 'block');
    assert.equal(state.run('sessionToken'), '');
  }
});

test('owner can start repeated 12-card and direct 3-card readings with new request IDs', async () => {
  const state = setup();
  const first = state.run('requestId');
  state.run('autoPickCards()'); await state.run('showResults()');
  state.run('startReading(12)');
  assert.equal(state.run('currentMode'), 12); assert.equal(state.run('selectedCards.length'), 0);
  assert.notEqual(state.run('requestId'), first);
  state.run('startReading(3)');
  assert.equal(state.run('currentMode'), 3); assert.equal(state.run('currentStage'), 'details');
});

test('card names collapse for each new result and copying does not depend on visibility', async () => {
  const state = setup();
  state.elements.get('card-list-details').open = true;
  state.run('autoPickCards()'); await state.run('showResults()');
  assert.equal(state.elements.get('card-list-details').open, false);
  assert.equal(state.elements.get('selected-list').children.length, 12);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<details id="card-list-details"[^>]*><summary>รายชื่อไพ่<\/summary>/);
});

test('saving uses the session and request ID without resending passwords or customer tokens', async () => {
  const state = setup(); state.run('autoPickCards()'); await state.run('showResults()');
  const request = state.requests[0];
  assert.equal(request.sessionToken, 'qa-token'); assert.equal(request.requestId, state.run('requestId'));
  assert.equal(request.password, undefined); assert.equal(request.adminPass, undefined); assert.equal(request.username, undefined);
  assert.equal(request.type, '12 ใบ');
});

test('account changes validate password confirmation then rotate the local session and clear secrets', async () => {
  const state = setup(); state.run('openAccount()');
  state.elements.get('account-user').value = 'my-new-name';
  state.elements.get('account-current').value = 'local-test-only';
  state.elements.get('account-new').value = 'new-test-password';
  state.elements.get('account-confirm').value = 'different-value';
  await state.run('updateAccount()'); assert.equal(state.requests.length, 0);
  state.elements.get('account-confirm').value = 'new-test-password';
  await state.run('updateAccount()');
  assert.equal(state.run('sessionToken'), 'qa-new-token');
  assert.equal(state.run('loginUserGlobal'), 'my-new-name');
  assert.equal(state.elements.get('account-current').value, '');
  assert.equal(state.elements.get('account-new').value, '');
  assert.equal(state.run('selectedCards.length'), 0);
});

test('retry preserves the request ID after an uncertain save response', async () => {
  const state = setup({ success: false });
  state.run('autoPickCards()'); await state.run('showResults()'); await state.run('retrySave()');
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[0].requestId, state.requests[1].requestId);
});

test('deselecting a card updates numbering and allows a replacement', () => {
  const { run, elements } = setup();
  run('selectCard(deck[0]); selectCard(deck[1]); selectCard(deck[2]); selectCard(deck[1]);');
  assert.equal(run('selectedCards.length'), 2);
  assert.equal(run('document.getElementById(`client-card-${deck[2]}`).innerHTML'), '2');
  assert.equal(run('document.getElementById(`client-card-${deck[2]}`).classList.contains("latest-picked")'), true);
  run('selectCard(deck[2])');
  assert.equal(run('document.getElementById(`client-card-${deck[0]}`).classList.contains("latest-picked")'), true);
  assert.equal(elements.get('confirm-selection').disabled, true);
  run('autoPickCards()');
  assert.equal(run('new Set(selectedCards).size'), 12);
});

test('three-card questions are required before reaching the selection board', () => {
  const { run, elements } = setup();
  run('currentMode = 3; resetReading(); backToDetails(); continueToSelection();');
  assert.equal(run('currentStage'), 'details');
  assert.match(elements.get('question-error').textContent, /กรุณาระบุคำถาม/);
  elements.get('user-question-3').value = 'คำถามทดสอบ'; run('continueToSelection()');
  assert.equal(run('currentStage'), 'select');
});

test('special cards extend the draw to six and shuffling resets the allowance', () => {
  const { run } = setup();
  run('currentMode = 3; resetReading(); document.getElementById("user-question-3").value = "ทดสอบ"; backToDetails(); continueToSelection();');
  run('[101,102,201,208,211,103].forEach(id => selectCard(id));');
  assert.equal(run('maxAllowed'), 6);
  assert.equal(run('selectedCards.length'), 6);
  run('shuffleAndReset()');
  assert.equal(run('maxAllowed'), 3);
  assert.equal(run('selectedCards.length'), 0);
});

test('special-card allowance is recalculated when an earlier card is removed', () => {
  const { run } = setup();
  run('currentMode = 3; resetReading(); currentStage = "select"; [101,102,201,208,211].forEach(id => selectCard(id)); selectCard(101);');
  assert.equal(run('maxAllowed'), 5);
  assert.equal(run('selectedCards.length'), 4);
});

test('a failed save never displays success and prevents follow-up until confirmed', async () => {
  const { run, elements } = setup({ success: false });
  run('autoPickCards()'); await run('showResults()');
  assert.match(elements.get('save-status').textContent, /ยังยืนยันการบันทึกไม่ได้/);
  assert.equal(elements.get('follow-up-button').disabled, true);
  run('startFlow3Cards()');
  assert.equal(run('currentMode'), 12);
});

test('follow-up returns to a blank question and a fresh three-card allowance', async () => {
  const { run, elements } = setup();
  run('autoPickCards()'); await run('showResults()'); run('startFlow3Cards()');
  assert.equal(run('currentMode'), 3);
  assert.equal(run('currentStage'), 'details');
  assert.equal(run('selectedCards.length'), 0);
  assert.equal(run('maxAllowed'), 3);
  assert.equal(elements.get('user-question-3').value, '');
});

test('personal question text is escaped in the visual result', async () => {
  const { run, elements } = setup();
  elements.get('user-context').value = '<img src=x onerror=alert(1)>';
  run('autoPickCards()'); await run('showResults()');
  assert.match(elements.get('user-context-display').innerHTML, /&lt;img/);
  assert.doesNotMatch(elements.get('user-context-display').innerHTML, /<img/);
});

test('selected topics and custom wording reach both the saved question and full result', async () => {
  const { run, requests, elements } = setup();
  elements.get('user-question-12').value = 'อยากทราบแนวโน้มในช่วงสามเดือน';
  run('const topic = document.createElement("button"); topic.dataset.topic = "การเงิน"; toggleQuestionTopic(topic); topic.dataset.topic = "การงาน"; toggleQuestionTopic(topic); toggleQuestionTopic(topic); autoPickCards();');
  await run('showResults()');
  assert.match(requests[0].question, /หัวข้อ: การเงิน/);
  assert.match(requests[0].fullPattern, /หัวข้อ: การเงิน/);
  assert.match(requests[0].question, /อยากทราบแนวโน้มในช่วงสามเดือน/);
  assert.doesNotMatch(requests[0].question, /การงาน/);
  assert.doesNotMatch(elements.get('user-context-display').innerHTML, /หัวข้อ: การเงิน/);
  assert.equal(elements.get('user-context-display').style.display, 'none');
});
