// Which links the desktop window follows, hands to the system browser, or refuses.
import { describe, expect, it } from "vitest";
import { linkAction } from "../desktop/links.js";

const origin = "http://127.0.0.1:4173";

describe("linkAction", () => {
  it.each([
    ["http://127.0.0.1:4173/#editor/abc", "stay"],
    ["blob:http://127.0.0.1:4173/0d7c1c1e-export", "stay"],
    ["https://example.com/page", "external"],
    ["http://example.com/", "external"],
    ["http://127.0.0.1:9999/", "external"],
    ["http://127.0.0.1.example.com:4173/", "external"],
    ["http://127.0.0.1:4173.example.com/", "refuse"],
    ["file:///etc/hosts", "refuse"],
    ["javascript:alert(1)", "refuse"],
    ["mailto:someone@example.com", "refuse"],
    ["not a url", "refuse"],
  ])("%s -> %s", (url, action) => {
    expect(linkAction(url, origin)).toBe(action);
  });
});
