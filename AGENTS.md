# AGENTS.md — Wally (HIIT timer and workout log)

Guide for AI coding agents and human contributors working on this repo.

## What this is

Wally is a mobile-first HIIT interval timer with an on-device workout log.
It is a static web app hosted on GitHub Pages and installable to the home
screen as a PWA. There is no server, no build step and no runtime dependencies.

## Core principles (do not break these)

1. Privacy: the app never sends user data anywhere. No analytics, no
   trackers, no third-party requests of any kind. That includes CDNs, web
   fonts, remote images and external APIs. All data lives in the browser's
   localStorage on the user's phone.
2. No build, no dependencies: plain HTML, CSS and native ES modules, served
   as they are. Do not add frameworks, bundlers, npm runtime packages or
   external scripts. `package.json` only holds scripts; it has no dependencies.
3. Offline first: every file the app loads must be listed in `FILES` in
   `sw.js` (a test enforces this).
4. Mobile first: the primary target is a phone held in one hand during a
   workout. Tap targets are at least 44px and text is large and high contrast.
5. Backward compatibility: existing users have logs in localStorage and
   backups in their notes. Never break reading old data (see "Data model").

## Project layout

```
index.html              Markup only (plus the inlined logo SVG)
app.css                 All styles; colors are tokens on :root
js/main.js              Entry point: wires storage, store, feedback and views
js/format.js            Duration and count formatting (pure)
js/settings.js          Settings limits, defaults, sanitizing, workout length (pure)
js/groups.js            Exercise groups: validation, editor parsing, notes (pure)
js/log.js               Sessions, backup format, parse and merge (pure)
js/stats.js             Day totals, week/streak/minutes, calendar, emoji tiers (pure)
js/workout.js           Phase list builder and the Workout engine (pure, clock injected)
js/fight.js             Wally vs zombies: gear earned and lost from the log (pure)
js/motivation.js        Wallaby greeting and post-workout cheer messages (pure, rng injected)
js/seasons.js           Seasonal occasions: date ranges, lines, outfits (pure)
js/storage.js           JSON over Web Storage, all access guarded
js/store.js             App state; the only module that reads/writes storage
js/feedback.js          Beeps (WebAudio), vibration, screen wake lock
js/ui/dom.js            byId, el (safe element builder), twoTap
js/ui/*-view.js         One view per section: wallaby, settings, groups, history, fight, timer, backup
tests/*.test.js         node:test unit tests
sw.js                   Service worker: offline cache (cache first, refresh in background)
manifest.webmanifest    PWA manifest: name, colors, icons, standalone display
icon-192.png            App icon (purpose "any")
icon-512.png            App icon (purpose "any")
icon-maskable-512.png   Android adaptive icon, artwork inside the central safe zone
apple-touch-icon.png    iOS home-screen icon (180x180)
wallaby-logo.svg        Logo source artwork (also inlined in index.html header)
wallaby.svg             Full-body cartoon wallaby (“Wally”) shown with speech bubbles
zombie.svg              Zombie Wally (wallaby.svg in zombie colors, arms reaching right)
outfits/*.svg           Seasonal overlays drawn on top of Wally, same 220x296 coordinates
docs/social-preview.svg GitHub social preview source (uses wallaby.svg, zombie.svg)
docs/social-preview.png Rendered preview, 1280x640: repo settings and og:image in index.html
package.json            Scripts only (test, check, lint, format, serve)
eslint.config.js        Lint rules (no plugins, runs via npx)
.prettierrc.json        Formatting
LICENSE                 MIT
README.md               User-facing intro: features, privacy, install, local run
AGENTS.md               This file
.github/workflows/ci.yml  CI: tests (two time zones), check, lint, format check
```

All paths are relative (`./`, `sw.js`, `js/main.js`) because the site is
served from a subpath (`https://<user>.github.io/<repo>/`). Never use
root-absolute paths like `/sw.js`.

ES modules do not load from `file://`. Always serve the folder over HTTP.

The app used to be called Intervals (repository `intervals`). The storage
keys (`hiit-*`) and the backup's `"app": "intervals"` keep the old name so
existing data and backups keep working; don't rename them.

