# Desktop app: design

## Goal

Postwright can be downloaded and opened as a program on a Mac with Apple Silicon: its own window and icon, no terminal and no Node install. It is a portfolio version: a visitor of the repository can try the studio in a minute. The local version (`npm start`) stays exactly as it is, and the program does the same work.

## Not in this version

- Windows and Intel Macs. This version is built for Apple Silicon only; the main script and the build use nothing that ties them to it, so both can follow.
- Code signing and notarization. macOS warns on first open; the README explains how to open it anyway.
- Automatic updates.
- A field for the API key. The program runs with the sample answers the studio already gives without a key. The server still reads `ANTHROPIC_API_KEY` from the environment as it does today, so nothing is hidden or removed.
- Linux.

## How it works

A new folder `desktop/` holds one small Electron main script. On start it:

1. Takes the single-instance lock. A second launch focuses the existing window and exits.
2. Picks the data folder: `POSTWRIGHT_DATA_DIR` when set, otherwise `data` inside Electron's per-user folder (`app.getPath("userData")`). It never writes next to the program.
3. Calls the existing `prepareData`, `createApp` and `startServer` on a fixed port (48173), because the studio remembers the theme and the chosen project per address. If that port is taken, it uses port 0 and the system picks a free one. The server already binds `127.0.0.1` only.
4. Opens one window on the URL `startServer` returns.

When the last window closes, the script calls the server's `close()` and quits, on macOS as well.

If the server cannot start, the script shows the error in a dialog and quits.

## The window

- `contextIsolation` on, `nodeIntegration` off, `sandbox` on, no preload script. The page is the same web studio and gets no extra powers.
- Navigation stays on the server's own origin. Any other `http(s)` link opens in the system browser; anything else is refused.
- Export keeps using the browser download the studio already triggers. Electron answers it with its save dialog.
- The default application menu stays, so copy, paste and undo work.
- Closing the window or quitting with unsaved changes in a post asks first: Leave or Stay. A browser asks this by itself; Electron does not.
- The window background is the studio's paper colour, so there is no white flash on start.

## Build

The server is TypeScript and runs through `tsx` today. For the program it is compiled with the `tsc` already in the repo into a `build/` folder that keeps the server and web folders side by side, because the server finds the web files relative to itself and imports a few browser modules. `build/` is not committed.

Two development dependencies are added: `electron` and `electron-builder`. Nothing is added to what the local version needs at run time.

New scripts: `npm run desktop` (compile and open the program), `npm run desktop:pack` (compile and build the `.dmg` into `release/`, also not committed) and `npm run test:desktop`.

The app icon is made once from the existing mark and committed as a PNG in `desktop/`.

## Distribution

A new workflow `release.yml` runs on a version tag (`v*`). On a macOS runner it installs, runs the desktop test, builds the `.dmg`, runs the test again against the packed program and attaches the `.dmg` to a draft GitHub release with the `gh` CLI. The owner publishes the draft by hand. Only this workflow gets `contents: write`. It can also be started by hand, which builds the `.dmg` as a workflow artifact without a release.

The README gets a short Download section with the steps to open an unsigned program on macOS. `PRODUCT.md` names the desktop program next to the web studio.

## Tests

The rule for links is a small function with unit tests in the normal suite. One more test file starts the real program with Playwright's Electron support, a temporary profile and a temporary data folder, and checks that:

- the Overview loads in the window;
- sample content can be added and the posts appear;
- exporting a post saves a PNG;
- a link to another site does not open inside the window;
- a second launch does not open a second window;
- closing the window with unsaved changes asks first, and Stay keeps it open;
- closing the window stops the server and the program;
- a second start comes back on the same address;
- no studio window appears when the data folder cannot be used.

This test opens a real window, so it has its own script (`npm run test:desktop`) and is not part of `npm test`. The release workflow runs it, also against the packed program. The existing suite, type check and format check must keep passing.

## Stages

1. The program works on a Mac: `npm run desktop`, the test, and a packed `.app` that opens by double-click.
2. The release workflow, the README and `PRODUCT.md`.

## Risks to settle first

- On Apple Silicon an app without any signature is reported as damaged instead of unidentified. Check in stage 1 that the packed app carries an ad-hoc signature, and that a downloaded copy can be opened through Privacy & Security.
- Export in Electron is assumed to work through the save dialog. If it does not, the main script handles the download itself.
- The release workflow can only be tried on GitHub, so it needs a push that the owner approves.
