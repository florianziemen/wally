// What the wallaby says: a greeting on page entry, a pep talk at the start
// of a workout and in some breaks, and a cheer after a workout.
// Every situation that applies has a set of equivalent lines and a weight
// for how important it is. A situation is drawn by weight, then a line from
// its set at random, so important news usually wins but not always.

import { MAX_LEVEL, TRAITS, fightState } from './fight.js';
import { activeSeason } from './seasons.js';
import { addDays, dayKey, summary, totalsByDay } from './stats.js';

/** @typedef {() => number} Random  returns a number in [0, 1) */

/**
 * @typedef {object} Context
 * @property {number} streak    weeks in a row
 * @property {number} thisWeek  sessions this week
 * @property {import('./fight.js').Trait} [trait]  gained or lost
 */

/** @typedef {string | ((c: Context) => string)} Line */

/**
 * How likely each situation is picked when it applies, relative to the
 * others. Getting gear back or staying human beats "it's evening".
 */
export const WEIGHTS = Object.freeze({
  greeting: {
    emptyPawed: 8, // no gear: today's workout decides if Wally turns
    dropped: 6, // lost gear yesterday
    newWeek: 5, // streak at stake
    armed: 4,
    streak: 3,
    today: 3,
    busyWeek: 3,
    seasonal: 4, // holidays and events, see js/seasons.js
    partOfDay: 2,
    any: 1,
  },
  cheer: {
    survived: 6, // kept a gearless Wally from turning
    biggest: 5,
    weekCount: 3,
    seasonal: 3,
    full: 2,
  },
});

export const GREETINGS = Object.freeze({
  first: [
    'G’day! I’m Wally. Let’s hop into your first workout.',
    'Hi, I’m Wally! Zombies are about. Let’s get fit before they find us.',
    'New here? Me too, sort of. Let’s do our first workout together.',
  ],
  morning: [
    'Morning! Legs ready to hop?',
    'Early bounce, best bounce.',
    'Rise and hop!',
    'Zombies sleep in. We don’t.',
    'Coffee can wait. Well, a few rounds can’t hurt first.',
    'Up before the kookaburras? Good on ya.',
    'Morning, mate! The early roo gets the… well, the workout.',
  ],
  afternoon: [
    'Perfect time for a quick hop.',
    'Shake off the afternoon slump!',
    'A few rounds now, a better evening later.',
    'Lunch digested? Let’s move.',
    'Afternoon patrol. Any zombies need outrunning?',
    'Arvo workout? Bonza idea.',
    'Hot arvo? It’s cooler here than in the outback. No excuses.',
  ],
  evening: [
    'One short session before the couch?',
    'End the day on a bounce.',
    'Evening hops count double. Well, almost.',
    'Zombies come out at night. Let’s be ready.',
    'Still time today. A short one counts.',
    'Wallabies come out at dusk. Your turn.',
    'Sun’s going down over the bush. One more hop before tea?',
  ],
  any: [
    'You don’t have to go fast. You just have to go.',
    'Small hops add up to big leaps.',
    'Strong tail, strong mind. Let’s go!',
    'Every round makes the next one easier.',
    'The zombies are slow. Let’s keep it that way.',
    'Fit wallabies don’t get eaten. Science.',
    'Ten minutes. That’s all I’m asking.',
    'Your future self says thanks in advance.',
    'Hop first, think later.',
    'Rule one of the apocalypse: cardio.',
    'Wallaby. Say it fast: “want-to-be”. So, what do you want to be today?',
    'Wannabes wait. Wallabies hop.',
    'Every wallaby started out as a wannabe.',
    '“I want to be fit.” Lovely. Wallaby fit takes ten minutes.',
    'Wallaby, wannabe, gonna-be. Let’s skip straight to gonna-be.',
    'No worries, mate. Just a few rounds.',
    'Fair dinkum, a few rounds won’t hurt.',
    'She’ll be right. Once you start, anyway.',
    'Crikey, is it workout o’clock already?',
    'Even a drop bear would be impressed by a workout today.',
  ],
  zombie: [
    'Braaains… I mean, workout? A workout would cure me.',
    'Uuurgh. Hop… hop… Please, one round and I’m a wallaby again.',
    'Zombie Wally here. Squats are the only cure.',
    'Mmmrgh. Can’t… feel… my tail. Exercise. Please.',
    'I’ve gone a bit green. One workout and I’m back.',
    'Grrr… burpees… The cure is burpees.',
    'Don’t look at me like that. Just start the timer.',
    'Braaains… I wannabe… a wallaby again. Workout?',
    'Strewth. I’ve gone full zombie, mate. Help a roo out.',
  ],
});

