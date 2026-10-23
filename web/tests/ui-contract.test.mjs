import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const ui = await readFile(new URL('ui.js', root), 'utf8');
const main = await readFile(new URL('main.js', root), 'utf8');

// These files are owned by different modules; a missing selector would break
// loading or user controls even when each JavaScript module parses correctly.
test('UI and application selectors resolve to unique HTML elements', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate DOM IDs');
  const expected = [
    ...[...ui.matchAll(/(?:byId|onClick)\('([^']+)'/g)].map(match => match[1]),
    ...[...main.matchAll(/querySelector\('#([^']+)'\)/g)].map(match => match[1]),
    ...[...html.matchAll(/data-close="([^"]+)"/g)].map(match => match[1]),
    ...[...html.matchAll(/<use\s+href="#([^"]+)"/g)].map(match => match[1]),
  ];
  for (const id of expected) assert(ids.includes(id), `Missing element #${id}`);
});

test('entrypoint, styles, poster, video, and local import map targets exist', async () => {
  const sources = [...html.matchAll(/\b(?:src|href|poster)="(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)].map(match => match[1]);
  const css = await readFile(new URL('style.css', root), 'utf8');
  sources.push(...[...css.matchAll(/url\(['"]?(\.\/[^)'"?#]+)['"]?\)/g)].map(match => match[1]));
  for (const source of new Set(sources)) {
    assert((await stat(new URL(source, root))).isFile(), `Missing local resource ${source}`);
  }
  const map = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)?.[1] ?? '{}');
  assert(map.imports?.three, 'Three.js needs an import map');
  for (const [specifier, target] of Object.entries(map.imports)) {
    assert(target.startsWith('./'), `${specifier} must use a self-hosted dependency`);
    const info = await stat(new URL(target, root));
    assert(specifier.endsWith('/') ? info.isDirectory() : info.isFile(), `Invalid import target ${target}`);
  }
});

test('visible controls have an accessible name and touch actions are unambiguous', () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert(buttons.length > 0);
  for (const [, attributes, content] of buttons) {
    const text = content.replace(/<[^>]*>/g, '').trim();
    assert(text || /aria-label="[^"]+"/.test(attributes), `Unnamed button: ${attributes}`);
  }
  const controls = [...html.matchAll(/data-control="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(controls).size, controls.length, 'Duplicate touch controls');
  for (const action of controls) assert(['left', 'right', 'throttle', 'brake', 'reverse', 'handbrake'].includes(action), `Unknown touch action ${action}`);
});


test('portrait controls support simultaneous steering and pedals and release safely', async () => {
  class Element {
    constructor(id = '', control) {
      this.id = id; this.dataset = control ? { control } : {};
      this.listeners = new Map(); this.attrs = new Map();
      this.style = { setProperty(name, value) { this[name] = value; } };
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value),
        contains: value => classes.has(value), toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); } };
    }
    addEventListener(type, callback) { const callbacks = this.listeners.get(type) ?? []; callbacks.push(callback); this.listeners.set(type, callbacks); }
    emit(type, details = {}) { const event = { preventDefault() {}, stopPropagation() {}, target: this, ...details }; for (const callback of this.listeners.get(type) ?? []) callback(event); }
    setAttribute(name, value) { this.attrs.set(name, value); }
    removeAttribute(name) { this.attrs.delete(name); }
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, width: 120 }; }
    focus() {}
  }
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  const pedals = ['throttle', 'brake', 'reverse', 'handbrake'].map(control => new Element('', control));
  const fakeWindow = new Element();
  const fakeDocument = new Element();
  fakeDocument.getElementById = id => elements.get(id);
  fakeDocument.querySelector = () => null;
  fakeDocument.querySelectorAll = selector => selector === '[data-control]' ? pedals : selector === '[data-control].is-pressed' ? pedals.filter(p => p.classList.contains('is-pressed')) : [];
  fakeDocument.body = new Element();
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.document = fakeDocument; globalThis.window = fakeWindow;
  try {
    const { createUI } = await import('../dist/ui.js');
    const touch = {}, steering = [];
    let newCities = 0;
    const ui = createUI({ touch(control, value) { touch[control] = value; }, steer(value) { steering.push(value); }, newCity() { newCities++; } });
    const throttle = pedals[0], reverse = pedals[2], pad = elements.get('steering-pad');
    throttle.emit('pointerdown', { pointerId: 1, button: 0 });
    pad.emit('pointerdown', { pointerId: 2, button: 0, clientX: 12 });
    assert.equal(touch.throttle, true);
    assert.equal(steering.at(-1), 1, 'left thumb turns left while accelerator is held');
    pad.emit('pointermove', { pointerId: 2, clientX: 108 });
    assert.equal(steering.at(-1), -1, 'same gesture can turn right');
    pad.emit('pointercancel', { pointerId: 2 });
    assert.equal(steering.at(-1), 0, 'cancelled steering springs to center');
    assert.equal(touch.throttle, true, 'releasing steering does not release another finger');
    throttle.emit('lostpointercapture', { pointerId: 1 });
    assert.equal(touch.throttle, false, 'lost touch capture releases accelerator');
    reverse.emit('pointerdown', { pointerId: 3, button: 0 });
    throttle.emit('keydown', { code: 'Space', repeat: false });
    assert.equal(touch.reverse, true); assert.equal(touch.throttle, true);
    fakeWindow.emit('blur');
    assert.equal(touch.reverse, false); assert.equal(touch.throttle, false); assert.equal(steering.at(-1), 0);
    pad.emit('keydown', { code: 'ArrowLeft' });
    assert.equal(steering.at(-1), 1);
    pad.emit('keyup', { code: 'ArrowLeft' });
    assert.equal(steering.at(-1), 0);
    ui.update({ musicOn: true, soundOn: false, trackLabel: 'Sunset Frequencies', cameraLabel: '自由环视' });
    assert.equal(elements.get('music-button').attrs.get('aria-pressed'), 'true');
    assert.equal(elements.get('sound-button').attrs.get('aria-pressed'), 'false', 'engine and music have separate switches');
    assert.equal(elements.get('track-label').textContent, 'Sunset Frequencies');
    ui.update({ distance: 12345, checkpoint: 1234, total: 0, destinationDistance: 128, seed: 734, district: 'DOWNTOWN · 天际线' });
    assert.equal(elements.get('distance-value').textContent, '12.35 km');
    assert.equal(elements.get('checkpoint-count').textContent, '1,234 个路口', 'infinite exploration never clamps to a finite checkpoint quota');
    assert.equal(elements.get('destination-distance').textContent, '128 m');
    assert.equal(elements.get('world-seed').textContent, '000734');
    assert.equal(elements.get('city-label').textContent, '000734');
    assert.equal(elements.get('district').textContent, 'DOWNTOWN · 天际线');
    ui.update({ distance: 12345, destinationDistance: 2400, seed: 734 });
    assert.equal(elements.get('destination-distance').textContent, '2.4 km');
    elements.get('new-city-button').emit('click');
    assert.equal(newCities, 0, 'city changes wait for scene readiness');
    ui.setReady();
    assert.equal(elements.get('new-city-button').disabled, false);
    throttle.emit('pointerdown', { pointerId: 7, button: 0 });
    elements.get('new-city-button').emit('click');
    assert.equal(newCities, 1);
    assert.equal(touch.throttle, false, 'new city clears held input before resetting the world');
  } finally {
    globalThis.document = previousDocument; globalThis.window = previousWindow;
  }
});
