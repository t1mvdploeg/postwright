import { describe, expect, it } from "vitest";
import { groupFields } from "../src/web/studio/field-groups.js";

const ids = (fields: string[]) =>
  groupFields(fields.map((id) => ({ id }))).map((g) => [g.number, g.fields.map((f) => f.id)]);

describe("field groups", () => {
  it("joins neighbouring fields that end in the same number", () => {
    expect(ids(["headline", "step1", "step1Text", "step2", "step2Text"])).toEqual([
      [null, ["headline"]],
      ["1", ["step1", "step1Text"]],
      ["2", ["step2", "step2Text"]],
    ]);
  });
  it("keeps fields without a number apart, each on its own", () => {
    expect(ids(["headline", "text", "source"])).toEqual([
      [null, ["headline"]],
      [null, ["text"]],
      [null, ["source"]],
    ]);
  });
  it("does not join the same number when another field sits between", () => {
    expect(ids(["step1", "note", "step1Text"])).toEqual([
      ["1", ["step1"]],
      [null, ["note"]],
      ["1", ["step1Text"]],
    ]);
  });
});
