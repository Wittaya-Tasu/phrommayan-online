const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File, Blob } = require('node:buffer');

function setup({ shareable = true, shareError, encodeFailure = false } = {}) {
  const elements = new Map(), shared = [], objectUrls = [], revoked = [], anchors = [];
  let captureOptions, clonedArea;
  class Element {
    constructor() { this.style = {}; this.attributes = {}; this.classList = { toggle() {} }; this.disabled = false; this.textContent = ''; this.scrollHeight = 3000; }
    addEventListener() {}
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    focus() { this.focused = true; }
    appendChild() {}
    querySelectorAll() { return [{ decode: async () => {} }]; }
    cloneNode() { clonedArea = new Element(); return clonedArea; }
    remove() { this.removed = true; }
    click() { this.clicked = true; }
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
  const document = {
    body: new Element(), fonts: { ready: Promise.resolve() }, addEventListener() {},
    getElementById: id => { assert.ok(elements.has(id), id); return elements.get(id); },
    querySelectorAll: () => [], querySelector: () => elements.get('image-export-close'),
    createElement: tag => { const element = new Element(); if (tag === 'a') anchors.push(element); return element; }
  };
  const canvas = { width: 2000, height: 6000, toBlob(callback, type) { callback(encodeFailure ? null : new Blob(['image-bytes'], { type })); }, toDataURL() { throw new Error('Data URLs must not be used'); } };
  const context = vm.createContext({
    document, console, Math, Date, String, Number, Promise, Array, setTimeout, File, Blob,
    navigator: { maxTouchPoints: 5, canShare: () => shareable, share: data => { shared.push(data); return shareError ? Promise.reject(shareError) : Promise.resolve(); } },
    URL: { createObjectURL: file => { objectUrls.push(file); return 'blob:qa-image'; }, revokeObjectURL: url => revoked.push(url) },
    html2canvas: async (_, options) => { captureOptions = options; return canvas; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  return { elements, shared, objectUrls, revoked, anchors, canvas, run: code => vm.runInContext(code, context), captureOptions: () => captureOptions, clone: () => clonedArea };
}

test('image generation prepares a PNG preview without automatically sharing or downloading', async () => {
  const state = setup(); await state.run('saveAsImage()');
  assert.equal(state.elements.get('image-export-overlay').style.display, 'flex');
  assert.equal(state.elements.get('image-export-preview').src, 'blob:qa-image');
  assert.equal(state.elements.get('image-export-share').hidden, false);
  assert.equal(state.elements.get('image-export-hint').hidden, false);
  assert.equal(state.shared.length, 0); assert.equal(state.anchors.length, 0);
  assert.equal(state.objectUrls[0].type, 'image/png'); assert.match(state.objectUrls[0].name, /12ใบ\.png$/);
  assert.equal(state.clone().removed, true); assert.equal(state.canvas.width, 0);
  assert.ok(state.captureOptions().scale <= Math.sqrt(2));
});

test('the second user tap shares the prepared image file synchronously before awaiting', async () => {
  const state = setup(); await state.run('saveAsImage()');
  const promise = state.run('shareResultImage()');
  assert.equal(state.shared.length, 1);
  assert.equal(state.shared[0].files[0], state.objectUrls[0]);
  assert.equal(state.shared[0].url, undefined);
  await promise;
  assert.equal(state.elements.get('image-export-status').textContent, '');
  assert.equal(state.elements.get('image-export-share').disabled, false);
});

test('canceling native sharing keeps the preview available and never claims Photos saved it', async () => {
  const error = new Error('Canceled'); error.name = 'AbortError';
  const state = setup({ shareError: error }); await state.run('saveAsImage()'); await state.run('shareResultImage()');
  assert.equal(state.elements.get('image-export-status').textContent, '');
  assert.equal(state.run('resultImageUrl'), 'blob:qa-image');
  assert.equal(state.elements.get('image-export-close').disabled, false);
});

test('unsupported file sharing retains the image for long-press, full-image and manual download', async () => {
  const state = setup({ shareable: false }); await state.run('saveAsImage()');
  assert.equal(state.elements.get('image-export-share').hidden, true);
  assert.equal(state.elements.get('image-export-open').href, 'blob:qa-image');
  assert.match(state.elements.get('image-export-hint').textContent, /แตะภาพค้าง/);
  state.run('downloadResultImage()'); assert.equal(state.anchors.length, 1);
  assert.equal(state.anchors[0].href, 'blob:qa-image'); assert.equal(state.anchors[0].clicked, true);
});

test('a denied share keeps the full-resolution preview available for a manual save', async () => {
  const error = new Error('Gesture unavailable'); error.name = 'NotAllowedError';
  const state = setup({ shareError: error }); await state.run('saveAsImage()'); await state.run('shareResultImage()');
  assert.match(state.elements.get('image-export-status').textContent, /แตะภาพค้าง/);
  assert.equal(state.run('resultImageUrl'), 'blob:qa-image');
  assert.equal(state.elements.get('image-export-close').disabled, false);
});

test('closing the preview revokes private image data and releases the modal', async () => {
  const state = setup(); await state.run('saveAsImage()'); state.run('closeImagePreview()');
  assert.deepEqual(state.revoked, ['blob:qa-image']);
  assert.equal(state.run('resultImageFile'), null); assert.equal(state.run('resultImageUrl'), '');
  assert.equal(state.elements.get('image-export-overlay').style.display, 'none');
  assert.equal(state.elements.get('tarot-content').inert, false);
});

test('failed PNG encoding restores the button without offering an invalid image', async () => {
  const state = setup({ encodeFailure: true }); await state.run('saveAsImage()');
  assert.equal(state.elements.get('btnSaveImg').disabled, false);
  assert.equal(state.elements.get('copy-status').textContent, 'สร้างภาพไม่สำเร็จ');
  assert.equal(state.objectUrls.length, 0); assert.notEqual(state.elements.get('image-export-overlay').style.display, 'flex');
});
