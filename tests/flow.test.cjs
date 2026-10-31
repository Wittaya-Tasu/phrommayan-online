const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function setup(saveResponse = { success: true }, loginRole = 'client', initializeSelection = true) {
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
  const context = vm.createContext({ document, console, Math, Date, String, Number, Promise, Array, setTimeout, alert() {}, confirm: () => true, window: { scrollTo() {} }, location: { reload() {} }, navigator: {}, fetch: async (url, options) => {
    const payload = JSON.parse(options.body); requests.push(payload);
    const response = payload.action === 'login' ? { success: true, role: loginRole } : payload.action === 'list' ? { success: true, data: [] } : saveResponse;
    return { ok: true, json: async () => response };
  } });
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  if (initializeSelection) run('acceptPrayer(); continueToSelection();');
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
  assert.match(elements.get('save-status').textContent, /บันทึกผลสำเร็จ/);
  await run('showResults()');
  run('selectCard(deck[0]); autoPickCards(); shuffleAndReset()');
  assert.equal(requests.length, 1);
  assert.equal(run('selectedCards.length'), 12);
});

async function loginAdmin(state) {
  state.elements.get('login-user').value = 'qa-admin';
  state.elements.get('login-pass').value = 'local-test';
  await state.run('attemptLogin()');
}

test('one admin login provides both token management and direct three-card access', async () => {
  const state = setup({ success: true }, 'admin', false);
  await loginAdmin(state);
  assert.equal(state.elements.get('admin-toolbar').hidden, false);
  assert.equal(state.elements.get('admin-view').style.display, 'block');
  state.run('showAdminWorkspace("reading"); startAdminReading(3);');
  assert.equal(state.elements.get('tarot-view').style.display, 'block');
  assert.equal(state.run('currentMode'), 3);
  assert.equal(state.run('currentStage'), 'details');
  assert.equal(state.requests.filter(request => request.action === 'login').length, 1);
});

test('switching admin screens preserves the question and chosen cards', async () => {
  const state = setup({ success: true }, 'admin', false);
  await loginAdmin(state);
  state.run('showAdminWorkspace("reading"); acceptPrayer(); continueToSelection(); selectCard(deck[0]);');
  state.elements.get('user-context').value = 'รายละเอียดทดสอบ';
  const selected = state.run('selectedCards[0]');
  state.run('showAdminWorkspace("manage"); showAdminWorkspace("reading");');
  assert.equal(state.run('selectedCards[0]'), selected);
  assert.equal(state.run('currentStage'), 'select');
  assert.equal(state.elements.get('user-context').value, 'รายละเอียดทดสอบ');
});

test('admin preview reveals results and enables follow-up without a save API request', async () => {
  const state = setup({ success: true }, 'admin', false);
  await loginAdmin(state);
  state.run('showAdminWorkspace("reading"); acceptPrayer(); continueToSelection(); autoPickCards();');
  await state.run('showResults()');
  assert.equal(state.requests.filter(request => request.action === 'saveResult').length, 0);
  assert.equal(state.elements.get('follow-up-button').disabled, false);
  assert.match(state.elements.get('save-status').textContent, /ไม่บันทึกลงชีตและไม่ใช้สิทธิ์เจ้าชะตา/);
  state.run('startAdminReading(12); acceptPrayer();');
  assert.equal(state.run('selectedCards.length'), 0);
  assert.equal(state.run('currentMode'), 12);
});

test('optional admin saves are explicitly marked and never use the client token-consuming type', async () => {
  const state = setup({ success: true }, 'admin', false);
  await loginAdmin(state);
  state.elements.get('admin-save-results').checked = true;
  state.run('showAdminWorkspace("reading"); acceptPrayer(); continueToSelection(); autoPickCards();');
  await state.run('showResults()');
  const save = state.requests.find(request => request.action === 'saveResult');
  assert.equal(save.type, 'ทดสอบแอดมิน 12 ใบ');
  assert.notEqual(save.type, '12 ใบ');
  assert.match(save.fullPattern, /ผลทดสอบโดยแอดมิน/);
  assert.equal(save.username, 'qa-admin');
  assert.equal(save.password, undefined);
  assert.equal(save.adminPass, undefined);
  assert.match(state.elements.get('save-status').textContent, /บันทึกผลทดสอบแอดมินสำเร็จ/);
});

test('client screens cannot activate admin tools or an admin preview', async () => {
  const state = setup();
  state.run('showAdminWorkspace("manage"); startAdminReading(3);');
  assert.notEqual(state.elements.get('admin-view').style.display, 'block');
  assert.equal(state.run('currentMode'), 12);
  state.run('autoPickCards()'); await state.run('showResults()');
  assert.equal(state.requests.find(request => request.action === 'saveResult').type, '12 ใบ');
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
