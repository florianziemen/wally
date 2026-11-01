import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { breakLength, clock, count, long, short } from '../js/format.js';
import {
  cleanGroup,
  exerciseFor,
  exerciseNames,
  groupNote,
  parseGroupInput,
  sanitizeGroups,
  splitExercise,
  timingText,
} from '../js/groups.js';
import {
  createSession,
  describeSession,
  mergeById,
  parseBackup,
  recentSessions,
  sanitizeSession,
  toBackup,
} from '../js/log.js';
import { DEFAULTS, clampField, sanitizeSettings, workoutSeconds } from '../js/settings.js';
import { calendar, dayEmoji, dayKey, startOfWeek, summary, tierEmoji, totalsByDay } from '../js/stats.js';
import { Workout, buildPhases, nextLine, progressLine } from '../js/workout.js';

const settings = (over = {}) => ({ ...DEFAULTS, ...over });
const group = (n) => ({ id: 'g', name: 'G', exercises: Array.from({ length: n }, (_, i) => `E${i + 1}`) });

describe('format', () => {
  it('formats durations', () => {
    assert.equal(clock(95), '1:35');
    assert.equal(clock(-3), '0:00');
    assert.equal(short(120), '2m');
    assert.equal(short(90), '90s');
    assert.equal(breakLength(45), '45s');
    assert.equal(breakLength(75), '1:15');
    assert.equal(long(125), '2 min 5 s');
    assert.equal(long(120), '2 min');
    assert.equal(long(7), '7 s');
    assert.equal(count(1, 'round'), '1 round');
    assert.equal(count(2, 'round'), '2 rounds');
  });
});

describe('settings', () => {
  it('uses defaults for missing or broken data', () => {
    assert.deepEqual(sanitizeSettings(null, []), DEFAULTS);
    assert.deepEqual(sanitizeSettings('x', []), DEFAULTS);
    assert.equal(sanitizeSettings({ work: 'abc' }, []).work, DEFAULTS.work);
  });

  it('clamps and rounds numbers', () => {
    const s = sanitizeSettings({ work: 1, rest: 999, rounds: 7.6, sets: 0, setRest: -5 }, []);
    assert.deepEqual([s.work, s.rest, s.rounds, s.sets, s.setRest], [5, 300, 8, 1, 0]);
    assert.equal(clampField('rounds', 51), 50);
  });

  it('keeps sound and only known groups', () => {
    assert.equal(sanitizeSettings({ sound: false }, []).sound, false);
    assert.equal(sanitizeSettings({ group: 'a' }, [{ id: 'a' }]).group, 'a');
    assert.equal(sanitizeSettings({ group: 'b' }, [{ id: 'a' }]).group, null);
  });

  it('computes workout length without prep', () => {
    assert.equal(workoutSeconds(settings({ work: 30, rest: 30, rounds: 10, sets: 1 })), 570);
    // 2 sets of 3 × 20s with 10s rest and a 60s break: 2 * (60 + 20) + 60
    assert.equal(workoutSeconds(settings({ work: 20, rest: 10, rounds: 3, sets: 2, setRest: 60 })), 220);
    // setRest 0 falls back to the normal rest between sets
    assert.equal(workoutSeconds(settings({ work: 20, rest: 10, rounds: 3, sets: 2, setRest: 0 })), 170);
  });
});

