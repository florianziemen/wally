import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_LEVEL, TRAITS, fightLine, fightState } from '../js/fight.js';
import { GREETINGS, PERSONAL_CHEERS, cheer, greeting } from '../js/motivation.js';
import { CALENDAR_WEEKS, addDays } from '../js/stats.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
const session = (date) => ({
  id: date.toISOString(),
  at: date.toISOString(),
  work: 30,
  rest: 10,
  rounds: 10,
  planned: 10,
});
/** One session per day for n days from start. */
const daily = (start, n) => Array.from({ length: n }, (_, i) => session(addDays(start, i)));
const MON = at(2026, 9, 7); // a Monday

describe('fight', () => {
  it('has one trait per calendar week', () => {
    assert.equal(MAX_LEVEL, CALENDAR_WEEKS);
  });

  it('starts empty-pawed', () => {
    const s = fightState([], MON);
    assert.deepEqual(s, { traits: [], zombie: false, last: null });
    assert.match(fightLine(s), /empty-pawed/);
  });

  it('gains a trait for every seven days in a row', () => {
    const sun = addDays(MON, 6);
    assert.equal(fightState(daily(MON, 6), addDays(MON, 5)).traits.length, 0);
    const s = fightState(daily(MON, 7), sun);
    assert.deepEqual(s.traits, [TRAITS[0]]);
    assert.equal(s.last?.kind, 'gain');
    assert.match(fightLine(s), /Level 1 of 6/);
    // Any start day works: Wednesday to Tuesday.
    const wed = addDays(MON, 2);
    const t = fightState(daily(wed, 7), addDays(wed, 6));
    assert.deepEqual(t.traits, [TRAITS[0]]);
    assert.deepEqual(t.last, { kind: 'gain', key: '2026-09-15', trait: TRAITS[0] });
    // Fourteen in a row from Thursday earn two, on days 7 and 14.
    assert.equal(fightState(daily(addDays(MON, 3), 13), addDays(MON, 15)).traits.length, 1);
    assert.equal(fightState(daily(addDays(MON, 3), 14), addDays(MON, 16)).traits.length, 2);
  });

  it('starts the run over after a missed day', () => {
    // Mon–Wed, miss Thu, Fri–Thu: the gain comes on day 7 of the new run.
    const log = [...daily(MON, 3), ...daily(addDays(MON, 4), 7)];
    const s = fightState(log, addDays(MON, 10));
    assert.deepEqual(s.traits, [TRAITS[0]]);
    assert.equal(s.last?.key, '2026-09-17');
    // He turned zombie on Thursday, cured Friday, then six days aren't enough.
    assert.equal(fightState(log.slice(0, -1), addDays(MON, 9)).traits.length, 0);
  });

  it('caps at the max level', () => {
    const s = fightState(daily(MON, 7 * 8), addDays(MON, 7 * 8 - 1));
    assert.equal(s.traits.length, MAX_LEVEL);
    assert.match(fightLine(s), /Fully armed/);
  });

  it('loses the newest trait per missed day, but not for today', () => {
    const log = daily(MON, 14); // two traits by the second Sunday
    const monday3 = addDays(MON, 14);
    assert.equal(fightState(log, monday3).traits.length, 2);
    const s = fightState(log, addDays(MON, 15));
    assert.deepEqual(s.traits, [TRAITS[0]]);
    assert.deepEqual(s.last, { kind: 'loss', key: '2026-09-21', trait: TRAITS[1] });
  });

  it('turns into a zombie on a missed day with nothing to lose, and a workout cures', () => {
    const log = daily(MON, 7); // one trait
    const sun = addDays(MON, 6);
    // Monday costs the trait; Tuesday is only today, so not missed yet.
    let s = fightState(log, addDays(sun, 2));
    assert.deepEqual([s.traits.length, s.zombie], [0, false]);
    assert.match(fightLine(s), /one day without exercise/);
    s = fightState(log, addDays(sun, 3));
    assert.equal(s.zombie, true);
    assert.deepEqual(s.last, { kind: 'zombie', key: '2026-09-15' });
    assert.match(fightLine(s), /zombie/);
    const cureDay = addDays(sun, 20);
    s = fightState([...log, session(cureDay)], cureDay);
    assert.equal(s.zombie, false);
    assert.equal(s.last?.kind, 'cure');
    // A missed day right after the cure turns him again.
    assert.equal(fightState([...log, session(cureDay)], addDays(cureDay, 2)).zombie, true);
  });

  it('feeds the wallaby’s messages', () => {
    const sun = addDays(MON, 6);
    assert.match(cheer({ full: true }, daily(MON, 7), sun), /a frying pan/);
    // A second workout that Sunday gets a normal cheer.
    const twice = [...daily(MON, 7), session(at(2026, 9, 13, 18))];
    assert.doesNotMatch(cheer({ full: true }, twice, at(2026, 9, 13, 19)), /frying pan/);

    const zombieDay = addDays(MON, 30);
    assert.ok(GREETINGS.zombie.includes(greeting([session(MON)], zombieDay)));
    assert.ok(
      PERSONAL_CHEERS.cure.includes(cheer({ full: false }, [session(MON), session(zombieDay)], zombieDay)),
    );

    // Lost the bat yesterday (Monday after two full weeks), the most important news.
    assert.match(
      greeting(daily(MON, 14), addDays(MON, 15), () => 0),
      /dropped a cricket bat/,
    );
  });
});