/** Greetings about the user's own log. @type {Readonly<Record<string, readonly Line[]>>} */
export const PERSONAL_GREETINGS = Object.freeze({
  today: [
    'Back for more today? Legend.',
    'Round two? You’re keen!',
    'Again? The zombies are terrified of you.',
  ],
  newWeek: [
    (c) => `New week! Keep your ${c.streak}-week streak hopping.`,
    (c) => `Fresh week. Let’s make it ${c.streak + 1} in a row.`,
    (c) => `A ${c.streak}-week streak is on the line. One workout keeps it.`,
  ],
  streak: [
    (c) => `${c.streak} weeks in a row. You’re on a roll!`,
    (c) => `${c.streak}-week streak. The zombies can’t keep up.`,
    (c) => `${c.streak} weeks straight. That’s a habit now.`,
  ],
  busyWeek: [
    (c) => `${c.thisWeek} workouts this week already. Bouncy!`,
    (c) => `${c.thisWeek} this week. You’re flying.`,
    (c) => `Workout number ${c.thisWeek + 1} this week? Let’s go.`,
  ],
  dropped: [
    (c) => `I dropped ${c.trait?.name} yesterday. Seven days in a row wins it back!`,
    (c) => `A zombie got ${c.trait?.name} ${c.trait?.emoji} yesterday. Let’s not lose more.`,
    (c) => `Lost ${c.trait?.name} yesterday. A week without a break and it’s mine again.`,
  ],
  emptyPawed: [
    'Zombies everywhere and I’ve got nothing. Hop to it today or I turn!',
    'No gear, no defence. Today’s workout is all that keeps me human. Well, wallaby.',
    'I can hear groaning outside. A workout today, please!',
  ],
  armed: [
    'Fully kitted out! Let’s keep every piece.',
    `${TRAITS.map((t) => t.emoji).join('')} Zombies, come at me.`,
    'Top gear. Don’t let a lazy day take any of it.',
  ],
});

export const CHEERS = Object.freeze({
  first: [
    'Your very first workout! This is how every streak starts.',
    'First one done! The zombies just got a bit nervous.',
    'Workout number one. Many more to come!',
  ],
  full: [
    'Bonzer! You crushed it.',
    'That’s a full workout. Proud of you!',
    'Hop hop hooray!',
    'Done and dusted. Have a drink of water.',
    'You showed up and finished. That’s the whole trick.',
    'Zombies: 0. You: 1.',
    'Every round, every second. Ripper!',
    'That’s how wallabies stay off the menu.',
    'Stretch, sip, smile. Great work.',
    'Wannabe? Nah. Wallaby.',
    'You wanted to be fit. Now you’re a bit fitter. That’s how wannabes become wallabies.',
    'Not a wannabe any more. Honorary wallaby, that’s you.',
    'Good on ya, mate!',
    'Fair dinkum effort, that.',
    'Strewth! Look at you go.',
  ],
  partial: [
    'Every round counts. Nice work.',
    'Some is way more than none. Logged!',
    'Short hop today, still a hop.',
    'Enough to keep the zombies guessing.',
    'A bit is better than a zombie. Logged!',
    'Wannabe today, wallaby tomorrow.',
    'No worries. She’ll be right next time.',
  ],
});

/** Cheers about the user's own log. @type {Readonly<Record<string, readonly Line[]>>} */
export const PERSONAL_CHEERS = Object.freeze({
  cure: [
    'You cured me! No more zombie. Thanks, mate.',
    'I’m back! My tail is brown again. Thank you!',
    'Brains? No thanks. I’m a wallaby again!',
    'Zombie, wannabe, wallaby. Back to the real thing. Thanks, mate!',
  ],
  gain: [
    (c) => `A whole week without a break! I found ${c.trait?.name} ${c.trait?.emoji}`,
    (c) => `Seven days straight! Look what I found: ${c.trait?.name} ${c.trait?.emoji}`,
    (c) => `Seven in a row. ${c.trait?.emoji} New gear: ${c.trait?.name}!`,
  ],
  biggest: [
    'Your biggest day yet! Top roo.',
    'Most exercise in a day so far. Champion!',
    'New personal best day. Zombies, take note.',
    'Biggest day yet. You’re no wannabe, you’re a big red!',
  ],
  weekCount: [
    (c) => `Workout ${c.thisWeek} this week. Keep hopping!`,
    (c) => `That’s ${c.thisWeek} this week. Lovely stuff.`,
    (c) => `Number ${c.thisWeek} this week. The zombies are giving up.`,
  ],
  survived: [
    'Phew. That keeps the zombies off for another day.',
    'Safe for today. Now let’s find some gear.',
    'Still a wallaby! Thanks for that.',
  ],
});

