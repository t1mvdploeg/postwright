// `registerOwnTemplates`: one template that cannot be compiled is skipped with a warning and
// does not stop the others (a studio that does not load is worse than a missing template).
import { afterEach, describe, expect, it, vi } from "vitest";
import { allTemplates, registerOwnTemplates } from "../src/web/studio/templates.js";
import { exampleTemplate, saved } from "./helpers/template.js";

// The compiler is the real one, except that it throws for a template named "Boom": a template that
// `checkTemplate` passes and the compiler cannot handle should not exist, but must not take the studio down.
vi.mock("../src/web/studio/own-template.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/web/studio/own-template.js")>();
  return {
    ...actual,
    compileTemplate: (file: any) => {
      if (file?.name === "Boom") throw new Error("boom");
      return actual.compileTemplate(file);
    },
  };
});

const own = () =>
  allTemplates()
    .filter((t) => t.own)
    .map((t) => t.id);

describe("registerOwnTemplates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    registerOwnTemplates([]);
  });

  it("skips a refused template and one that cannot be compiled, with a warning each, and registers the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = saved({ ...exampleTemplate(), css: ".a { background: url(x); }" }, "own-11111111");
    const boom = saved({ ...exampleTemplate(), name: "Boom" }, "own-22222222");
    registerOwnTemplates([
      refused,
      boom,
      saved(exampleTemplate(), "own-33333333"),
      saved(exampleTemplate(), "own-44444444"),
    ]);
    expect(own()).toEqual(["own-33333333", "own-44444444"]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.join("\n")).toMatch(/boom/);
  });
});
