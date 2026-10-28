# Wally

A HIIT interval timer and workout log for your phone. It works offline,
has no tracking and keeps your data on your device.

**Open the app: https://florianziemen.github.io/wally/**

## Features

- Work, rest, rounds and sets, with an optional longer break between sets
- Exercise groups: name each work interval (e.g. “Squats”, “Push-ups”), add
  a short description, and keep the group’s own work, rest and set timing
- Beeps and vibration at each phase change, a countdown in the last
  seconds and a halfway signal; music from other apps keeps playing
- Keeps the screen on during a workout
- Workout log with a 6-week calendar, weekly streak and minutes trained
- Wally the wallaby cheers you on and fights zombies with gear you earn
  by exercising every day
- Light and dark mode

## Privacy

The app sends nothing anywhere. There are no accounts, analytics,
trackers, ads, web fonts or third-party requests. Settings, groups and
your workout log are stored only in your browser's local storage.

This also means there is no cloud copy. If you clear your browser data
or uninstall the app, the log is gone. Use **Back up or restore** in the
app to copy your data as text (e.g. into a note) and restore it later or
on another device. Restoring merges with what is there and never deletes
anything.

## Install on your phone

The app is a Progressive Web App and works offline after the first visit.

- **iPhone (Safari):** tap Share, then “Add to Home Screen”. Note that the
  home-screen app has its own storage, separate from Safari.
- **Android (Chrome):** tap the menu, then “Add to Home screen” or
  “Install app”.

Updates arrive on the second launch after a release.

On iPhone, the silent switch mutes the beeps, and vibration is not
supported.

## Run locally

There is no build step and there are no dependencies. ES modules don't
load from `file://`, so serve the folder over HTTP:

```sh
npm run serve        # http://localhost:8000
npm test             # unit tests (Node 20+)
npm run lint
npm run format:check
```

## Contributing

Issues and pull requests are welcome. Read [AGENTS.md](AGENTS.md) first:
it describes the architecture, the data model and the rules the app
keeps (privacy, no dependencies, offline first, backward-compatible data).

## License

[MIT](LICENSE)
