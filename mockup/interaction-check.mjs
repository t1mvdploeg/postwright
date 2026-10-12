// A small DOM harness checks routing and keyboard behavior without claiming a browser render.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

class Element {
  constructor(id, dataset = {}) {
    this.id = id;
    this.dataset = dataset;
    this.attributes = {};
    this.listeners = {};
    this.classList = { toggle() {} };
    this.heading = { focus() {} };
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }
  querySelector() {
    return this.heading;
  }
  focus() {
    this.focused = true;
  }
}
const screens = ["overview", "editor", "planner"].map((id) => new Element(id));
const links = screens.map((screen) => new Element("", { screen: screen.id }));
const tabs = ["content", "preview", "review"].map(
  (panel) => new Element(`tab-${panel}`, { panel }),
);
const panels = tabs.map((tab) => new Element(`panel-${tab.dataset.panel}`));
const appearance = new Element("appearance");
const skip = new Element("");
const main = new Element("main");
const current = new Element("current-screen");
const phone = { matches: true, addEventListener() {} };
const document = {
  documentElement: { dataset: {} },
  querySelectorAll: (selector) =>
    ({
      ".screen": screens,
      "[data-screen]": links,
      "[data-panel]": tabs,
      ".editor-panel": panels,
    })[selector],
  querySelector: (selector) =>
    ({
      "#appearance": appearance,
      "#current-screen": current,
      ".skip-link": skip,
      "#main": main,
    })[selector],
};
const location = { hash: "#editor" };
const listeners = {};
runInNewContext(await readFile(new URL("studio.js", import.meta.url), "utf8"), {
  document,
  location,
  matchMedia: () => phone,
  window: {
    scrollTo() {},
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
  },
});
assert.equal(screens[1].hidden, false);
assert.equal(current.textContent, "Editor");
let prevented = false;
skip.listeners.click({
  preventDefault() {
    prevented = true;
  },
});
assert(prevented);
assert(main.focused);
assert.equal(
  location.hash,
  "#editor",
  "Skip link must preserve the current screen.",
);
assert.equal(screens[1].hidden, false);

tabs[0].listeners.keydown({ key: "ArrowRight", preventDefault() {} });
assert.equal(tabs[1].attributes["aria-selected"], "true");
assert(tabs[1].focused);
tabs[1].listeners.keydown({ key: "End", preventDefault() {} });
assert.equal(tabs[2].attributes["aria-selected"], "true");
assert.equal(tabs[0].tabIndex, -1);
assert.equal(panels[2].attributes.role, "tabpanel");

appearance.value = "dark";
appearance.listeners.change();
assert.equal(document.documentElement.dataset.theme, "dark");
appearance.value = "system";
appearance.listeners.change();
assert.equal(document.documentElement.dataset.theme, undefined);
location.hash = "#planner";
listeners.hashchange();
assert.equal(screens[2].hidden, false);
assert.equal(screens[1].hidden, true);
assert.equal(links[2].attributes["aria-current"], "page");
assert.equal(links[1].attributes["aria-current"], undefined);
console.log(
  "Interaction harness passed: routes, skip link, arrow/End panel navigation and system colour reset.",
);
