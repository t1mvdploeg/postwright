// Marketing studio: the format table and the file names.
import { describe, it, expect } from "vitest";
import {
  FORMATS,
  CHANNELS,
  fileName,
  format,
  channelsOf,
  overlaps,
  slugOf,
  shapeOf,
} from "../src/web/studio/formats.js";
import { FORMAT_KEYS, CHANNELS as SERVER_CHANNELS } from "../src/server/schema.js";

describe("formats", () => {
  it("has the same keys and channels as the server schema", () => {
    expect(FORMATS.map((f) => f.key).sort()).toEqual([...FORMAT_KEYS].sort());
    expect(Object.keys(CHANNELS).sort()).toEqual([...SERVER_CHANNELS].sort());
  });

  it("has unique keys, positive sizes and safe zones inside the image", () => {
    expect(new Set(FORMATS.map((f) => f.key)).size).toBe(FORMATS.length);
    for (const f of FORMATS) {
      expect(f.width).toBeGreaterThan(0);
      expect(f.height).toBeGreaterThan(0);
      for (const z of f.safeZones) {
        expect(z.x + z.width, f.key).toBeLessThanOrEqual(f.width);
        expect(z.y + z.height, f.key).toBeLessThanOrEqual(f.height);
      }
    }
  });

  it("knows the sizes of the kit and the story zones of 250 px", () => {
    expect(format("li-square")).toMatchObject({ width: 1200, height: 1200 });
    expect(format("li-portrait")).toMatchObject({ width: 1080, height: 1350 });
    expect(format("story").safeZones.map((z) => z.height)).toEqual([250, 250]);
    expect(() => format("poster")).toThrow(/Unknown format/);
  });

  it("determines the shape from the aspect ratio", () => {
    expect(shapeOf(format("li-square"))).toBe("square");
    expect(shapeOf(format("li-portrait"))).toBe("portrait");
    expect(shapeOf(format("story"))).toBe("story");
    expect(shapeOf(format("wide"))).toBe("landscape");
    expect(shapeOf(format("li-link"))).toBe("landscape");
    expect(shapeOf(format("li-profile"))).toBe("banner");
    expect(shapeOf(format("li-company"))).toBe("banner");
  });
});

describe("filenames", () => {
  it("makes slugs without accents and punctuation", () => {
    expect(slugOf("Café Überpost!")).toBe("cafe-uberpost");
    expect(slugOf("  --Autumn 2026--  ")).toBe("autumn-2026");
    expect(slugOf("x".repeat(60))).toHaveLength(40);
    expect(slugOf(null)).toBe("");
  });

  it("follows the fixed pattern, leaves out an empty campaign and numbers slides with a leading zero", () => {
    expect(fileName({ brand: "Postwright", campaign: "Autumn", post: "Your turn now", format: "li-portrait" })).toBe(
      "postwright_autumn_your-turn-now_li-portrait_1080x1350.png",
    );
    expect(fileName({ brand: "Postwright", post: "Statement", format: "li-square" })).toBe(
      "postwright_statement_li-square_1200x1200.png",
    );
    expect(fileName({ brand: "Postwright", post: "Carousel", format: "li-carousel", slide: 3 })).toBe(
      "postwright_carousel_li-carousel_1080x1350_slide-03.png",
    );
    expect(fileName({ brand: "Postwright", post: "", format: "li-link", extension: "jpg" })).toBe(
      "postwright_post_li-link_1200x630.jpg",
    );
    // The brand name comes from the brand: another brand gives another prefix, no brand gives
    // none.
    expect(fileName({ brand: "Other Brand", post: "Statement", format: "li-square" })).toBe(
      "other-brand_statement_li-square_1200x1200.png",
    );
    expect(fileName({ post: "Statement", format: "li-square" })).toBe("statement_li-square_1200x1200.png");
  });

  it("recognises overlap of rectangles", () => {
    expect(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 0, width: 10, height: 10 }, 2)).toBe(false);
  });
});

describe("channelsOf", () => {
  it("combines the channels of the formats with those of non-empty captions", () => {
    expect(channelsOf({ formats: ["li-square", "story"], caption: { x: "  ", facebook: "Hello" } }).sort()).toEqual([
      "facebook",
      "instagram",
      "linkedin",
    ]);
    expect(channelsOf({})).toEqual([]);
  });
});