Keep artwork as SVG (new characters, poses, banners) so it can be reused.
Render PNGs from the SVGs (e.g. headless Chrome `--screenshot`) and keep both.

## Architecture

- Pure logic modules (format, settings, groups, log, stats, workout,
  fight, motivation, seasons) have no DOM or storage access and are fully unit tested. Put
  new logic there.
- `store.js` holds `{settings, groups, log}`, persists every change and
  notifies subscribers. Storage is injected (`createStore(createStorage())`),
  so tests use an in-memory backend.
- Views (`js/ui/*-view.js`) bind events, call store methods and re-render
  from `store.state` when notified. They never touch localStorage.
- The timer view runs a `Workout` against an injected monotonic clock.

## Hosting and deployment

- GitHub Pages deploys from branch main, folder / (root). Pushing to main
  is the release.
- After changing any cached file, bump the `CACHE` constant in `sw.js`
  (wally-v1 -> wally-v2). This makes installed apps re-download
  everything. When adding or renaming a file, update `FILES` in `sw.js`;
  `npm test` fails if it is out of sync with `js/`.
- Users see updates on the second launch after a deploy, because the
  service worker serves the cached copy first and refreshes it in the
  background.
- On iOS, a home-screen app has its own storage, separate from Safari.

## Data model (localStorage)

All access goes through `createStorage()` (`load(key, fallback)` /
`save(key, value)`), which catches errors because storage can be missing,
blocked or full. Everything read is sanitized (`sanitizeSettings`,
`sanitizeGroups`, `sanitizeLog`), both on load and on restore.

```
hiit-settings-v1: object
    work      seconds per work interval      5..300   (stepper +/-5)
    rest      seconds between rounds         0..300   (stepper +/-5)
    rounds    rounds per set                 1..50
    sets      times the round sequence runs  1..10
    setRest   break between sets, seconds    0..600   (stepper +/-15; 0 = use normal rest)
    sound     boolean, beeps and vibration
    group     id of the selected exercise group, or null
    Limits: LIMITS in js/settings.js. Defaults apply per field when invalid.

hiit-groups-v1: array of
    { id: string, name: string (max 40), exercises: string[] (1..30),
      timing?: { work, rest, sets, setRest } (same limits as settings) }
    Each exercise is "Name" or "Name: description", split at the first ':'
    (splitExercise); name max 40, description max 80. Groups saved before
    timing existed have no timing and leave the settings alone on select.
    cleanGroup() validates a group.

hiit-log-v1: array of workout sessions
    { id: string,
      at: ISO 8601 timestamp of when the workout ended,
      work, rest: seconds,
      rounds: number of COMPLETED work intervals in total (across all sets),
      planned: rounds * sets that were planned,
      sets?: number (only stored when > 1),
      group?: group NAME at the time (a snapshot, not an id) }
    Exercise time for a session = work * rounds (work intervals only, no rest).
    A session is only logged if at least one work interval was completed.
```

Backup format (Back up or restore panel, shown as text and copied to the
clipboard):

```
{ "app": "intervals", "version": 2, "workouts": [...], "groups": [...] }
```

Restore (`parseBackup`) also accepts a bare array of workouts (v1). It
merges by id (`mergeById`) and never overwrites or deletes existing entries.

Changing the schema: add optional fields with safe defaults rather than
renaming keys. If a breaking change is unavoidable, write a migration that
reads the old key, converts it, writes the new one and keeps the old data
until the conversion succeeds. Bump `BACKUP_VERSION` and keep restore able
to read every older version.

## Behavior

Settings and groups

- Selecting a group sets rounds to its number of exercises and applies its
  timing (work, rest, sets, setRest). Work intervals are labeled with the
  name of `exercises[(round - 1) % length]`, starting over in each set.
- The group editor uses one exercise per line in a textarea, with an
  optional description after a colon. Saving stores the current timing
  from the steppers (shown in the editor). Deleting a group takes two taps.

Timer

- `buildPhases()` creates a flat list: prep (5s), then for each set the
  work and rest phases, with a "break" phase between sets. If setRest is 0,
  a normal rest phase is used between sets instead, when rest > 0.
