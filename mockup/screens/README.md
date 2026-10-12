# Screenshot evidence

`current-reference-overview.png` and `current-reference-editor.png` are exact copies of the repository's committed `assets/screen-overview.png` and `assets/screen-editor.png`. They are desktop light-mode references, not fresh captures. They were visually inspected during this task.

The requested new screenshot matrix is **not captured**. The shell could start the server, but Chrome aborted in the sandbox. The browser connection then denied permission to open the local app. No mockup screen has been visually verified in a browser.

| Screen   | Current light 1440 / 390 | Current dark 1440 / 390 | Mockup light 1440 / 390 | Mockup dark 1440 / 390 |
| -------- | ------------------------ | ----------------------- | ----------------------- | ---------------------- |
| Overview | Pending / Pending        | Pending / Pending       | Pending / Pending       | Pending / Pending      |
| Editor   | Pending / Pending        | Pending / Pending       | Pending / Pending       | Pending / Pending      |
| Planner  | Pending / Pending        | Pending / Pending       | Pending / Pending       | Pending / Pending      |

Once browser access is available, the capture script uses the installed `playwright-core` and Google Chrome. It visits all current app screens in both modes and widths, saves the matching three screens, saves all three mockup screens, and also saves the phone Editor panels separately. It checks basic browser behavior but the resulting images still need a human visual review.

From the repository root, using disposable data only:

```sh
mkdir -p mockup/.tmp
PORT=4199 POSTWRIGHT_DATA_DIR=./mockup/.review-data TMPDIR="$PWD/mockup/.tmp" npm start
```

Open the isolated app on port 4199 and choose **Add sample content** on Overview. In a second terminal:

```sh
node mockup/capture.mjs
```

The script reads the already seeded workspace and does not create or edit any app records. New captures are named `current-{screen}-{mode}-{width}.png` and `mockup-{screen}-{mode}-{width}.png`; copied references keep their separate names.
