const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function setup(saveResponse = { success: true }) {
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
  const context = vm.createContext({ document, console, Math, Date, String, Number, Promise, Array, setTimeout, alert() {}, confirm: () => true, window: { scrollTo() {} }, location: { reload() {} }, navigator: {}, fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => saveResponse }; } });
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  run('acceptPrayer(); continueToSelection();');
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

test('deselecting a card updates numbering and allows a replacement', () => {
  const { run, elements } = setup();
  run('selectCard(deck[0]); selectCard(deck[1]); selectCard(deck[2]); selectCard(deck[1]);');
  assert.equal(run('selectedCards.length'), 2);
  assert.equal(run('document.getElementById(`client-card-${deck[2]}`).innerHTML'), '2');
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
