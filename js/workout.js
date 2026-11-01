// Workout plan (a flat list of phases) and the clock-driven engine that runs it.

import { short } from './format.js';
import { exerciseFor } from './groups.js';
import { PREP_SECONDS } from './settings.js';

/**
 * @typedef {'prep'|'work'|'rest'|'break'} PhaseType
 * @typedef {object} Phase
 * @property {PhaseType} type
 * @property {number} dur    seconds
 * @property {number} set    1-based
 * @property {number} round  1-based; 0 for prep
 * @property {string|null} [label]  exercise name for work phases
 * @property {string} [desc]  exercise description, only when the group gives one
 */

/** @type {Record<PhaseType, string>} */
export const PHASE_NAMES = { prep: 'Get ready', work: 'Work', rest: 'Rest', break: 'Break' };

/**
 * Prep, then per set: work and rest phases, with a break (or a normal rest
 * when setRest is 0) between sets.
 * @param {import('./settings.js').Settings} s
 * @param {import('./groups.js').Group|null} group
 * @returns {Phase[]}
 */
export function buildPhases(s, group) {
  /** @type {Phase[]} */
  const phases = [{ type: 'prep', dur: PREP_SECONDS, set: 1, round: 0 }];
  for (let set = 1; set <= s.sets; set++) {
    for (let round = 1; round <= s.rounds; round++) {
      const ex = group ? exerciseFor(group, round) : null;
      /** @type {Phase} */
      const work = { type: 'work', dur: s.work, set, round, label: ex ? ex.name : null };
      if (ex?.desc) work.desc = ex.desc;
      phases.push(work);
      if (round < s.rounds && s.rest > 0) phases.push({ type: 'rest', dur: s.rest, set, round });
    }
    if (set < s.sets) {
      if (s.setRest > 0) phases.push({ type: 'break', dur: s.setRest, set, round: s.rounds });
      else if (s.rest > 0) phases.push({ type: 'rest', dur: s.rest, set, round: s.rounds });
    }
  }
  return phases;
}

/** Large heading during a phase. @param {Phase} p */
export function phaseTitle(p) {
  return p.label || PHASE_NAMES[p.type];
}

/**
 * Progress line at the top of the timer.
 * @param {Phase} p
 * @param {{rounds: number, sets: number}} s
 */
export function progressLine(p, s) {
  const prefix = s.sets > 1 ? `Set ${p.set} of ${s.sets}, round` : 'Round';
  if (p.type === 'prep') return `${prefix} 1 of ${s.rounds}`;
  if (p.type === 'work') return `${prefix} ${p.round} of ${s.rounds}`;
  if (p.round >= s.rounds) return `Next: set ${p.set + 1} of ${s.sets}`;
  return `Next: round ${p.round + 1} of ${s.rounds}`;
}

/** Preview of the following phase. @param {Phase|undefined} next */
export function nextLine(next) {
  if (!next) return 'Last one';
  return `Then ${next.label || PHASE_NAMES[next.type].toLowerCase()} ${short(next.dur)}`;
}

/** Work phases shorter than this get no halfway signal (it would run into the countdown). */
export const HALFWAY_MIN = 8;

/**
 * Runs a phase list against a monotonic clock (milliseconds). Timing comes
 * from timestamps, not tick counts, so tick() catches up across several
 * phases after the page was in the background.
 */
export class Workout {
  /**
   * @param {Phase[]} phases
   * @param {number} now
   */
  constructor(phases, now) {
    if (!phases.length) throw new Error('A workout needs at least one phase');
    this.phases = phases;
    /** total seconds of work phases */
    this.workTotal = phases.reduce((sum, p) => sum + (p.type === 'work' ? p.dur : 0), 0);
    this.index = 0;
    this.completed = 0;
    this.finished = false;
    this.paused = false;
    this.startedAt = now;
    this.phaseEnd = now + phases[0].dur * 1000;
    this.pausedTotal = 0;
    this.pausedAt = 0;
    this.remainingMs = 0;
    /** @type {number|null} */
    this.lastSecond = null;
    /** whether the halfway signal of the current phase was given */
    this.halfDone = false;
  }

  get phase() {
    return this.phases[this.index];
  }

  get next() {
    return this.phases[this.index + 1];
  }

  /**
   * Advance to `now`.
   * @param {number} now
   * @returns {{changed: boolean, countdown: boolean, halfway: boolean}}
   *   changed: a new phase began; countdown: one of the last 3 seconds began;
   *   halfway: a work phase of HALFWAY_MIN seconds or more passed its middle
   */
  tick(now) {
    if (this.paused || this.finished) return { changed: false, countdown: false, halfway: false };
    let changed = false;
    while (now >= this.phaseEnd) {
      if (this.phase.type === 'work') this.completed += 1;
      this.index += 1;
      changed = true;
      if (this.index >= this.phases.length) {
        this.finished = true;
        return { changed, countdown: false, halfway: false };
      }
      this.phaseEnd += this.phase.dur * 1000;
      this.halfDone = false;
    }
    const sec = Math.ceil(this.remaining(now) / 1000);
    const countdown = !changed && sec <= 3 && sec > 0 && sec !== this.lastSecond && this.phase.dur > 3;
    this.lastSecond = sec;
    const p = this.phase;
    let halfway = false;
    if (!this.halfDone && p.type === 'work' && p.dur >= HALFWAY_MIN && this.remaining(now) <= p.dur * 500) {
      this.halfDone = true;
      // After catching up from the background, the middle is already past: stay quiet.
      halfway = !changed;
    }
    return { changed, countdown, halfway };
  }

  /** @param {number} now */
  pause(now) {
    if (this.paused || this.finished) return;
    this.paused = true;
    this.remainingMs = this.phaseEnd - now;
    this.pausedAt = now;
  }

  /** @param {number} now */
  resume(now) {
    if (!this.paused) return;
    this.paused = false;
    this.phaseEnd = now + this.remainingMs;
    this.pausedTotal += now - this.pausedAt;
  }

  /** Milliseconds left in the current phase. @param {number} now */
  remaining(now) {
    return this.paused ? this.remainingMs : this.phaseEnd - now;
  }

  /** Milliseconds of workout time, excluding pauses. @param {number} now */
  elapsed(now) {
    return (this.paused ? this.pausedAt : now) - this.startedAt - this.pausedTotal;
  }

  /** Fraction of the current phase done, 0..1. @param {number} now */
  progress(now) {
    const done = 1 - this.remaining(now) / (this.phase.dur * 1000);
    return Math.min(1, Math.max(0, done));
  }

  /** Fraction of all work time done, 0..1 (prep, rest and breaks don't count). @param {number} now */
  overall(now) {
    if (this.finished) return 1;
    if (!this.workTotal) return 0;
    let done = 0;
    for (let i = 0; i < this.index; i++) if (this.phases[i].type === 'work') done += this.phases[i].dur;
    if (this.phase.type === 'work') done += this.phase.dur * this.progress(now);
    return Math.min(1, done / this.workTotal);
  }
}