describe('groups', () => {
  it('cleans stored groups', () => {
    assert.equal(cleanGroup(null), null);
    assert.equal(cleanGroup({ name: ' ', exercises: ['a'] }), null);
    assert.equal(cleanGroup({ name: 'x', exercises: [' ', 3] }), null);
    const g = cleanGroup({
      id: 7,
      name: ` ${'n'.repeat(50)} `,
      exercises: [' a ', 5, '', ...Array(40).fill('b')],
    });
    assert.equal(g.id, '7');
    assert.equal(g.name.length, 40);
    assert.equal(g.exercises.length, 30);
    assert.equal(g.exercises[0], 'a');
    assert.ok(cleanGroup({ name: 'x', exercises: ['a'] }).id);
    assert.deepEqual(sanitizeGroups('nope'), []);
  });

  it('validates editor input', () => {
    assert.deepEqual(parseGroupInput('', 'a'), { error: 'Give the group a name.' });
    assert.deepEqual(parseGroupInput('x', '\n \n'), { error: 'Add at least one exercise, one per line.' });
    assert.ok('error' in parseGroupInput('x', Array(31).fill('a').join('\n')));
    assert.deepEqual(parseGroupInput(' Legs ', 'Squats\n\n Lunges '), {
      name: 'Legs',
      exercises: ['Squats', 'Lunges'],
    });
  });

  it('wraps exercises across rounds', () => {
    const g = group(3);
    assert.deepEqual(
      [1, 2, 3, 4].map((r) => exerciseFor(g, r).name),
      ['E1', 'E2', 'E3', 'E1'],
    );
  });

  it('splits exercises into name and description', () => {
    assert.deepEqual(splitExercise(' Plank '), { name: 'Plank', desc: '' });
    assert.deepEqual(splitExercise('Plank : elbows under shoulders '), {
      name: 'Plank',
      desc: 'elbows under shoulders',
    });
    assert.deepEqual(splitExercise('Run: 2:00 pace'), { name: 'Run', desc: '2:00 pace' });
    assert.deepEqual(splitExercise('Plank:'), { name: 'Plank', desc: '' });
    const g = { id: 'g', name: 'G', exercises: ['Plank: hold', 'Squats'] };
    assert.deepEqual(exerciseFor(g, 1), { name: 'Plank', desc: 'hold' });
    assert.deepEqual(exerciseNames(g), ['Plank', 'Squats']);
  });

  it('cleans names and descriptions separately', () => {
    const g = cleanGroup({
      name: 'x',
      exercises: [`${'n'.repeat(50)}:${'d'.repeat(100)}`, 'Plank :  ', ': no name', ' A:b '],
    });
    assert.deepEqual(g.exercises, [`${'n'.repeat(40)}: ${'d'.repeat(80)}`, 'Plank', 'A: b']);
    assert.deepEqual(parseGroupInput('x', 'Plank:hold\nSquats').exercises, ['Plank: hold', 'Squats']);
  });

  it('keeps valid timing and drops broken timing', () => {
    const base = { name: 'x', exercises: ['a'] };
    assert.equal('timing' in cleanGroup(base), false);
    assert.equal('timing' in cleanGroup({ ...base, timing: { work: 30 } }), false);
    assert.equal('timing' in cleanGroup({ ...base, timing: 'fast' }), false);
    assert.deepEqual(
      cleanGroup({ ...base, timing: { work: 999, rest: 10.4, sets: 0, setRest: 60, x: 1 } }).timing,
      {
        work: 300,
        rest: 10,
        sets: 1,
        setRest: 60,
      },
    );
  });

  it('describes timing', () => {
    assert.equal(timingText({ work: 30, rest: 15, sets: 1, setRest: 60 }), '30s work, 15s rest');
    assert.equal(
      timingText({ work: 60, rest: 0, sets: 2, setRest: 90 }),
      '1m work, no rest, 2 sets, 1:30 break',
    );
    assert.equal(timingText({ work: 20, rest: 10, sets: 3, setRest: 0 }), '20s work, 10s rest, 3 sets');
  });

  it('explains how the list maps onto rounds', () => {
    assert.equal(groupNote(group(4), 1, 1), 'Only the first 1 of 4 exercises fit in 1 round.');
    assert.equal(groupNote(group(4), 4, 1), 'One pass through the list.');
    assert.equal(groupNote(group(4), 8, 1), 'Goes through the list 2 times.');
    assert.equal(groupNote(group(4), 5, 1), 'Goes through the list once, then 1 more.');
    assert.equal(groupNote(group(4), 9, 1), 'Goes through the list 2 times, then 1 more.');
    assert.match(groupNote(group(4), 4, 3), /3 sets in all\.$/);
  });
});

