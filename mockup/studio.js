(() => {
  const screens = [...document.querySelectorAll(".screen")];
  const links = [...document.querySelectorAll("[data-screen]")];
  const appearance = document.querySelector("#appearance");
  const tabs = [...document.querySelectorAll("[data-panel]")];
  const panels = [...document.querySelectorAll(".editor-panel")];
  const phone = matchMedia("(max-width: 760px)");
  let activePanel = "preview";

  function showScreen(moveFocus = false) {
    const name = location.hash.slice(1);
    const screen = screens.find((item) => item.id === name) || screens[0];
    screens.forEach((item) => {
      item.hidden = item !== screen;
    });
    links.forEach((link) => {
      if (link.dataset.screen === screen.id)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const label = screen.id[0].toUpperCase() + screen.id.slice(1);
    document.querySelector("#current-screen").textContent = label;
    document.title = `${label} · Postwright`;
    if (moveFocus) {
      window.scrollTo(0, 0);
      screen.querySelector("h1").focus({ preventScroll: true });
    }
  }

  function showPanel(name, moveFocus = false) {
    activePanel = name;
    tabs.forEach((tab) => {
      const selected = tab.dataset.panel === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) tab.focus();
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `panel-${name}`);
      if (phone.matches) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute(
          "aria-labelledby",
          panel.id.replace("panel-", "tab-"),
        );
      } else {
        panel.removeAttribute("role");
        panel.setAttribute(
          "aria-labelledby",
          panel.id.replace("panel-", "") + "-heading",
        );
      }
    });
  }

  appearance.addEventListener("change", () => {
    if (appearance.value === "system")
      delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = appearance.value;
  });
  document.querySelector(".skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelector("#main").focus();
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showPanel(tab.dataset.panel));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        showPanel(tabs[next].dataset.panel, true);
      }
    });
  });
  phone.addEventListener("change", () => showPanel(activePanel));
  window.addEventListener("hashchange", () => showScreen(true));
  showPanel(activePanel);
  showScreen();
})();
