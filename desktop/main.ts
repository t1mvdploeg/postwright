// The desktop program: the same server and web studio, in a window of its own.
import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import { createApp } from "../src/server/app.js";
import { startServer } from "../src/server/http.js";
import { prepareData } from "../src/server/projects.js";
import { linkAction } from "./links.js";

// A --user-data-dir switch moves the profile, so a test run never shares the lock or the
// folder of the installed program.
const profile = app.commandLine.getSwitchValue("user-data-dir");
if (profile) app.setPath("userData", profile);

// A fixed port first: the studio remembers the theme and the chosen project per address, and
// a new port on every start would forget both. Is it taken, then any free port will do.
const PORT = 48173;

let win: BrowserWindow | null = null;

async function main(): Promise<void> {
  await app.whenReady();
  const dataDir = process.env.POSTWRIGHT_DATA_DIR ?? join(app.getPath("userData"), "data");
  await prepareData(dataDir);
  const options = { dataDir, ...createApp({ dataDir }) };
  const server = await startServer({ ...options, port: PORT }).catch(() => startServer({ ...options, port: 0 }));
  const origin = new URL(server.url).origin;

  /** True when the link belongs in the window; another site goes to the system browser. */
  const follow = (url: string): boolean => {
    const action = linkAction(url, origin);
    if (action === "external") void shell.openExternal(url);
    return action === "stay";
  };

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    title: "Postwright",
    backgroundColor: "#f8f7f4",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (follow(url)) void win?.loadURL(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!follow(url)) event.preventDefault();
  });
  // The studio refuses to unload while a post has changes that are not saved. A browser asks
  // the person then; Electron does not, and without this question the window would never close.
  win.webContents.on("will-prevent-unload", (event) => {
    const answer = dialog.showMessageBoxSync(win!, {
      type: "question",
      buttons: ["Leave", "Stay"],
      defaultId: 1,
      cancelId: 1,
      message: "This post has changes that are not saved.",
      detail: "Leave without saving?",
    });
    if (answer === 0) event.preventDefault();
  });
  app.on("window-all-closed", () => {
    void server.close().finally(() => app.quit());
  });
  await win.loadURL(server.url);
}

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  main().catch((error: unknown) => {
    dialog.showErrorBox("Postwright could not start", error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
} else {
  app.quit();
}