- Phase objects: `{ type: 'prep'|'work'|'rest'|'break', dur, set, round, label?, desc? }`.
  The description shows smaller under the exercise name (`#t-desc`) and
  under the name in the “Then …” preview.
- `Workout` timing uses timestamps (`phaseEnd`), not tick counts. The view
  calls `tick(now)` every 100ms; it catches up across several phases if the
  page was in the background. Pausing stores the remaining milliseconds,
  resuming moves `phaseEnd` forward, and `pausedTotal` keeps elapsed time right.
- Signals: a beep and buzz when each phase starts, a short beep in each of
  the last 3 seconds, and a double beep halfway through work phases of
  `HALFWAY_MIN` (8) seconds or more. Beeps are sine tones at full gain
  (`VOLUME` in `js/feedback.js`), held, then faded over the last 50ms. On iOS, the silent switch mutes the
  beeps and vibration isn't supported.
- The AudioContext is created on the start tap (iOS requires a gesture).
  The audio session is set to `ambient` (Safari) so music from other apps
  keeps playing. iOS can silently break the context after the app was in
  the background or another app took the audio, so it is resumed when the
  page becomes visible, and any tap on the timer screen replaces it.
  The Screen Wake Lock is requested at start and again when the page
  becomes visible.
- Settings and group are captured at start; the session is logged when
  the workout ends. Ending early takes two taps.
- A thin bar at the top shows overall progress (`Workout.overall()`): the
  share of total work time done. Prep, rest and breaks don't advance it.
  The bar above the buttons shows progress through the current phase.
- Overlay colors by phase: work = `--work` (cobalt), rest = `--rest`
  (yellow), prep and break = `--prep`.

History

- Stats: sessions this week (weeks start Monday), weeks in a row with at
  least one session (an empty current week does not break it), and work
  minutes over the last 30 days.
- Calendar: the last 6 weeks, Monday to Sunday. Each day shows its date,
  an emoji and its exercise time (m:ss).
- Emoji tiers by daily work time (`TIERS`): 🐢 under 5 min, 🐇 5–10,
  🦊 10–15, 🐆 15–25, 🦁 25+. 🦘 marks the day(s) with the most exercise
  time in the visible 6 weeks (ties all get it). 🧟 marks past days with
  no exercise. Today shows "·" until a workout is logged.
- Tapping a day shows its details in `#daydetail`. The recent workouts
  list shows the latest 25 sessions; deleting one takes two taps.

Wallaby

- On page load, Wally greets the user above the start button
  (`greeting()`); the × button hides it until the next load.
- During a workout, Wally gives a pep talk on the timer screen
  (`pepTalk()`, lines in `PEP_TALKS`): always in the get-ready phase,
  between sets and in the rest before the last round, and in
  `REST_TALK_CHANCE` (30%) of other rests. Rests and breaks shorter than
  `TALK_MIN_SECONDS` (10) get nothing. He hides when work starts.
- When a logged workout ends, Wally cheers on the finish screen (`cheer()`).
  Nothing is shown if no round was completed.
- Messages come from fixed sets in `js/motivation.js` (`GREETINGS`,
  `CHEERS`, `PERSONAL_GREETINGS`, `PERSONAL_CHEERS`, `PEP_TALKS`). Each situation has at
  least 3 equivalent lines and one is picked at random; lines that need
  numbers or gear are functions of a `Context`. All situations that apply,
  including the general ones (time of day, any time), are drawn by their
  weight in `WEIGHTS`, then a line within the chosen set. Important news
  (no gear left, gear lost yesterday, streak at stake) is likely but not
  certain; "it's evening" is rare when anything else applies. First
  workout, zombie, cure and new gear always win outright. A test enforces at least 3 lines per set, no
  duplicates and no straight apostrophes.

Seasons

- `SEASONS` in `js/seasons.js` lists occasions that last several days,
  mostly from Wally's Australian point of view (seasons are flipped for him):
  New Year (1–7 Jan), Mardi Gras (14 Feb–7 Mar), Easter (Good Friday to
  Easter Monday, computed), Pride (June), magpie swooping season
  (September), Halloween (24–31 Oct), Christmas (20–25 Dec) and the
  Boxing Day Test (26–30 Dec). Ranges never overlap (a test checks this).
