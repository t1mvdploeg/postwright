// A valid answer of the model, built from the built-in brand so that it passes every check.
import { readFileSync } from "node:fs";

const builtIn = JSON.parse(readFileSync("src/web/brand/brand.json", "utf8"));

export const AI_PROPOSAL = {
  name: "Acme",
  url: "https://acme.example",
  colors: builtIn.colors.slice(0, 6) as { name: string; hex: string; usage: string }[],
  css: builtIn.css,
  grounds: builtIn.grounds,
  fontFamily: "Acme Sans",
  tone: "Warm, direct and plain.",
  bannedWords: ["cheap"],
  hashtags: "#acme",
};
