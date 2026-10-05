import { createIcs, fold } from "../studio/ics.js";
import { weekDates } from "./model.js";
// Independent frontend concept. All sample changes stay in memory in this tab.
const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#${name}" /></svg>`;
const posts = [
  {
    id: "meaning",
    title: "Less noise. More meaning.",
    headline: "Less noise.\nMore meaning.",
    theme: "terracotta",
    template: "Statement",
    status: "Scheduled",
    date: "2026-10-05",
    time: "09:30",
    caption: "A good post starts with something worth saying. Make a little less noise, and a little more meaning.",
    alt: "The words Less noise. More meaning. on a terracotta background.",
  },
  {
    id: "point",
    title: "A good post has a point",
    headline: "A good post\nhas a point.",
    theme: "paper",
    template: "Statement",
    status: "Draft",
    date: "2026-10-07",
    time: "11:00",
    caption: "One thought. One clear message. Start there.",
    alt: "A typographic post about making one clear point.",
  },
  {
    id: "ideas",
    title: "Make room for good ideas",
    headline: "Make room\nfor good\nideas.",
    theme: "olive",
    template: "Statement",
    status: "Scheduled",
    date: "2026-10-08",
    time: "10:00",
    caption: "Give your next idea a little room to grow. Save it, shape it, and make it your own.",
    alt: "Cream lettering on an olive green background.",
  },
  {
    id: "templates",
    title: "Nine ways to get started",
    headline: "9",
    theme: "statistic",
    template: "Statistic",
    status: "Draft",
    date: "2026-10-09",
    time: "09:00",
    caption: "Postwright includes nine templates. Pick a starting point and make it yours.",
    alt: "The number nine and the words templates, endless possibilities.",
  },
];
const presets = [
  {
    id: "statement",
    name: "Statement",
    theme: "terracotta",
    headline: "Less noise.\nMore meaning.",
    description: "One thought, clearly put.",
  },
  {
    id: "question",
    name: "Question & answer",
    theme: "paper",
    headline: "What makes a\ngood post?",
    description: "A question worth answering.",
  },
  {
    id: "steps",
    name: "Steps",
    theme: "olive",
    headline: "From idea\nto ready.",
    description: "A clear path, step by step.",
  },
  { id: "statistic", name: "Statistic", theme: "statistic", headline: "9", description: "A number with a source." },
  {
    id: "product-image",
    name: "Product image",
    theme: "paper",
    headline: "Something\nworth sharing.",
    description: "Give your image the stage.",
  },
  {
    id: "carousel",
    name: "Carousel",
    theme: "terracotta",
    headline: "A little more\nto the story.",
    description: "One idea, across a few slides.",
  },
  {
    id: "link-preview",
    name: "Link preview",
    theme: "olive",
    headline: "A studio for\nyour ideas.",
    description: "A story worth opening.",
  },
  {
    id: "profile-banner",
    name: "Profile banner",
    theme: "paper",
    headline: "Your ideas. Beautifully put.",
    description: "A signature for your profile.",
  },
  {
    id: "company-cover",
    name: "Company cover",
    theme: "olive",
    headline: "Make room for good ideas.",
    description: "Your brand, at first glance.",
  },
];
const sampleFacts = [
  {
    claim: "9 post templates",
    detail: "Statement, statistic, carousel and more.",
    source: "Postwright README",
    url: "https://github.com/t1mvdploeg/postwright",
    expires: "",
  },
  {
    claim: "10 supported formats",
    detail: "Across the built-in template collection.",
    source: "Postwright README",
    url: "https://github.com/t1mvdploeg/postwright",
    expires: "",
  },
  {
    claim: "No account required",
    detail: "Postwright runs on your own computer.",
    source: "Postwright README",
    url: "https://github.com/t1mvdploeg/postwright",
    expires: "",
  },
];
const savedSnippets = [
  { name: "An opening thought", kind: "Opener", text: "A good post starts with something worth saying." },
  { name: "A gentle invitation", kind: "Closer", text: "What would you add? Share your perspective." },
  { name: "The sign-off", kind: "Closer", text: "Your ideas. Beautifully put." },
  { name: "Keep it considered", kind: "Hashtags", text: "#ContentCreation #BrandDesign #Postwright" },
];
const preferences = { linkedin: true, instagram: false, budget: 10 };
let brandVoice = "Keep it human. Start with a clear thought. Say enough, then give the idea room to breathe.";
let weekOffset = 0;
function readableDay(date, options = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let filter = "All posts";
let selectedDay = 5;
let editing;
let toastTimer;
const labels = {
  overview: "Overview",
  library: "All posts",
  planning: "Planner",
  templates: "Templates",
  brand: "Brand kit",
  facts: "Fact bank",
  snippets: "Snippets",
  editor: "Post editor",
  settings: "Settings",
};
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4000);
}
function badge(post) {
  return `<span class="badge ${post.status === "Draft" ? "draft" : ""}">${post.status === "Draft" ? '<i class="status-dot draft"></i>' : icon("tick")}${escape(post.status)}</span>`;
}
function artwork(post) {
  const layout = post.preset || "statement";
  let detail = "";
  if (layout === "steps")
    detail =
      '<ol class="artwork-steps"><li>Choose a thought.</li><li>Make it yours.</li><li>Check and export.</li></ol>';
  if (layout === "question")
    detail = '<p class="artwork-answer">A clear thought. A point of view.<br/>A little room to breathe.</p>';
  if (layout === "product-image") detail = '<div class="artwork-image">Your image here</div>';
  if (layout === "carousel") detail = '<span class="artwork-slide">01 / 03</span>';
  if (layout === "link-preview") detail = '<div class="artwork-link">Read the full story <span>postwright</span></div>';
  return `<div class="artwork ${post.theme} layout-${layout}"><div class="artwork-logo"><img src="../brand/logo/${["terracotta", "olive"].includes(post.theme) ? "mark-on-ink" : "mark"}.svg" alt=""/>Postwright</div><div class="artwork-body"><div class="artwork-title">${escape(post.headline)}${post.preset === "statistic" || post.template === "Statistic" ? '<div class="artwork-stat-detail">templates.<br/>Endless possibilities.</div>' : ""}</div>${detail}</div><div class="artwork-footer"><span>Your ideas. Beautifully put.</span><span>postwright</span></div></div>`;
}
function card(post) {
  return `<article class="post-card"><a id="post-${post.id}" href="#editor/${post.id}" aria-label="Edit ${escape(post.title)}">${artwork(post)}<div class="post-meta"><h3>${escape(post.title)}</h3><p>${escape(post.template)} · Square post</p></div></a><div class="post-status">${badge(post)}<span><span class="channel" aria-label="${post.channel || "LinkedIn"}">${post.channel === "Instagram" ? "ig" : "in"}</span>${post.channel || "LinkedIn"}</span></div></article>`;
}
function heading(title, description, date = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${date ? `<div class="date-label">${date}</div>` : ""}</div>`;
}
function agenda(post) {
  return `<a id="agenda-${post.id}" class="agenda-item" href="#editor/${post.id}"><span class="agenda-time">${post.time}</span><div><strong>${escape(post.title)}</strong><small><span class="channel">${post.channel === "Instagram" ? "ig" : "in"}</span>${post.channel || "LinkedIn"} · ${escape(post.status)}</small></div></a>`;
}
function overview() {
  $("#main").innerHTML = `
    ${heading("A little structure.<br/>A lot of possibility.", "Your ideas, your brand, your next great post.", "Monday, 5 October 2026")}
    <div class="dashboard-grid" style="margin-top:24px">
      <section>
        <div class="section-heading"><h2>On your creative desk</h2><a id="view-all-posts" class="text-link" href="#library">View all posts ${icon("arrow")}</a></div>
        <div class="posts-grid">${posts.slice(0, 4).map(card).join("")}</div>
      </section>
      <aside class="dashboard-side">
        <section class="week-panel">
          <div class="section-heading"><h2>A look at your week</h2>${icon("calendar")}</div>
          <p class="week-date">5–11 October</p>
          <div class="week-days">${["M", "T", "W", "T", "F", "S", "S"].map((d, i) => `<button class="week-day ${selectedDay === i + 5 ? "active" : ""}" data-day="${i + 5}" aria-pressed="${selectedDay === i + 5}" aria-label="${i + 5} October"><span>${d}</span><strong>${i + 5}</strong>${[5, 8].includes(i + 5) ? "<i></i>" : '<i style="visibility:hidden"></i>'}</button>`).join("")}</div>
          <div id="day-agenda"></div>
          <a id="open-planner" class="text-link" href="#planning">Open planner ${icon("arrow")}</a>
        </section>
      </aside>
    </div>`;
  showAgenda();
  document.querySelectorAll("[data-day]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedDay = Number(button.dataset.day);
      overview();
    }),
  );
}
function showAgenda() {
  const day = posts.filter((p) => p.status === "Scheduled" && p.date === weekDates(0)[selectedDay - 5]);
  const upcoming = posts
    .filter((p) => p.status === "Scheduled" && p.date > weekDates(0)[0] && p.date <= weekDates(0)[6])
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  $("#day-agenda").innerHTML =
    `<div class="agenda-label">${selectedDay === 5 ? "TODAY" : `${selectedDay} OCTOBER`}</div>${day.length ? day.map(agenda).join("") : '<p class="quiet" style="margin-bottom:24px">A little breathing room.<br/>Nothing scheduled for this day.</p>'}${selectedDay === 5 && upcoming ? `<div class="agenda-label">COMING UP · ${readableDay(upcoming.date, { weekday: "long" }).toUpperCase()}</div>${agenda(upcoming)}` : ""}`;
}
function library() {
  $("#main").innerHTML =
    `${heading("Your posts", "Everything you’re making, in one place.")}<div class="filter-bar"><div class="tabs">${["All posts", "Draft", "Scheduled"].map((t) => `<button data-filter="${t}" aria-pressed="${filter === t}">${t}${t === "All posts" ? ` · ${posts.length}` : ""}</button>`).join("")}</div><label class="search-field">${icon("search")}<input id="post-search" type="search" aria-label="Search posts" placeholder="Search your posts…" /></label></div><div class="posts-grid library-grid" id="library-grid"></div>`;
  const update = () => {
    const query = $("#post-search").value.toLowerCase();
    const visible = posts.filter(
      (p) =>
        (filter === "All posts" || p.status === filter) && `${p.title} ${p.template}`.toLowerCase().includes(query),
    );
    $("#library-grid").innerHTML = visible.length
      ? visible.map(card).join("")
      : '<div class="empty"><h2>No posts found</h2><p>Try another search or choose All posts.</p></div>';
  };
  $("#post-search").addEventListener("input", update);
  document.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      update();
    }),
  );
  update();
}
function planning() {
  const dates = weekDates(weekOffset);
  $("#main").innerHTML = `${heading("Planner", "A clear view of what goes out, and when.")}
    <div class="filter-bar"><div class="week-controls"><button id="previous-week" class="icon-button" aria-label="Previous week">${icon("back")}</button><h2>${readableDay(dates[0])}–${readableDay(dates[6], { day: "numeric", month: "short", year: "numeric" })}</h2><button id="next-week" class="icon-button" aria-label="Next week">${icon("arrow")}</button>${weekOffset ? '<button id="this-week" class="button">This week</button>' : ""}</div><button id="calendar-export" class="button">${icon("download")}Export calendar</button></div>
    <div class="calendar-week">${dates
      .map(
        (date, i) =>
          `<section class="calendar-day ${date === "2026-10-05" ? "today" : ""}"><div class="calendar-date"><span>${readableDay(date, { weekday: "short" })}</span><strong>${Number(date.slice(-2))}</strong></div><div class="calendar-content">${posts
            .filter((p) => p.date === date && p.status === "Scheduled")
            .map(
              (p) =>
                `<a id="calendar-${p.id}" class="calendar-post" href="#editor/${p.id}"><span class="calendar-thumb ${p.theme}">${icon("text")}</span><strong>${escape(p.title)}</strong><small>${p.time} · ${p.channel || "LinkedIn"}</small></a>`,
            )
            .join(
              "",
            )}<a id="plan-${i}" class="calendar-add" href="#editor/new/terracotta/${date}" aria-label="Plan a post for ${readableDay(date)}">${icon("plus")}<span>Plan a post</span></a></div></section>`,
      )
      .join("")}</div>
    <section class="planner-drafts"><div class="section-heading"><h2>Ready when you are</h2><a id="planner-drafts" href="#library" class="text-link">All drafts ${icon("arrow")}</a></div><div class="draft-list">${
      posts
        .filter((p) => p.status === "Draft")
        .map(
          (p) =>
            `<a id="planner-draft-${p.id}" href="#editor/${p.id}"><span>${escape(p.title)}</span><span class="quiet">Draft ${icon("arrow")}</span></a>`,
        )
        .join("") || '<p class="quiet">No drafts waiting. Your week is clear.</p>'
    }</div></section>`;
  $("#previous-week").addEventListener("click", () => {
    weekOffset--;
    planning();
  });
  $("#next-week").addEventListener("click", () => {
    weekOffset++;
    planning();
  });
  $("#this-week")?.addEventListener("click", () => {
    weekOffset = 0;
    planning();
  });
  $("#calendar-export").addEventListener("click", () => {
    const entries = posts
      .filter((p) => p.status === "Scheduled")
      .map((p) => ({
        ...p,
        scheduled: new Date(`${p.date}T${p.time}:00`).toISOString(),
        status: "scheduled",
        caption: { linkedin: p.caption },
      }));
    const baseUrl = `${location.origin}${location.pathname}`;
    const calendar = createIcs(entries, { baseUrl, brandName: "Postwright" })
      .replace(/\r\n /g, "")
      .replaceAll(`${baseUrl}/#editor/`, `${baseUrl}#editor/`)
      .split("\r\n")
      .map(fold)
      .join("\r\n");
    download("postwright-planner.ics", calendar, "text/calendar");
    toast("Calendar exported. Posts are still published manually.");
  });
}
function templates() {
  $("#main").innerHTML = `${heading("Templates", "Choose a starting point. Your brand is already built in.")}
    <div class="template-grid">${presets.map((p) => `<article class="template-card"><a id="template-${p.id}" href="#editor/new/${p.theme}/template/${p.id}" aria-label="Use ${p.name}"><div class="template-preview">${artwork({ ...p, preset: p.id })}</div><div class="post-meta"><h3>${p.name}</h3><p>${p.description}</p></div></a></article>`).join("")}</div>`;
}
function brand() {
  $("#main").innerHTML = `${heading("Brand kit", "The essentials that make every post feel like you.")}
    <div class="settings-sheet"><section class="settings-row"><div><h2>Identity</h2><p>Your signature across every format.</p></div><div class="identity-sample"><img src="../brand/logo/default.svg" alt="Postwright"/><div><span class="quiet">Primary logo · SVG</span><a id="download-logo" class="text-link" href="../brand/logo/default.svg" download="postwright-logo.svg">Download ${icon("download")}</a></div></div></section>
    <section class="settings-row"><div><h2>Colours</h2><p>A warm, considered palette.</p></div><div class="color-list">${[
      ["#bc452e", "Clay"],
      ["#404b39", "Olive"],
      ["#e9e5da", "Paper"],
      ["#292b27", "Ink"],
    ]
      .map(
        ([c, n]) =>
          `<button class="color-swatch" data-hex="${c}" aria-label="Copy ${n} colour ${c}"><span style="background:${c}"></span><strong>${n}</strong><small>${c}</small></button>`,
      )
      .join("")}</div></section>
    <section class="settings-row"><div><h2>Typography</h2><p>Inter · Regular, Medium, Semibold</p></div><div class="type-sample"><span>Clear words. Good intentions.</span><p>Aa Bb Cc Dd Ee Ff Gg · 0123456789</p></div></section>
    <section class="settings-row"><div><h2>Tone of voice</h2><p>A little guidance for your next caption.</p></div><form id="brand-voice-form"><label class="field"><span class="sr-only">Writing guidelines</span><textarea id="voice" maxlength="500">${escape(brandVoice)}</textarea></label><button class="button" type="submit">Save guidelines</button></form></section></div>`;
  document
    .querySelectorAll("[data-hex]")
    .forEach((b) => b.addEventListener("click", () => copyText(b.dataset.hex, "Colour copied.")));
  $("#brand-voice-form").addEventListener("submit", (e) => {
    e.preventDefault();
    brandVoice = $("#voice").value.trim();
    toast("Writing guidelines saved for this tab.");
  });
}
async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast("Copy unavailable. Select the text to copy it.");
  }
}
function facts() {
  $("#main").innerHTML = `${heading("Fact bank", "A source behind every claim. A little confidence behind every post.")}
    <div class="filter-bar"><span class="quiet">${sampleFacts.length} source-backed facts</span><label class="search-field">${icon("search")}<input id="fact-search" type="search" aria-label="Search facts" placeholder="Find a fact…"/></label></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Claim</th><th>Source</th><th>Valid until</th><th>Status</th></tr></thead><tbody id="fact-rows"></tbody></table></div>
    <details class="inline-add"><summary>${icon("plus")}Add a fact</summary><form id="fact-form" class="inline-form"><label class="field"><span>Claim</span><input name="claim" required maxlength="160" placeholder="A fact you can stand behind"/></label><label class="field"><span>Source name</span><input name="source" required maxlength="100" placeholder="Report, website or document"/></label><label class="field"><span>Source URL</span><input name="url" type="url" required placeholder="https://…"/></label><label class="field"><span>Valid until (optional)</span><input name="expires" type="date"/></label><button class="button primary" type="submit">Save fact</button></form></details>`;
  const update = () => {
    const q = $("#fact-search").value.toLowerCase();
    const rows = sampleFacts.filter((f) => `${f.claim} ${f.source}`.toLowerCase().includes(q));
    $("#fact-rows").innerHTML =
      rows
        .map(
          (f) =>
            `<tr><td>${escape(f.claim)}${f.detail ? `<small>${escape(f.detail)}</small>` : ""}</td><td><a class="source-link" href="${escape(f.url)}" target="_blank" rel="noopener noreferrer">${escape(f.source)} ${icon("external")}</a></td><td class="quiet">${f.expires ? readableDay(f.expires) : "No end date"}</td><td><span class="badge ${f.expires && f.expires < "2026-10-05" ? "draft" : ""}">${icon("tick")}${f.expires && f.expires < "2026-10-05" ? "Expired" : "Active"}</span></td></tr>`,
        )
        .join("") || '<tr><td colspan="4" class="empty">No matching facts. Try another search.</td></tr>';
  };
  $("#fact-search").addEventListener("input", update);
  update();
  $("#fact-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!/^https?:\/\//i.test(data.url)) {
      toast("Use a source URL starting with https:// or http://.");
      return;
    }
    sampleFacts.push({ ...data, detail: "" });
    facts();
    toast("Fact saved for this tab.");
  });
}
function snippets() {
  $("#main").innerHTML = `${heading("Snippets", "Your useful words, ready to reuse.")}
    <div class="filter-bar"><div class="tabs">${["All", "Opener", "Closer", "Hashtags"].map((name, i) => `<button data-snippet-filter="${name}" aria-pressed="${i === 0}">${name}</button>`).join("")}</div><span class="quiet">${savedSnippets.length} saved snippets</span></div><div id="snippet-list"></div>
    <details class="inline-add"><summary>${icon("plus")}Add a snippet</summary><form id="snippet-form" class="inline-form"><label class="field"><span>Name</span><input name="name" required maxlength="80"/></label><label class="field"><span>Type</span><select name="kind"><option>Opener</option><option>Closer</option><option>Hashtags</option></select></label><label class="field wide"><span>Text</span><textarea name="text" required maxlength="500"></textarea></label><button class="button primary" type="submit">Save snippet</button></form></details>`;
  const update = (kind = "All") => {
    $("#snippet-list").innerHTML =
      savedSnippets
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => kind === "All" || s.kind === kind)
        .map(
          ({ s, i }) =>
            `<div class="snippet"><div><small>${escape(s.name)} · ${s.kind}</small><p>${escape(s.text)}</p></div><button class="button" data-copy="${i}">Copy text</button></div>`,
        )
        .join("") || '<div class="empty"><h2>No snippets here yet</h2><p>Add a reusable line below.</p></div>';
    document
      .querySelectorAll("[data-copy]")
      .forEach((b) =>
        b.addEventListener("click", () => copyText(savedSnippets[Number(b.dataset.copy)].text, "Snippet copied.")),
      );
  };
  document.querySelectorAll("[data-snippet-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-snippet-filter]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      update(b.dataset.snippetFilter);
    }),
  );
  update();
  $("#snippet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    savedSnippets.push(Object.fromEntries(new FormData(e.currentTarget)));
    snippets();
    toast("Snippet saved for this tab.");
  });
}
function settings() {
  $("#main").innerHTML = `${heading("Settings", "A few preferences. A studio that works your way.")}
    <form id="settings-form" class="settings-sheet"><section class="settings-row"><div><h2>Publishing channels</h2><p>Choose which channels appear in the editor.</p></div><div class="channel-settings"><label><span><strong>LinkedIn</strong><small>Square, portrait and profile artwork</small></span><input type="checkbox" name="linkedin" ${preferences.linkedin ? "checked" : ""}/></label><label><span><strong>Instagram</strong><small>Square posts and stories</small></span><input type="checkbox" name="instagram" ${preferences.instagram ? "checked" : ""}/></label></div></section>
    <section class="settings-row"><div><h2>Writing assistance</h2><p>Try the flow with sample suggestions.</p></div><div><div class="settings-status"><span class="badge">Sample mode</span><p class="quiet">Suggestions in this concept are examples.</p></div><label class="field budget-field"><span>Monthly spending limit · USD</span><input name="budget" type="number" min="0" max="1000" step="1" value="${preferences.budget}" required/><small>For live AI calls in the current app.</small></label></div></section>
    <section class="settings-row"><div><h2>Your workspace</h2><p>Postwright is a local studio.</p></div><p class="quiet">This concept uses sample data. Changes stay in this tab and reset when you reload.</p></section><div class="settings-actions"><button class="button primary" type="submit">Save preferences</button></div></form>`;
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (!data.has("linkedin") && !data.has("instagram")) {
      toast("Keep at least one publishing channel enabled.");
      return;
    }
    preferences.linkedin = data.has("linkedin");
    preferences.instagram = data.has("instagram");
    preferences.budget = Number(data.get("budget"));
    toast("Preferences saved for this tab.");
  });
}
function editor(id, theme, date, presetId) {
  theme = ["terracotta", "paper", "olive", "statistic"].includes(theme) ? theme : "terracotta";
  const preset = presets.find((p) => p.id === presetId);
  const original = posts.find((p) => p.id === id);
  editing = original
    ? { ...original }
    : {
        id: `concept-${Date.now()}`,
        title: "Your next good idea",
        headline: preset?.headline || (theme === "statistic" ? "9" : "Good ideas\ndeserve\nto be shared."),
        preset: preset?.id || "statement",
        theme: theme || "terracotta",
        template: preset?.name || (theme === "statistic" ? "Statistic" : "Statement"),
        status: "Draft",
        date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : "2026-10-09",
        time: "09:00",
        caption: "Give your idea a clear voice. Make something worth sharing.",
        alt: "",
      };
  const channels = [preferences.linkedin && "LinkedIn", preferences.instagram && "Instagram"].filter(Boolean);
  const channel = channels.includes(editing.channel) ? editing.channel : channels[0];
  editing.channel = channel;
  $("#main").innerHTML =
    `<div class="editor-heading"><div><a id="editor-back" class="text-link" href="#library">${icon("back")}Back to your posts</a><h1 class="editor-title">Make it yours.</h1></div><div class="editor-actions"><button id="save" class="button">Save draft</button><button id="schedule" class="button primary">${icon("calendar")}Add to planner</button></div></div>
    <div class="editor-grid"><section class="editor-preview" aria-label="Live post preview"><div class="preview-toolbar"><span>${editing.template}</span><select id="edit-channel" aria-label="Publishing channel">${channels.map((c) => `<option ${c === channel ? "selected" : ""}>${c}</option>`).join("")}</select><button id="export" class="text-button">${icon("download")}Export SVG</button></div><div id="preview-artwork">${artwork(editing)}</div><div class="preview-caption"><span>${["profile-banner", "company-cover"].includes(editing.preset) ? "Cover artwork" : "Square post"}</span><span>Live preview</span></div>
    <details class="brand-check-details"><summary>${icon("shield")}Brand check<span id="check-summary"></span></summary><div class="check-item">${icon("tick")}Colours from your brand kit</div><div class="check-item">${icon("tick")}Consistent typography</div><div id="headline-check" class="check-item"></div><div id="alt-check" class="check-item"></div><p class="quiet">Illustrative checks for this concept.</p></details></section>
    <section class="editor-fields"><label class="field"><span>Post name</span><input id="edit-title" value="${escape(editing.title)}" maxlength="100" /></label><label class="field"><span>Headline</span><textarea id="edit-headline" maxlength="90" rows="3">${escape(editing.headline)}</textarea></label>
    <div class="field background-field"><span>Background</span><div class="background-picker">${[
      ["terracotta", "#bc452e"],
      ["paper", "#e9e5da"],
      ["olive", "#404b39"],
      ["statistic", "#dedfc6"],
    ]
      .map(
        ([t, c]) =>
          `<button data-theme="${t}" aria-label="${t} background" aria-pressed="${editing.theme === t}" style="background:${c}"></button>`,
      )
      .join("")}</div></div>
    <label class="field"><span id="caption-channel">Caption · ${channel}</span><textarea id="edit-caption" maxlength="3000" rows="4">${escape(editing.caption)}</textarea></label>
    <details class="writing-help"><summary>${icon("spark")}A little writing help</summary><div class="writing-suggestion"><span class="badge">Sample suggestion</span><p>A clear thought can go a long way. Make room for your ideas, and give them a voice that feels like you.</p><button id="use-suggestion" class="button">Use this caption</button></div></details>
    <label class="field alt-field"><span>Alt text</span><textarea id="edit-alt" maxlength="300" rows="2" aria-describedby="alt-help">${escape(editing.alt)}</textarea><small id="alt-help">Describe your post for someone who can’t see it.</small></label>
    <details class="schedule-details"><summary>${icon("calendar")}Publication date & time</summary><div class="field-pair"><label class="field"><span>Date</span><input id="edit-date" type="date" value="${editing.date}" /></label><label class="field"><span>Time</span><input id="edit-time" type="time" value="${editing.time}" /></label></div></details></section></div>`;
  const update = () => {
    editing.channel = $("#edit-channel").value;
    $("#caption-channel").textContent = `Caption · ${editing.channel}`;
    editing.title = $("#edit-title").value;
    editing.headline = $("#edit-headline").value;
    editing.caption = $("#edit-caption").value;
    editing.alt = $("#edit-alt").value;
    editing.date = $("#edit-date").value;
    editing.time = $("#edit-time").value;
    $("#preview-artwork").innerHTML = artwork(editing);
    check();
  };
  document
    .querySelectorAll(".editor-grid input,.editor-grid textarea,.editor-grid select")
    .forEach((e) => e.addEventListener("input", update));
  document.querySelectorAll("[data-theme]").forEach((b) =>
    b.addEventListener("click", () => {
      editing.theme = b.dataset.theme;

      document.querySelectorAll("[data-theme]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      update();
    }),
  );
  const save = (status) => {
    if (!editing.title.trim() || !editing.headline.trim()) {
      toast("Add a post name and headline before saving.");
      return;
    }
    editing.status = status;
    const i = posts.findIndex((p) => p.id === editing.id);
    if (i < 0) posts.push({ ...editing });
    else posts[i] = { ...editing };
    $("#post-count").textContent = posts.length;
    toast(
      status === "Scheduled" ? "Added to the sample planner. Export to publish yourself." : "Draft saved for this tab.",
    );
  };
  $("#save").addEventListener("click", () => save("Draft"));
  $("#schedule").addEventListener("click", () => {
    save("Scheduled");
    const selected = new Date(`${editing.date}T12:00:00Z`);
    const monday = new Date(weekDates(0)[0] + "T12:00:00Z");
    weekOffset = Math.floor((selected - monday) / (7 * 86400000));
    location.hash = "#planning";
  });
  $("#export").addEventListener("click", exportConcept);
  $("#use-suggestion").addEventListener("click", () => {
    $("#edit-caption").value =
      "A clear thought can go a long way. Make room for your ideas, and give them a voice that feels like you.";
    update();
    toast("Sample caption added. Make it your own.");
  });
  check();
}
function check() {
  const hasHeadline = Boolean(editing.headline.trim());
  const hasAlt = Boolean(editing.alt.trim());
  $("#headline-check").classList.toggle("error", !hasHeadline);
  $("#headline-check").innerHTML =
    `${icon(hasHeadline ? "tick" : "text")}${hasHeadline ? "Headline added" : "Add a headline"}`;
  $("#alt-check").classList.toggle("error", !hasAlt);
  $("#alt-check").innerHTML =
    `${icon(hasAlt ? "tick" : "text")}${hasAlt ? "Alt text included" : "Add alt text to schedule"}`;
  $("#check-summary").textContent = hasHeadline && hasAlt ? "Ready" : "Needs attention";
  $("#schedule").disabled = !hasHeadline || !hasAlt || !editing.title.trim() || !editing.date || !editing.time;
}
function exportConcept() {
  const colours = {
    terracotta: ["#bc452e", "#fff3e6"],
    paper: ["#e9e5da", "#454c3c"],
    olive: ["#404b39", "#e9edda"],
    statistic: ["#dedfc6", "#3d4936"],
  };
  const [background, foreground] = colours[editing.theme];
  const lines = editing.headline
    .split("\n")
    .flatMap((line) => line.match(/.{1,18}(?:\s|$)|\S.{0,17}/g) || [""])
    .slice(0, 6);
  const title = lines.map((line, i) => `<tspan x="90" dy="${i ? 105 : 0}">${escape(line.trim())}</tspan>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img"><title>${escape(editing.title)}</title><desc>${escape(editing.alt)}</desc><rect width="1080" height="1080" fill="${background}"/><g fill="${foreground}" font-family="Arial,sans-serif"><text x="90" y="100" font-size="27">Postwright</text><text x="90" y="${Math.max(260, 780 - lines.length * 105)}" font-size="94" font-weight="600" letter-spacing="-3">${title}</text><text x="90" y="995" font-size="22">Your ideas. Beautifully put.</text></g><path d="M90 935H990" stroke="${foreground}"/></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "postwright-concept.svg";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("SVG concept exported. This is a simplified artwork preview.");
}
function render() {
  if (location.hash === "#main") {
    $("#main").focus();
    return;
  }
  const [requested, id, theme, date, presetId] = location.hash.slice(1).split("/");
  const page = labels[requested] ? requested : "overview";
  $("#page-name").textContent = labels[page];
  document.title = `${labels[page]} — Postwright concept`;
  document.querySelectorAll("[data-page]").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#sidebar").classList.remove("open");
  $("#menu").setAttribute("aria-expanded", "false");
  $("#main").dataset.page = page;
  $("#new-post").hidden = page === "editor";
  ({
    overview,
    library,
    planning,
    templates,
    brand,
    facts,
    snippets,
    settings,
    editor: () => editor(id, theme, date, presetId),
  })[page]();
  window.scrollTo({ top: 0 });
}
$("#menu").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#menu").setAttribute("aria-expanded", String(open));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#sidebar").classList.remove("open");
    $("#menu").setAttribute("aria-expanded", "false");
  }
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
    e.preventDefault();
    openSearch();
  }
});
function openSearch() {
  filter = "All posts";
  if (location.hash === "#library") library();
  else {
    location.hash = "#library";
  }
  requestAnimationFrame(() => requestAnimationFrame(() => $("#post-search")?.focus()));
}
$("#search-open").addEventListener("click", openSearch);
window.addEventListener("hashchange", render);
render();