describe('log', () => {
  const at = '2026-10-18T10:00:00.000Z';

  it('rejects sessions without a valid date', () => {
    assert.equal(sanitizeSession(null), null);
    assert.equal(sanitizeSession({ at: 'never' }), null);
    assert.equal(sanitizeSession({ at: 5 }), null);
  });

  it('normalizes session fields', () => {
    const s = sanitizeSession({ at, work: '30', rest: -1, rounds: 4, sets: 1, group: 'x'.repeat(50) });
    assert.equal(s.id, Date.parse(at).toString(36));
    assert.deepEqual([s.work, s.rest, s.rounds, s.planned], [30, 0, 4, 4]);
    assert.equal('sets' in s, false);
    assert.equal(s.group.length, 40);
    assert.equal(sanitizeSession({ at, sets: 99 }).sets, 10);
  });

  it('creates sessions, storing sets only when > 1', () => {
    const base = { group: null, completed: 5, at: new Date(at), id: 'i' };
    const one = createSession({ ...base, settings: settings({ rounds: 10 }) });
    assert.deepEqual(one, { id: 'i', at, work: 30, rest: 30, rounds: 5, planned: 10 });
    const two = createSession({ ...base, settings: settings({ rounds: 10, sets: 2 }), group: group(2) });
    assert.equal(two.sets, 2);
    assert.equal(two.planned, 20);
    assert.equal(two.group, 'G');
  });

  it('describes sessions', () => {
    assert.equal(describeSession({ id: '', at, work: 30, rest: 0, rounds: 10, planned: 10 }), '10 × 30s');
    assert.equal(
      describeSession({ id: '', at, work: 60, rest: 15, rounds: 8, planned: 10, sets: 2, group: 'Legs' }),
      'Legs: 8 of 10 × 1m / 15s in 2 sets',
    );
  });

  it('sorts recent sessions newest first', () => {
    const log = [
      { id: 'a', at: '2026-01-01T00:00:00Z' },
      { id: 'b', at: '2026-03-01T00:00:00+02:00' },
      { id: 'c', at: '2026-02-01T00:00:00Z' },
    ];
    assert.deepEqual(
      recentSessions(log, 2).map((s) => s.id),
      ['b', 'c'],
    );
  });

  it('round-trips a v2 backup', () => {
    const workouts = [sanitizeSession({ id: 'w', at, work: 20, rounds: 3 })];
    const groups = [group(2)];
    assert.deepEqual(parseBackup(toBackup(workouts, groups)), { workouts, groups });
  });

  it('reads a v1 backup (bare array) and drops junk', () => {
    const data = parseBackup(JSON.stringify([{ at, work: 20, rounds: 3 }, { at: 'bad' }, null]));
    assert.equal(data.workouts.length, 1);
    assert.deepEqual(data.groups, []);
  });

  it('rejects text that is not a backup', () => {
    assert.throws(() => parseBackup('nope'));
    assert.throws(() => parseBackup('null'));
    assert.throws(() => parseBackup('{"workouts": 3}'));
  });

  it('merges by id without overwriting', () => {
    const { merged, added } = mergeById(
      [{ id: 'a', v: 1 }],
      [
        { id: 'a', v: 2 },
        { id: 'b', v: 3 },
        { id: 'b', v: 4 },
      ],
    );
    assert.deepEqual(merged, [
      { id: 'a', v: 1 },
      { id: 'b', v: 3 },
    ]);
    assert.equal(added, 1);
  });
});

