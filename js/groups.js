// Exercise groups: named, ordered lists of exercises.

import { breakLength, count, short } from './format.js';
import { clampField } from './settings.js';

/**
 * Timing a group brings along when it is selected.
 * @typedef {object} GroupTiming
 * @property {number} work
 * @property {number} rest
 * @property {number} sets
 * @property {number} setRest
 */

/**
 * @typedef {object} Group
 * @property {string} id
 * @property {string} name
 * @property {string[]} exercises  "Name" or "Name: description"
 * @property {GroupTiming} [timing]  absent in groups saved before timing existed
 */

export const NAME_MAX = 40;
/** Longest exercise name (the part before the first ':'). */
export const EXERCISE_MAX = 40;
/** Longest exercise description (the part after the first ':'). */
export const DESC_MAX = 80;
export const EXERCISES_MAX = 30;

/** @type {ReadonlyArray<keyof GroupTiming>} */
export const TIMING_FIELDS = ['work', 'rest', 'sets', 'setRest'];

/** Short unique id: time plus a random suffix. */
export function newId(now = Date.now(), random = Math.random) {
  return now.toString(36) + random().toString(36).slice(2, 6);
}

/**
 * Split an exercise line at the first ':' into a name and a description.
 * @param {string} line
 * @returns {{name: string, desc: string}}
 */
export function splitExercise(line) {
  const i = line.indexOf(':');
  if (i < 0) return { name: line.trim(), desc: '' };
  return { name: line.slice(0, i).trim(), desc: line.slice(i + 1).trim() };
}

/** @param {unknown[]} lines */
function cleanExercises(lines) {
  return lines
    .filter((x) => typeof x === 'string')
    .map((x) => {
      const { name, desc } = splitExercise(/** @type {string} */ (x));
      const n = name.slice(0, EXERCISE_MAX).trim();
      const d = desc.slice(0, DESC_MAX).trim();
      return n && d ? `${n}: ${d}` : n;
    })
    .filter(Boolean);
}

/**
 * Validate stored timing; null if any field is missing or not a number.
 * @param {unknown} raw
 * @returns {GroupTiming|null}
 */
export function cleanTiming(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Partial<GroupTiming>} */
  const out = {};
  for (const field of TIMING_FIELDS) {
    const v = t[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out[field] = clampField(field, v);
  }
  return /** @type {GroupTiming} */ (out);
}

/**
 * Pick a group's timing out of the current settings.
 * @param {import('./settings.js').Settings} s
 * @returns {GroupTiming}
 */
export function timingOf(s) {
  return { work: s.work, rest: s.rest, sets: s.sets, setRest: s.setRest };
}

/**
 * Timing in words, e.g. "30s work, 15s rest, 2 sets, 1:00 break".
 * @param {GroupTiming} t
 */
export function timingText(t) {
  const parts = [`${short(t.work)} work`, t.rest ? `${short(t.rest)} rest` : 'no rest'];
  if (t.sets > 1) {
    parts.push(count(t.sets, 'set'));
    if (t.setRest) parts.push(`${breakLength(t.setRest)} break`);
  }
  return parts.join(', ');
}

/**
 * Validate a group from storage or a backup. Returns null if unusable.
 * @param {unknown} raw
 * @returns {Group|null}
 */
export function cleanGroup(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const g = /** @type {Record<string, unknown>} */ (raw);
  if (typeof g.name !== 'string' || !Array.isArray(g.exercises)) return null;
  const name = g.name.trim().slice(0, NAME_MAX);
  const exercises = cleanExercises(g.exercises).slice(0, EXERCISES_MAX);
  if (!name || !exercises.length) return null;
  /** @type {Group} */
  const group = { id: String(g.id || newId()), name, exercises };
  const timing = cleanTiming(g.timing);
  if (timing) group.timing = timing;
  return group;
}

/**
 * @param {unknown} raw
 * @returns {Group[]}
 */
export function sanitizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanGroup).filter((g) => g !== null);
}

/**
 * Validate editor input: a name and one exercise per line.
 * @param {string} name
 * @param {string} text
 * @returns {{error: string} | {name: string, exercises: string[]}}
 */
export function parseGroupInput(name, text) {
  const cleanName = name.trim().slice(0, NAME_MAX);
  const exercises = cleanExercises(text.split('\n'));
  if (!cleanName) return { error: 'Give the group a name.' };
  if (!exercises.length) return { error: 'Add at least one exercise, one per line.' };
  if (exercises.length > EXERCISES_MAX) {
    return { error: `Keep it to ${EXERCISES_MAX} exercises or fewer.` };
  }
  return { name: cleanName, exercises };
}

/**
 * Exercise for a 1-based round. The list wraps around when rounds exceed it.
 * @param {Group} group
 * @param {number} round
 * @returns {{name: string, desc: string}}
 */
export function exerciseFor(group, round) {
  return splitExercise(group.exercises[(round - 1) % group.exercises.length]);
}

/** Exercise names without descriptions. @param {Group} group */
export function exerciseNames(group) {
  return group.exercises.map((x) => splitExercise(x).name);
}

/**
 * Explain how the group's list maps onto the configured rounds and sets.
 * @param {Group} group
 * @param {number} rounds
 * @param {number} sets
 */
export function groupNote(group, rounds, sets) {
  const n = group.exercises.length;
  let note;
  if (rounds < n) {
    note = `Only the first ${rounds} of ${n} exercises fit in ${count(rounds, 'round')}.`;
  } else if (rounds % n === 0) {
    note = rounds === n ? 'One pass through the list.' : `Goes through the list ${rounds / n} times.`;
  } else {
    const passes = Math.floor(rounds / n);
    note = `Goes through the list ${passes === 1 ? 'once' : `${passes} times`}, then ${rounds % n} more.`;
  }
  if (sets > 1) note += ` Then the whole set repeats, ${sets} sets in all.`;
  return note;
}