/** Lines during a workout. Short, so they can be read in a few seconds. */
export const PEP_TALKS = Object.freeze({
  start: [
    'Here we go! Hop to it.',
    'Deep breath. You’ve got this.',
    'Let’s show those zombies what we’re made of.',
    'Nice and steady to start. Then we bounce.',
    'Timer’s running. No turning back now!',
    'Wannabes watch. Wallabies hop. Let’s hop.',
    'Righto, let’s get stuck in!',
  ],
  rest: [
    'Breathe. You’re doing great.',
    'Shake it out. Next one’s coming.',
    'Rest well, hop better.',
    'Sip of water if you need it.',
    'Looking strong! The zombies are nervous.',
    'Loose shoulders, big breath.',
    'In through the nose, out through the mouth.',
    'Every rest earns the next round.',
    'You’re faster than any zombie. Promise.',
    'Rest is part of the plan. Enjoy it.',
    'Wiggle your toes. Roll your neck. Ready soon.',
    'That last one looked good from here.',
    'Hearts pumping? That’s the idea.',
    'Tail up, chin up.',
    'Halfway there? Doesn’t matter. Just the next one.',
    'Hydrate, mate.',
    'The couch can wait. You’re on a roll.',
    'Little breather. Big effort next.',
    'I’m keeping watch. You just recover.',
    'Sweat is just weakness hopping out.',
    'Relax your hands. Unclench that jaw.',
    'Proud of you. Keep going.',
    'Zombie count: zero. Good job.',
    'Feel that? That’s you getting stronger.',
    'Don’t sit down. Keep the legs moving.',
    'Easy breaths. You’re nearly ready again.',
    'You wanted to be here. Look, you are.',
    'Wannabe, gonna-be, doing it. You’re at “doing it”.',
    'Flat out like a lizard drinking. Love it.',
    'Too easy, mate.',
    'Good on ya. Keep it up.',
  ],
  setBreak: [
    'Set done! Catch your breath.',
    'One set down. Walk it off.',
    'Nice set! Rest up for the next one.',
  ],
  lastSet: [
    'Last set coming. Leave it all here!',
    'One more set and we’re done. Let’s finish strong.',
    'Final set next. You’ve come this far!',
    'Last set, then it’s smoko.',
  ],
  lastRound: [
    'Last round! Give it everything.',
    'One more! Make it your best.',
    'Final round. Hop like the zombies are right behind you.',
    'Last one. Go full kangaroo!',
  ],
});

/** Share of ordinary rests that get a pep talk, so it stays a surprise. */
export const REST_TALK_CHANCE = 0.3;
/** Rests shorter than this (seconds) pass too quickly to read a line. */
export const TALK_MIN_SECONDS = 10;

/**
 * Pep talk for a phase that just started, or null to stay quiet: always at
 * the start, between sets and before the last round, sometimes in a rest.
 * @param {import('./workout.js').Phase} phase
 * @param {{rounds: number, sets: number}} plan
 * @param {Random} [rand]
 * @returns {string|null}
 */
export function pepTalk(phase, plan, rand = Math.random) {
  const T = PEP_TALKS;
  if (phase.type === 'prep') return pick(T.start, rand);
  if (phase.type !== 'break' && phase.type !== 'rest') return null;
  if (phase.dur < TALK_MIN_SECONDS) return null;
  if (phase.round >= plan.rounds) {
    return pick(phase.set + 1 === plan.sets ? T.lastSet : T.setBreak, rand);
  }
  if (phase.set === plan.sets && phase.round + 1 === plan.rounds) return pick(T.lastRound, rand);
  return rand() < REST_TALK_CHANCE ? pick(T.rest, rand) : null;
}