describe('stats', () => {
  const now = new Date(2026, 9, 18, 12); // Sunday, 18 Oct 2026
  const session = (date, rounds = 10) => ({
    id: String(+date),
    at: date.toISOString(),
    work: 30,
    rest: 0,
    rounds,
    planned: rounds,
  });

  it('finds Monday', () => {
    assert.equal(dayKey(startOfWeek(now)), '2026-10-12');
    assert.equal(dayKey(startOfWeek(new Date(2026, 9, 12, 8))), '2026-10-12');
  });

  it('picks tier emojis', () => {
    assert.equal(tierEmoji(0), '🧟');
    assert.equal(tierEmoji(1), '🐢');
    assert.equal(tierEmoji(300), '🐇');
    assert.equal(tierEmoji(1500), '🦁');
    assert.equal(dayEmoji(300, 300), '🦘');
    assert.equal(dayEmoji(0, 0), '🧟');
  });

  it('totals sessions per day', () => {
    const d = new Date(2026, 9, 14, 9);
    const totals = totalsByDay([
      session(d),
      { ...session(d), id: 'x', group: 'A' },
      { ...session(d), id: 'y', group: 'A' },
    ]);
    assert.deepEqual(totals.get('2026-10-14'), { count: 3, seconds: 900, groups: ['A'] });
  });

  it('summarizes week, streak and recent minutes', () => {
    const log = [
      session(new Date(2026, 9, 13, 9)), // this week
      session(new Date(2026, 9, 6, 9)), // last week
      session(new Date(2026, 8, 29, 9)), // two weeks ago
      session(new Date(2026, 8, 8, 9)), // gap, older than 30 days
    ];
    assert.deepEqual(summary(log, now), { thisWeek: 1, streak: 3, recentMinutes: 15 });
  });

  it('keeps the streak while the current week is still empty', () => {
    const log = [session(new Date(2026, 9, 6, 9)), session(new Date(2026, 8, 29, 9))];
    assert.equal(summary(log, now).streak, 2);
    assert.equal(summary([], now).streak, 0);
  });

  it('builds a 6-week calendar ending this week', () => {
    const totals = totalsByDay([session(new Date(2026, 9, 1, 9), 20), session(new Date(2026, 7, 1, 9), 50)]);
    const cal = calendar(totals, new Date(2026, 9, 14, 12)); // Wednesday
    assert.equal(cal.days.length, 42);
    assert.equal(cal.days[0].key, '2026-09-07');
    assert.equal(cal.days[41].key, '2026-10-18');
    assert.equal(cal.best, 600); // the August session is outside the window
    assert.equal(cal.days.filter((d) => d.today).length, 1);
    assert.equal(cal.days.filter((d) => d.future).length, 4);
  });
});

describe('workout plan', () => {
  it('builds prep, work and rest phases', () => {
    const p = buildPhases(settings({ work: 20, rest: 10, rounds: 3, sets: 1 }), null);
    assert.deepEqual(
      p.map((x) => x.type),
      ['prep', 'work', 'rest', 'work', 'rest', 'work'],
    );
  });

  it('adds a break between sets, or a rest when setRest is 0', () => {
    const withBreak = buildPhases(settings({ rest: 10, rounds: 2, sets: 2, setRest: 60 }), null);
    assert.deepEqual(
      withBreak.map((x) => x.type),
      ['prep', 'work', 'rest', 'work', 'break', 'work', 'rest', 'work'],
    );
    const noBreak = buildPhases(settings({ rest: 10, rounds: 2, sets: 2, setRest: 0 }), null);
    assert.equal(noBreak[4].type, 'rest');
    const noRest = buildPhases(settings({ rest: 0, rounds: 2, sets: 2, setRest: 0 }), null);
    assert.deepEqual(
      noRest.map((x) => x.type),
      ['prep', 'work', 'work', 'work', 'work'],
    );
  });

  it('labels work phases from the group, restarting each set', () => {
    const p = buildPhases(settings({ rest: 0, rounds: 3, sets: 2, setRest: 0 }), group(2));
    assert.deepEqual(
      p.filter((x) => x.type === 'work').map((x) => x.label),
      ['E1', 'E2', 'E1', 'E1', 'E2', 'E1'],
    );
  });

  it('puts exercise descriptions on work phases', () => {
    const g = { id: 'g', name: 'G', exercises: ['Plank: hold', 'Squats'] };
    const work = buildPhases(settings({ rest: 0, rounds: 2 }), g).filter((x) => x.type === 'work');
    assert.deepEqual(
      work.map((x) => [x.label, x.desc]),
      [
        ['Plank', 'hold'],
        ['Squats', undefined],
      ],
    );
  });

  it('describes progress and the next phase', () => {
    const s = { rounds: 3, sets: 2 };
    assert.equal(progressLine({ type: 'prep', dur: 5, set: 1, round: 0 }, s), 'Set 1 of 2, round 1 of 3');
    assert.equal(progressLine({ type: 'work', dur: 5, set: 2, round: 2 }, s), 'Set 2 of 2, round 2 of 3');
    assert.equal(progressLine({ type: 'rest', dur: 5, set: 1, round: 1 }, s), 'Next: round 2 of 3');
    assert.equal(progressLine({ type: 'break', dur: 5, set: 1, round: 3 }, s), 'Next: set 2 of 2');
    assert.equal(
      progressLine({ type: 'work', dur: 5, set: 1, round: 1 }, { rounds: 3, sets: 1 }),
      'Round 1 of 3',
    );
    assert.equal(nextLine(undefined), 'Last one');
    assert.equal(nextLine({ type: 'rest', dur: 60, set: 1, round: 1 }), 'Then rest 1m');
    assert.equal(nextLine({ type: 'work', dur: 30, set: 1, round: 1, label: 'Squats' }), 'Then Squats 30s');
  });
});

