import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createStorage } from '../js/storage.js';
import { KEYS, createStore } from '../js/store.js';

/** In-memory Web Storage stand-in. Set `full` to make writes fail. */
function memoryBackend(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    full: false,
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem(k, v) {
      if (this.full) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
}

function setup(initial) {
  const backend = memoryBackend(initial);
  const store = createStore(createStorage(() => backend));
  const read = (k) => JSON.parse(backend.data.get(k));
  return { backend, store, read };
}

describe('storage', () => {
  it('falls back when storage is unavailable or corrupt', () => {
    const broken = createStorage(() => {
      throw new Error('SecurityError');
    });
    assert.equal(broken.load('k', 'fallback'), 'fallback');
    assert.equal(broken.save('k', 1), false);
    const corrupt = createStorage(() => ({ getItem: () => '{nope', setItem() {} }));
    assert.equal(corrupt.load('k', 'fallback'), 'fallback');
  });
});

describe('store', () => {
  it('loads and sanitizes existing data', () => {
    const { store } = setup({
      [KEYS.settings]: { work: 999, group: 'g1' },
      [KEYS.groups]: [{ id: 'g1', name: 'Legs', exercises: ['Squats'] }, { bad: true }],
      [KEYS.log]: [{ at: '2026-10-01T10:00:00Z', work: 30, rounds: 4, sets: 1 }, { at: 'x' }],
    });
    assert.equal(store.state.settings.work, 300);
    assert.equal(store.currentGroup()?.name, 'Legs');
    assert.equal(store.state.groups.length, 1);
    assert.equal(store.state.log.length, 1);
  });

  it('persists settings and notifies subscribers', () => {
    const { store, read } = setup();
    let calls = 0;
    store.subscribe(() => calls++);
    store.updateSettings({ rounds: 99 });
    assert.equal(store.state.settings.rounds, 50);
    assert.equal(read(KEYS.settings).rounds, 50);
    assert.equal(calls, 1);
  });

  it('saves, selects, edits and deletes groups', () => {
    const { store, read } = setup();
    store.saveGroup(null, 'Core', ['Plank', 'Crunch', 'Bridge']);
    const id = store.state.settings.group;
    assert.ok(id);
    assert.equal(store.state.settings.rounds, 3);
    assert.equal(read(KEYS.groups).length, 1);

    store.saveGroup(id, 'Core 2', ['Plank']);
    assert.equal(store.state.groups.length, 1);
    assert.equal(store.currentGroup()?.name, 'Core 2');
    assert.equal(store.state.settings.rounds, 1);

    store.selectGroup(null);
    assert.equal(store.state.settings.group, null);
    assert.equal(store.state.settings.rounds, 1);

    store.selectGroup(id);
    store.deleteGroup(id);
    assert.deepEqual(read(KEYS.groups), []);
    assert.equal(read(KEYS.settings).group, null);
  });

  it('stores timing with a group and applies it on select', () => {
    const { store, read } = setup({
      [KEYS.groups]: [{ id: 'old', name: 'Old', exercises: ['a', 'b'] }],
    });
    store.updateSettings({ work: 45, rest: 15, sets: 2, setRest: 90 });
    store.saveGroup(null, 'Core', ['Plank: hold', 'Crunch']);
    const id = store.state.settings.group;
    assert.deepEqual(read(KEYS.groups)[1].timing, { work: 45, rest: 15, sets: 2, setRest: 90 });

    store.updateSettings({ work: 20, rest: 0, sets: 1, setRest: 0, rounds: 7 });
    store.selectGroup('old');
    const s = store.state.settings;
    assert.deepEqual([s.work, s.rest, s.sets, s.setRest, s.rounds], [20, 0, 1, 0, 2]);

    store.selectGroup(id);
    const t = store.state.settings;
    assert.deepEqual([t.work, t.rest, t.sets, t.setRest, t.rounds], [45, 15, 2, 90, 2]);

    const target = setup();
    target.store.restore(store.backup());
    assert.deepEqual(target.store.state.groups.find((g) => g.id === id)?.timing, {
      work: 45,
      rest: 15,
      sets: 2,
      setRest: 90,
    });
  });

  it('adds and deletes sessions, reporting failed saves', () => {
    const { store, backend, read } = setup();
    const s = { id: 'a', at: '2026-10-01T10:00:00Z', work: 30, rest: 0, rounds: 4, planned: 4 };
    assert.equal(store.addSession(s), true);
    assert.equal(read(KEYS.log).length, 1);
    backend.full = true;
    assert.equal(store.addSession({ ...s, id: 'b' }), false);
    assert.equal(store.state.log.length, 2);
    backend.full = false;
    store.deleteSession('a');
    assert.deepEqual(
      read(KEYS.log).map((x) => x.id),
      ['b'],
    );
  });

  it('restores a backup by merging, and is idempotent', () => {
    const source = setup();
    source.store.saveGroup(null, 'Legs', ['Squats']);
    source.store.addSession({
      id: 'a',
      at: '2026-10-01T10:00:00Z',
      work: 30,
      rest: 0,
      rounds: 4,
      planned: 4,
    });
    const text = source.store.backup();

    const target = setup();
    assert.deepEqual(target.store.restore(text), { workouts: 1, groups: 1 });
    assert.deepEqual(target.store.restore(text), { workouts: 0, groups: 0 });
    assert.equal(target.read(KEYS.log).length, 1);
    assert.throws(() => target.store.restore('not json'));
  });
});

describe('service worker', () => {
  it('caches every file the app loads', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    const cached = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));

    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const needed = [
      'index.html',
      'app.css',
      'manifest.webmanifest',
      ...walk(join(root, 'js')).map((f) => relative(root, f).split('\\').join('/')),
    ];
    for (const f of needed) assert.ok(cached.has(f), `${f} missing from FILES in sw.js`);
    for (const f of cached)
      assert.doesNotThrow(() => readFileSync(join(root, f)), `${f} in sw.js does not exist`);
  });
});