/**
 * @template T
 * @param {readonly T[]} list
 * @param {Random} rand
 */
export function pick(list, rand) {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** @param {readonly Line[]} lines @param {Context} c @param {Random} rand */
function say(lines, c, rand) {
  const line = pick(lines, rand);
  return typeof line === 'function' ? line(c) : line;
}

/**
 * Draw one situation by weight, then one of its lines.
 * @param {[number, readonly Line[]][]} options  [weight, lines], most important first
 * @param {Context} c
 * @param {Random} rand
 */
function choose(options, c, rand) {
  let r = rand() * options.reduce((sum, [w]) => sum + w, 0);
  for (const [w, lines] of options) {
    if (r < w) return say(lines, c, rand);
    r -= w;
  }
  return say(options[options.length - 1][1], c, rand);
}

/** @param {Date} now */
function partOfDay(now) {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

/**
 * Greeting shown when the page opens.
 * @param {import('./log.js').Session[]} log
 * @param {Date} now
 * @param {Random} [rand]
 */
export function greeting(log, now, rand = Math.random) {
  if (!log.length) return pick(GREETINGS.first, rand);
  const fight = fightState(log, now);
  if (fight.zombie) return pick(GREETINGS.zombie, rand);
  const { thisWeek, streak } = summary(log, now);
  const today = totalsByDay(log).get(dayKey(now));
  const { last } = fight;
  const dropped = last?.kind === 'loss' && last.key === dayKey(addDays(now, -1));
  /** @type {Context} */
  const c = { streak, thisWeek, trait: dropped ? last.trait : undefined };
  const P = PERSONAL_GREETINGS;
  const W = WEIGHTS.greeting;
  /** @type {[number, readonly Line[]][]} */
  const options = [];
  if (!today && !fight.traits.length) options.push([W.emptyPawed, P.emptyPawed]);
  if (c.trait) options.push([W.dropped, P.dropped]);
  if (!today && streak && !thisWeek) options.push([W.newWeek, P.newWeek]);
  if (fight.traits.length === MAX_LEVEL) options.push([W.armed, P.armed]);
  if (today) options.push([W.today, P.today]);
  if (streak >= 2) options.push([W.streak, P.streak]);
  if (thisWeek >= 3) options.push([W.busyWeek, P.busyWeek]);
  const season = activeSeason(now);
  if (season) options.push([W.seasonal, season.greetings]);
  options.push([W.partOfDay, GREETINGS[partOfDay(now)]], [W.any, GREETINGS.any]);
  return choose(options, c, rand);
}

/**
 * Cheer shown when a logged workout ends.
 * @param {{full: boolean}} result  full: every phase ran to the end
 * @param {import('./log.js').Session[]} log  including the session just logged
 * @param {Date} now
 * @param {Random} [rand]
 */
export function cheer({ full }, log, now, rand = Math.random) {
  if (log.length === 1) return pick(CHEERS.first, rand);
  const totals = totalsByDay(log);
  const fight = fightState(log, now);
  const { last } = fight;
  const { thisWeek, streak } = summary(log, now);
  /** @type {Context} */
  const c = { streak, thisWeek, trait: last?.trait };
  const P = PERSONAL_CHEERS;
  // Only the day's first workout gains gear or cures, so only it gets the news.
  const firstToday = totals.get(dayKey(now))?.count === 1;
  if (firstToday && last?.key === dayKey(now)) {
    if (last.kind === 'cure') return say(P.cure, c, rand);
    if (last.kind === 'gain') return say(P.gain, c, rand);
  }
  if (!full) return pick(CHEERS.partial, rand);
  const today = totals.get(dayKey(now))?.seconds ?? 0;
  const best = Math.max(...[...totals.values()].map((d) => d.seconds));
  const W = WEIGHTS.cheer;
  /** @type {[number, readonly Line[]][]} */
  const options = [];
  if (firstToday && !fight.traits.length) options.push([W.survived, P.survived]);
  if (today >= best && totals.size > 1) options.push([W.biggest, P.biggest]);
  if (thisWeek >= 2) options.push([W.weekCount, P.weekCount]);
  const season = activeSeason(now);
  if (season) options.push([W.seasonal, season.cheers]);
  options.push([W.full, CHEERS.full]);
  return choose(options, c, rand);
}