describe('Workout engine', () => {
  // prep 5s, work 10s, rest 5s, work 10s
  const phases = () => buildPhases(settings({ work: 10, rest: 5, rounds: 2, sets: 1 }), null);

  it('advances through phases by timestamp', () => {
    const w = new Workout(phases(), 0);
    assert.deepEqual(w.tick(1000), { changed: false, countdown: false, halfway: false });
    assert.equal(w.tick(5000).changed, true);
    assert.equal(w.phase.type, 'work');
    assert.equal(w.remaining(7500), 7500);
    assert.equal(w.progress(7500), 0.25);
  });

  it('catches up across several phases at once', () => {
    const w = new Workout(phases(), 0);
    w.tick(21000);
    assert.equal(w.phase.type, 'work');
    assert.equal(w.phase.round, 2);
    assert.equal(w.completed, 1);
    w.tick(30000);
    assert.equal(w.finished, true);
    assert.equal(w.completed, 2);
  });

  it('signals each of the last 3 seconds once', () => {
    const w = new Workout(phases(), 0);
    w.tick(5000);
    const signals = [11500, 12100, 12500, 13100, 14100, 14900].map((t) => w.tick(t).countdown);
    assert.deepEqual(signals, [false, true, false, true, true, false]);
  });

  it('signals the middle of a work phase once', () => {
    const w = new Workout(phases(), 0);
    w.tick(5000);
    const signals = [9000, 10000, 10100, 11000].map((t) => w.tick(t).halfway);
    assert.deepEqual(signals, [false, true, false, false]);
    // rest phase (5s) gets no signal; the second work phase does
    assert.equal(w.tick(17500).halfway, false);
    assert.equal(w.tick(21000).halfway, false);
    assert.equal(w.tick(25000).halfway, true);
  });

  it('skips the halfway signal for short work and after catching up', () => {
    const short = new Workout(buildPhases(settings({ work: 5, rest: 0, rounds: 1, sets: 1 }), null), 0);
    short.tick(5000);
    assert.equal(short.tick(7600).halfway, false);
    const w = new Workout(phases(), 0);
    assert.equal(w.tick(11000).halfway, false);
    assert.equal(w.tick(12000).halfway, false);
  });

  it('pauses without losing time', () => {
    const w = new Workout(phases(), 0);
    w.tick(6000);
    w.pause(6000);
    assert.deepEqual(w.tick(60000), { changed: false, countdown: false, halfway: false });
    assert.equal(w.remaining(60000), 9000);
    assert.equal(w.elapsed(60000), 6000);
    w.resume(60000);
    assert.equal(w.remaining(61000), 8000);
    assert.equal(w.elapsed(61000), 7000);
    w.tick(69000);
    assert.equal(w.phase.type, 'rest');
  });

  it('tracks overall progress over work time only', () => {
    const w = new Workout(phases(), 0);
    assert.equal(w.overall(2000), 0);
    w.tick(10000);
    assert.equal(w.overall(10000), 0.25);
    w.tick(17000);
    assert.equal(w.phase.type, 'rest');
    assert.equal(w.overall(17000), 0.5);
    w.tick(25000);
    assert.equal(w.overall(25000), 0.75);
    w.tick(30000);
    assert.equal(w.overall(30000), 1);
  });

  it('refuses an empty plan', () => {
    assert.throws(() => new Workout([], 0));
  });
});
