// The shell: navigation and a hash router that loads a module per screen
// (`src/web/studio/<screen>.js`).
//
// The editor needs the full width and the code loads only on this page.
import {
  activeProject,
  api,
  confirmDialog,
  el,
  emptyState,
  icon,
  notice,
  pinProject,
  setActiveProject,
  textDialog,
} from "/ui.js";
import { loadBrand } from "/studio/brand.js";
import { pickProject } from "/projects.js";

const NAV_GROUPS = [
  [
    "Workspace",
    [
      ["overview", "Overview"],
      ["library", "All posts"],
      ["planning", "Planner"],
      ["editor", "Editor"],
    ],
  ],
  [
    "Your foundation",
    [
      ["brand-kit", "Brand kit"],
      ["facts", "Fact bank"],
      ["snippets", "Snippets"],
    ],
  ],
];
/** Settings sits apart, at the foot of the sidebar. */
const BOTTOM_SCREEN = ["settings", "Settings"];
const SCREENS = new Map([...NAV_GROUPS.flatMap(([, s]) => s), BOTTOM_SCREEN]);
/** The heading of a screen when it is not its name, and the line under it. */
const SCREEN_HEADING = { overview: "A little structure. A lot of possibility." };
const SCREEN_LEDE = {
  overview: "Your posts on the desk, and the week ahead.",
  library: "Everything you are making, in one place.",
  editor: "Pick a template, fill in the fields and check the post.",
  planning: "A clear view of what goes out, and when.",
  facts: "A source behind every claim.",
  snippets: "Openers, closers and hashtags to reuse.",
  "brand-kit": "The essentials that make every post look like the brand.",
  settings: "Channels, writing help and the spending cap.",
};
// The icon per screen, the same sprite as the rest of the tool (/icons.svg).
const SCREEN_ICON = {
  overview: "grid",
  editor: "edit",
  library: "posts",
  planning: "calendar",
  facts: "shield",
  snippets: "text",
  "brand-kit": "palette",
  settings: "settings",
};
const MODULES = {
  overview: () => import("/studio/overview.js"),
  editor: () => import("/studio/editor.js"),
  library: () => import("/studio/library.js"),
  planning: () => import("/studio/planning.js"),
  facts: () => import("/studio/facts.js"),
  snippets: () => import("/studio/snippets.js"),
  "brand-kit": () => import("/studio/brand-kit.js"),
  settings: () => import("/studio/settings.js"),
};

const navEl = document.getElementById("studio-nav");
const contentEl = document.getElementById("studio-content");
const mainEl = document.getElementById("studio-main");
const titleEl = document.getElementById("studio-title");
const ledeEl = document.getElementById("studio-lede");
const crumbEl = document.getElementById("studio-crumb");
const sidebarEl = document.getElementById("studio-sidebar");
const overlayEl = document.getElementById("studio-overlay");
const menuButton = document.getElementById("studio-menu");
const projectSelect = document.getElementById("studio-project");

const NEW_PROJECT = "__new__";
let projectName = "";
/** Set once the user has agreed to leave, so that the browser does not ask a second time. */
let leaving = false;

/** The screen that is open now, with its optional hooks `leave()` and `hasUnsaved()`. */
let active = null;
let previousHash = "";
let renderCounter = 0;
let settingsPromise = null;

