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
  for (const action of controls) assert(['left', 'right', 'throttle', 'brake', 'handbrake'].includes(action), `Unknown touch action ${action}`);
});
