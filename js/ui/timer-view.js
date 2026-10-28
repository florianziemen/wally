// Full-screen timer overlay: runs a Workout and logs it when it ends.

import { clock } from '../format.js';
import { newId } from '../groups.js';
import { createSession } from '../log.js';
import { cheer, pepTalk } from '../motivation.js';
import { activeSeason } from '../seasons.js';
import { Workout, buildPhases, nextLine, phaseTitle, progressLine } from '../workout.js';
import { byId, el, showWally, twoTap } from './dom.js';

const TICK_MS = 100;

/**
 * @param {import('../store.js').Store} store
 * @param {import('../feedback.js').Feedback} feedback
 * @param {() => number} now  monotonic clock in ms
 */
export function initTimerView(store, feedback, now = () => performance.now()) {
  const overlay = byId('timer');
  const phaseEl = byId('t-phase');
  const descEl = byId('t-desc');
  const countEl = byId('t-count');
  const nextEl = byId('t-next');
  const roundEl = byId('t-round');
  const elapsedEl = byId('t-elapsed');
  const bar = byId('t-bar');
  const totalBar = byId('t-total');
  const endBtn = /** @type {HTMLButtonElement} */ (byId('t-end'));
  const mainBtn = byId('t-pause');
  const wallaby = byId('wb-done');
  const wallabyText = byId('wb-done-text');

  /** @type {Workout|null} */
  let workout = null;
  /** @type {import('../settings.js').Settings|null} settings and group captured at start */
  let plan = null;
  /** @type {import('../groups.js').Group|null} */
  let group = null;
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let interval;

  /** @param {string} type */
  function setMode(type) {
    overlay.className = `timer ${type}` + (wallaby.hidden ? '' : ' talk');
    overlay.hidden = false;
  }

  /** Show Wally with a line, or hide him for null. @param {string|null} text */
  function talk(text) {
    wallaby.hidden = !text;
    wallabyText.textContent = text ?? '';
  }

  function start() {
    feedback.unlockAudio();
    plan = store.state.settings;
    group = store.currentGroup();
    workout = new Workout(buildPhases(plan, group), now());
    showWally(wallaby, false, activeSeason(new Date())?.outfit);
    mainBtn.textContent = 'Pause';
    endBtn.hidden = false;
    talk(pepTalk(workout.phase, plan));
    setMode('prep');
    feedback.keepAwake();
    feedback.beep(660, 0.15);
    interval = setInterval(update, TICK_MS);
    update();
  }

  function update() {
    if (!workout) return;
    const { changed, countdown, halfway } = workout.tick(now());
    if (workout.finished) {
      finish(true);
      return;
    }
    const work = workout.phase.type === 'work';
    if (changed) {
      if (plan) talk(pepTalk(workout.phase, plan));
      feedback.beep(work ? 880 : 520, 0.45);
      feedback.buzz(work ? [200, 80, 200] : 300);
    } else if (countdown) {
      feedback.beep(660, 0.12);
    } else if (halfway) {
      feedback.beep(990, 0.1);
      setTimeout(() => feedback.beep(990, 0.1), 160);
      feedback.buzz([100, 60, 100]);
    }
    render();
  }

  function render() {
    if (!workout || !plan) return;
    const t = now();
    const phase = workout.phase;
    const sec = Math.ceil(workout.remaining(t) / 1000);
    setMode(phase.type + (workout.paused ? ' paused' : ''));
    phaseEl.textContent = workout.paused ? 'Paused' : phaseTitle(phase);
    descEl.textContent = phase.desc ?? '';
    descEl.hidden = workout.paused || !phase.desc;
    countEl.textContent = sec >= 60 ? clock(sec) : String(sec);
    roundEl.textContent = progressLine(phase, plan);
    elapsedEl.textContent = clock(workout.elapsed(t) / 1000);
    const next = workout.next;
    nextEl.replaceChildren(nextLine(next));
    if (next?.desc) nextEl.append(el('span', { className: 't-sub', text: next.desc }));
    bar.style.width = `${workout.progress(t) * 100}%`;
    totalBar.style.width = `${workout.overall(t) * 100}%`;
  }

  function togglePause() {
    if (!workout) return;
    if (workout.paused) {
      workout.resume(now());
      mainBtn.textContent = 'Pause';
      update();
    } else {
      workout.pause(now());
      mainBtn.textContent = 'Resume';
      render();
    }
  }

  /** @param {boolean} full  true when every phase ran to the end */
  function finish(full) {
    clearInterval(interval);
    feedback.releaseAwake();
    if (!workout || !plan) return;
    const completed = workout.completed;
    workout = null;
    talk(null);

    setMode('prep');
    bar.style.width = '100%';
    totalBar.style.width = '100%';
    roundEl.textContent = '';
    elapsedEl.textContent = '';
    descEl.hidden = true;
    countEl.textContent = String(completed);
    endBtn.hidden = true;
    mainBtn.textContent = 'Close';

    if (!completed) {
      phaseEl.textContent = 'Ended';
      nextEl.textContent = 'Nothing logged. Finish a full work round to log a workout.';
      return;
    }
    const at = new Date();
    const session = createSession({ settings: plan, group, completed, at, id: newId() });
    const saved = store.addSession(session);
    setMode('prep done');
    talk(cheer({ full }, store.state.log, at));
    phaseEl.textContent = full ? 'Done' : 'Ended';
    nextEl.textContent =
      `${completed === 1 ? 'round' : 'rounds'} logged` +
      (saved ? '' : ' for now. This browser blocked saving, so it will be lost when you close the page.');
    if (full) {
      feedback.beep(880, 0.2);
      setTimeout(() => feedback.beep(1100, 0.4), 220);
      feedback.buzz([150, 60, 150, 60, 300]);
    }
  }

  function close() {
    overlay.hidden = true;
  }

  byId('startBtn').addEventListener('click', start);
  mainBtn.addEventListener('click', () => (workout ? togglePause() : close()));
  twoTap(endBtn, 'Tap to end', () => finish(false));
  // Any tap on the timer screen restores audio that iOS dropped.
  for (const type of ['touchend', 'click']) {
    overlay.addEventListener(type, () => workout && feedback.unlockAudio());
  }
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    feedback.pageVisible(visible);
    if (visible && workout) feedback.keepAwake();
  });
}