/** `#editor/p-…` → { screen: "editor", parts: ["p-…"] }. Unknown becomes the overview. */
export function readRoute(hash) {
  const [screen, ...parts] = String(hash ?? "")
    .replace(/^#/, "")
    .split("/")
    .map(decodeURIComponent);
  return SCREENS.has(screen) ? { screen, parts } : { screen: "overview", parts: [] };
}

/** Below 900px the sidebar is a menu that slides in; above it the sidebar is always there. */
const narrowScreen = window.matchMedia("(max-width: 900px)");
const workspaceEl = document.querySelector(".app-workspace");

/**
 * Keeps the closed menu out of the tab order and the screen reader's reach, and the page behind
 * an open menu out of reach too. `inert` does both; on a wide screen nothing is inert.
 */
function syncMenu() {
  const open = sidebarEl.classList.contains("open");
  if (!narrowScreen.matches && open) {
    sidebarEl.classList.remove("open");
    overlayEl.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }
  const menuOpen = narrowScreen.matches && open;
  sidebarEl.inert = narrowScreen.matches && !open;
  workspaceEl.inert = menuOpen;
}

function openMenu() {
  sidebarEl.classList.add("open");
  overlayEl.hidden = false;
  menuButton.setAttribute("aria-expanded", "true");
  syncMenu();
  // The menu slides in, so do not let the browser scroll to where the link is now.
  navEl.querySelector("a")?.focus({ preventScroll: true });
}

/** Closes the menu. `focus` is where focus goes afterwards: the Menu button, or the page itself. */
function closeMenu(focus = menuButton) {
  const wasOpen = sidebarEl.classList.contains("open");
  sidebarEl.classList.remove("open");
  overlayEl.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
  syncMenu();
  if (wasOpen) focus.focus();
}

function navLink([id, name], screen) {
  return el(
    "a",
    {
      href: `#${id}`,
      class: id === screen ? "active" : "",
      ...(id === screen ? { "aria-current": "page" } : {}),
      onclick: () => closeMenu(mainEl),
    },
    [icon(SCREEN_ICON[id]), name],
  );
}

function renderNav(screen) {
  navEl.replaceChildren(
    ...NAV_GROUPS.map(([group, screens]) =>
      el("div", { class: "nav-group" }, [
        el("span", { class: "nav-group-label", text: group }),
        ...screens.map((s) => navLink(s, screen)),
      ]),
    ),
    el("div", { class: "nav-group nav-bottom" }, [navLink(BOTTOM_SCREEN, screen)]),
  );
}

function loadSettings(retry = false) {
  // Do not keep a failed call, otherwise every screen fails until the page reloads.
  if (retry || !settingsPromise) {
    const promise = api("/api/settings").catch((e) => {
      if (settingsPromise === promise) settingsPromise = null;
      throw e;
    });
    settingsPromise = promise;
  }
  return settingsPromise;
}

/** Asks whether unsaved changes may be dropped. Resolves `true` when there are none. */
async function confirmLeave() {
  if (!active?.hasUnsaved?.()) return true;
  return confirmDialog("The changes to this post are not saved yet and will be lost.", {
    title: "Leave without saving?",
    confirmText: "Leave and discard changes",
    dangerous: true,
  });
}

async function render() {
  // The skip link at the top of the page jumps to #studio-main; that is not a screen, so
  // restore the hash.
  if (location.hash === "#studio-main") {
    history.replaceState(null, "", previousHash || "#overview");
    mainEl.focus();
    return;
  }
  if (location.hash !== previousHash && !(await confirmLeave())) {
    history.replaceState(null, "", previousHash);
    return;
  }
  const my = ++renderCounter;
  const { screen, parts } = readRoute(location.hash);
  previousHash = location.hash || "#overview";
  active?.leave?.();
  active = null;
  renderNav(screen);
  titleEl.textContent = SCREEN_HEADING[screen] ?? SCREENS.get(screen);
  ledeEl.textContent = SCREEN_LEDE[screen];
  crumbEl.textContent = SCREENS.get(screen);
  document.title = `${SCREENS.get(screen)} — Postwright · ${projectName}`;
  contentEl.replaceChildren();
  mainEl.setAttribute("aria-busy", "true");
  try {
    const [mod, brand, settings] = await Promise.all([MODULES[screen](), loadBrand(), loadSettings()]);
    if (my !== renderCounter) return;
    const ctx = {
      api,
      brand,
      settings,
      parts,
      /**
       * Whether this screen is still the active one; a late response must not overwrite a newer
       * screen.
       */
      valid: () => my === renderCounter,
      setTitle: (t) => {
        titleEl.textContent = t;
      },
      /** The line under the heading. */
      setLede: (t) => {
        ledeEl.textContent = t;
      },
      navigate: (hash) => {
        location.hash = hash;
      },
      /** A new address without re-rendering (e.g. after the first save of a new post). */
      replaceAddress: (hash) => {
        history.replaceState(null, "", hash);
        previousHash = hash;
      },
      reloadSettings: async () => {
        ctx.settings = await loadSettings(true);
        return ctx.settings;
      },
    };
    active = (await mod.show(contentEl, ctx)) ?? mod;
  } catch (e) {
    if (my === renderCounter) notice(e.message, "error");
  } finally {
    if (my === renderCounter) mainEl.removeAttribute("aria-busy");
  }
}

/**
 * Makes a project the active one and reloads the studio on its overview. Call it only after
 * `confirmLeave()`: nothing is remembered or changed in the address before the user has
 * agreed to leave, so a cancelled switch leaves this page exactly as it was.
 */
function openProject(slug) {
  leaving = true;
  setActiveProject(slug);
  history.replaceState(null, "", "#overview");
  location.reload();
}

/**
 * Fills the project picker and settles which project is active. A project that was removed
 * by hand while this browser still remembers it falls back to the first one.
 */
async function setupProjects() {
  // This route ignores the project header, so a remembered project that is gone cannot fail it.
  const { projects } = await api("/api/projects");
  const slug = pickProject(projects, activeProject());
  if (slug) {
    // The calls of this page keep to this project, whatever the browser remembers later.
    pinProject(slug);
    setActiveProject(slug);
    projectName = projects.find((p) => p.slug === slug).name;
    document.getElementById("studio-crumb-project").textContent = projectName;
  }
  // With no project at all the picker still offers "New project…".
  const none = slug ? [] : [el("option", { value: "", text: "No project yet", selected: "" })];
  projectSelect.replaceChildren(
    ...none,
    ...projects.map((p) => el("option", { value: p.slug, text: p.name, ...(p.slug === slug ? { selected: "" } : {}) })),
    el("option", { value: NEW_PROJECT, text: "New project…" }),
  );
  projectSelect.addEventListener("change", async () => {
    const chosen = projectSelect.value;
    projectSelect.value = slug ?? ""; // stays on the current project unless the switch goes ahead
    if (!(await confirmLeave())) return;
    if (chosen !== NEW_PROJECT) return openProject(chosen);
    const name = await textDialog("New project", "Name of the brand or project");
    if (!name) return;
    try {
      openProject((await api("/api/projects", { method: "POST", body: { name } })).slug);
    } catch (e) {
      notice(e.message, "error");
    }
  });
  return slug;
}

async function start() {
  menuButton.addEventListener("click", () => {
    if (sidebarEl.classList.contains("open")) closeMenu();
    else openMenu();
  });
  overlayEl.addEventListener("click", () => closeMenu());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && sidebarEl.classList.contains("open")) closeMenu();
  });
  narrowScreen.addEventListener("change", syncMenu);
  syncMenu();
  window.addEventListener("beforeunload", (e) => {
    if (!leaving && active?.hasUnsaved?.()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("hashchange", () => {
    void render();
  });
  if (!location.hash) history.replaceState(null, "", "#overview");
  let slug;
  try {
    slug = await setupProjects();
  } catch (e) {
    notice(e.message, "error");
    return;
  }
  if (!slug) {
    // Every project folder is gone; nothing can load until one is made.
    contentEl.replaceChildren(emptyState("No project yet", 'Choose "New project…" in the picker to make one.'));
    return;
  }
  await render();
}

if (typeof document !== "undefined" && document.getElementById("studio-app")) void start();