- `activeSeason(now)` adds the season's lines as one more situation in
  `greeting()` and `cheer()` (`WEIGHTS.*.seasonal`). Pep talks stay unchanged.
- Each season names an outfit in `outfits/`, drawn over Wally by
  `showWally(box, zombie, outfit)`. The overlays use wallaby.svg's
  coordinates; on zombie Wally CSS mirrors and narrows them to fit
  zombie.svg. Keep outfits on the head, body or ground, since the arms differ.
- Left out on purpose: Australia Day, Anzac Day, Remembrance Day, NAIDOC
  and Reconciliation Week. Don't use Aboriginal art styles or sacred
  objects as decoration.

Wally vs zombies (inspired by Zombicide)

- `fightState(log, now)` replays the log day by day from the first workout.
  Nothing is stored; it is derived from the log every time.
- Each Monday-to-Sunday week with exercise every day earns the next item
  of `TRAITS` (🍳 🏏 🥾 🪖 🪓 🛡️), granted on the Sunday. `MAX_LEVEL`
  equals `CALENDAR_WEEKS`: fully armed means every displayed week was full.
- Each past day without exercise costs the newest item. Today never counts
  as missed. A missed day with nothing left to lose turns Wally into a
  zombie; the next day with exercise cures him (no gear).
- Shown as gear slots and a status line in `#fight` under the calendar.
  A zombie Wally is drawn with `zombie.svg` (`showWally()` in `js/ui/dom.js`), greets with `GREETINGS.zombie`,
  and the day's first workout cheers a cure or a new item.

PWA bits

- The service worker registers only on https or localhost.
- `navigator.storage.persist()` is requested so the browser is less likely
  to clear storage.

## Coding conventions

- Modern JavaScript (ES2022: const/let, arrow functions, optional chaining,
  native modules). It must run in current iOS Safari and Android Chrome
  without transpiling.
- JSDoc types on exported functions and data shapes.
- Put user-entered text into the page with `textContent` or `el()`, never
  `innerHTML` (ESLint enforces this).
- Don't use `alert()`, `confirm()` or `prompt()`. Destructive actions use
  `twoTap()`: the first tap arms the button for 3 seconds, the second confirms.
- Show and hide with the `hidden` attribute or CSS classes, not inline styles.
- Colors come from CSS custom properties on `:root`. Light and dark values
  are defined under `prefers-color-scheme` and `[data-theme]`. Add new
  colors as tokens in all three places, never as hard-coded values in
  components.
- Respect safe areas (`env(safe-area-inset-*)`) and keep the timer overlay
  full-screen.
- UI text uses typographic apostrophes and quotes (’ “ ”). Code keeps
  straight quotes.
- Keep interactive elements as `<button>` with clear aria-labels where the
  visible text is not enough.

## Testing

Before committing:

1. `npm test` runs the unit tests (node:test, Node 20+). Run it in a
   few time zones when touching date logic, e.g. `TZ=Pacific/Auckland npm test`.
2. `npm run check` checks `sw.js` syntax and that the manifest is valid JSON.
3. `npm run lint` and `npm run format:check` (fetched via npx; not deployed
   dependencies).
4. `npm run serve` and open http://localhost:8000. The service worker also
   registers on localhost. The server listens on all interfaces, so a phone
   on the same Wi-Fi can open `http://<computer's LAN IP>:8000` (on macOS:
   `ipconfig getifaddr en0`). Over plain http on a LAN IP the service worker
   and wake lock are unavailable (they need https or localhost); beeps,
   vibration and storage still work. The firewall may need to allow
   incoming connections to python3.
5. Manual checks: start, pause, resume and end a workout. Run with
   sets > 1 and a break, with rest 0, and with a group selected. Confirm
   the session appears in the calendar and the list. Back up, clear
   storage, then restore. Check dark mode, and check that it loads
   offline after the first visit.
6. If possible, test on a real iPhone (Safari and the home-screen app) and
   an Android phone (Chrome).

## Out of scope unless the owner asks

Accounts, sync, cloud storage, analytics, sharing features, external
libraries or fonts, and anything that sends data off the device.
