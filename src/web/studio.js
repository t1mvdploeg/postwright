// The shell: navigation and a hash router that loads a module per screen
// (`src/web/studio/<screen>.js`).
//
// The editor needs the full width and the code loads only on this page.
import { activeProject, api, confirmDialog, el, icon, notice, setActiveProject, textDialog } from "/ui.js";
import { loadBrand } from "/studio/brand.js";
import { pickProject } from "/projects.js";

const NAV_GROUPS = [
  [
    "Work",
    [
      ["overview", "Overview"],
      ["editor", "Editor"],
      ["library", "Library"],
      ["planning", "Planning"],
    ],
  ],
  [
    "Sources",
    [
      ["facts", "Fact bank"],
      ["snippets", "Snippets"],
      ["brand-kit", "Brand kit"],
    ],
  ],
  ["System", [["settings", "Settings"]]],
];
const SCREENS = new Map(NAV_GROUPS.flatMap(([, s]) => s));
// The icon per screen, the same sprite as the rest of the tool (/icons.svg).
const SCREEN_ICON = {
  overview: "start",
  editor: "edit",
  library: "archive",
  planning: "calendar",
  facts: "source",
  snippets: "document",
  "brand-kit": "layers",
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
const sidebarEl = document.getElementById("studio-sidebar");
const overlayEl = document.getElementById("studio-overlay");
const menuButton = document.getElementById("studio-menu");
const projectSelect = document.getElementById("studio-project");

const NEW_PROJECT = "__new__";
let projectName = "";

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

function closeMenu() {
  sidebarEl.classList.remove("open");
  overlayEl.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
}

function renderNav(screen) {
  navEl.replaceChildren(
    ...NAV_GROUPS.map(([group, screens]) =>
      el("div", { class: "nav-group" }, [
        el("span", { class: "nav-group-label", text: group }),
        ...screens.map(([id, name]) =>
          el(
            "a",
            {
              href: `#${id}`,
              class: id === screen ? "active" : "",
              ...(id === screen ? { "aria-current": "page" } : {}),
              onclick: closeMenu,
            },
            [icon(SCREEN_ICON[id]), name],
          ),
        ),
      ]),
    ),
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

async function render() {
  // The skip link at the top of the page jumps to #studio-main; that is not a screen, so
  // restore the hash.
  if (location.hash === "#studio-main") {
    history.replaceState(null, "", previousHash || "#overview");
    mainEl.focus();
    return;
  }
  if (active?.hasUnsaved?.() && location.hash !== previousHash) {
    const proceed = await confirmDialog("The changes to this post are not saved yet and will be lost.", {
      title: "Leave without saving?",
      confirmText: "Leave and discard changes",
      dangerous: true,
    });
    if (!proceed) {
      history.replaceState(null, "", previousHash);
      return;
    }
  }
  const my = ++renderCounter;
  const { screen, parts } = readRoute(location.hash);
  previousHash = location.hash || "#overview";
  active?.leave?.();
  active = null;
  renderNav(screen);
  titleEl.textContent = SCREENS.get(screen);
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

/** Makes a project the active one and reloads the studio on its overview. */
function openProject(slug) {
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
  setActiveProject(slug);
  projectName = projects.find((p) => p.slug === slug).name;
  document.querySelector(".app-page-headline span").textContent = `Marketing studio · ${projectName}`;
  projectSelect.replaceChildren(
    ...projects.map((p) => el("option", { value: p.slug, text: p.name, ...(p.slug === slug ? { selected: "" } : {}) })),
    el("option", { value: NEW_PROJECT, text: "New project…" }),
  );
  projectSelect.addEventListener("change", async () => {
    if (projectSelect.value !== NEW_PROJECT) return openProject(projectSelect.value);
    projectSelect.value = slug; // back to the current one while the dialog is open
    const name = await textDialog("New project", "Name of the brand or project");
    if (!name) return;
    try {
      openProject((await api("/api/projects", { method: "POST", body: { name } })).slug);
    } catch (e) {
      notice(e.message, "error");
    }
  });
}

async function start() {
  menuButton.addEventListener("click", () => {
    const open = sidebarEl.classList.toggle("open");
    overlayEl.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
  });
  overlayEl.addEventListener("click", closeMenu);
  window.addEventListener("beforeunload", (e) => {
    if (active?.hasUnsaved?.()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("hashchange", () => {
    void render();
  });
  if (!location.hash) history.replaceState(null, "", "#overview");
  try {
    await setupProjects();
  } catch (e) {
    notice(e.message, "error");
    return;
  }
  await render();
}

if (typeof document !== "undefined" && document.getElementById("studio-app")) void start();
