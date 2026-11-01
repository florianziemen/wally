// App state: settings, groups and the workout log. The single place that
// reads and writes storage. Views call these methods and re-render on change.

import { newId, sanitizeGroups, timingOf } from './groups.js';
import { mergeById, parseBackup, sanitizeLog, toBackup } from './log.js';
import { clampField, sanitizeSettings } from './settings.js';

export const KEYS = Object.freeze({
  settings: 'hiit-settings-v1',
  groups: 'hiit-groups-v1',
  log: 'hiit-log-v1',
});

/**
 * @typedef {object} State
 * @property {import('./settings.js').Settings} settings
 * @property {import('./groups.js').Group[]} groups
 * @property {import('./log.js').Session[]} log
 */

/** @param {import('./storage.js').JsonStorage} storage */
export function createStore(storage) {
  const groups = sanitizeGroups(storage.load(KEYS.groups, []));
  /** @type {State} */
  const state = {
    groups,
    settings: sanitizeSettings(storage.load(KEYS.settings, null), groups),
    log: sanitizeLog(storage.load(KEYS.log, [])),
  };
  /** @type {Set<(state: State) => void>} */
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state));

  /** @param {import('./settings.js').Settings} next */
  function commitSettings(next) {
    state.settings = next;
    storage.save(KEYS.settings, next);
  }

  /** @param {string|null} id */
  function findGroup(id) {
    return state.groups.find((g) => g.id === id) ?? null;
  }

  /** Select a group, apply its timing and match rounds to its length. @param {string|null} id */
  function applyGroup(id) {
    const g = findGroup(id);
    const next = { ...state.settings, ...g?.timing, group: g ? g.id : null };
    if (g) next.rounds = clampField('rounds', g.exercises.length);
    commitSettings(next);
  }

  return {
    state,

    /** @param {(state: State) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    currentGroup() {
      return findGroup(state.settings.group);
    },

    /** @param {Partial<import('./settings.js').Settings>} patch */
    updateSettings(patch) {
      commitSettings(sanitizeSettings({ ...state.settings, ...patch }, state.groups));
      emit();
    },

    /** @param {string|null} id */
    selectGroup(id) {
      applyGroup(id);
      emit();
    },

    /**
     * Create or update a group with the current timing, then select it.
     * @param {string|null} id  null creates a new group
     * @param {string} name
     * @param {string[]} exercises
     */
    saveGroup(id, name, exercises) {
      const existing = findGroup(id);
      const group = {
        id: existing ? existing.id : newId(),
        name,
        exercises,
        timing: timingOf(state.settings),
      };
      state.groups = existing
        ? state.groups.map((g) => (g.id === group.id ? group : g))
        : [...state.groups, group];
      storage.save(KEYS.groups, state.groups);
      applyGroup(group.id);
      emit();
    },

    /** @param {string} id */
    deleteGroup(id) {
      state.groups = state.groups.filter((g) => g.id !== id);
      storage.save(KEYS.groups, state.groups);
      if (state.settings.group === id) commitSettings({ ...state.settings, group: null });
      emit();
    },

    /**
     * @param {import('./log.js').Session} session
     * @returns {boolean} false if it could not be saved (kept in memory only)
     */
    addSession(session) {
      state.log = [...state.log, session];
      const ok = storage.save(KEYS.log, state.log);
      emit();
      return ok;
    },

    /** @param {string} id */
    deleteSession(id) {
      state.log = state.log.filter((s) => s.id !== id);
      storage.save(KEYS.log, state.log);
      emit();
    },

    backup() {
      return toBackup(state.log, state.groups);
    },

    /**
     * Merge a backup into the current data. Throws if the text is not a backup.
     * @param {string} text
     */
    restore(text) {
      const data = parseBackup(text);
      const log = mergeById(state.log, data.workouts);
      const grp = mergeById(state.groups, data.groups);
      state.log = log.merged;
      state.groups = grp.merged;
      if (log.added) storage.save(KEYS.log, state.log);
      if (grp.added) storage.save(KEYS.groups, state.groups);
      emit();
      return { workouts: log.added, groups: grp.added };
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
