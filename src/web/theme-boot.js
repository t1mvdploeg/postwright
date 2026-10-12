// Applies the stored colour choice before the first paint. A classic script on purpose: a module
// runs after the page is drawn, and the content security policy allows no inline script.
// Keep the key and the values the same as in /studio/theme.js.
try {
  const t = localStorage.getItem("postwright.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch {
  // Blocked storage: the computer's setting applies.
}
