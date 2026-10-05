// Applying a proposal: the current brand folder moves to `brand-previous/` (the one before
// that expires), the proposal becomes `brand/`, and tone, banned words and hashtags go to
// the settings of the project, added to what is there.
import { access, rename, rm } from "node:fs/promises";
import { ApiError, route, type Project, type Route } from "./http.js";
import { path, serialize } from "./files.js";
import { StorageError, loadSettingsFile, saveSettingsFile } from "./store.js";
import { checkProposal, proposalDir } from "./brand-proposal.js";

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

/** The words of `existing`, then those of `added` that are new (ignoring case); at most 100. */
export function mergeWords(existing: string[], added: string[]): string[] {
  const seen = new Set(existing.map((w) => w.toLowerCase()));
  const out = [...existing];
  for (const word of added.map((w) => w.trim()).filter(Boolean)) {
    if (out.length >= 100) break;
    if (seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    out.push(word);
  }
  return out;
}

/** The hashtags of `existing`, then new ones from `added` while the line stays within 300 characters. */
export function mergeHashtags(existing: string, added: string): string {
  const tags = existing.split(/\s+/).filter(Boolean);
  const seen = new Set(tags.map((t) => t.toLowerCase()));
  for (const tag of added.split(/\s+/).filter(Boolean)) {
    if (seen.has(tag.toLowerCase()) || [...tags, tag].join(" ").length > 300) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags.join(" ");
}

export async function applyProposal(project: Project): Promise<{ version: string }> {
  return serialize(`brand-apply:${project.dir}`, async () => {
    const state = await checkProposal(project.dir);
    if (state.state === "none") throw new ApiError(409, "There is no brand kit proposal to apply");
    if (state.state === "invalid") throw new ApiError(409, `The proposal is not valid: ${state.problems[0]}`);
    const s = { dir: project.dir };
    // A broken settings file stops here, before anything has moved.
    const settings = await loadSettingsFile(s).catch((e) => {
      if (e instanceof StorageError) throw new ApiError(e.status, e.message);
      throw e;
    });
    const brand = path(s, "brand");
    const previous = path(s, "brand-previous");
    // The older brand-previous only expires once the apply has succeeded: until then it waits
    // under another name, so that every failure can put everything back.
    const expiring = path(s, "brand-previous-expiring");
    const hadBrand = await exists(brand);
    const hadPrevious = hadBrand && (await exists(previous));
    const putBack = async () => {
      if (hadBrand) await rename(previous, brand).catch(() => undefined);
      if (hadPrevious) await rename(expiring, previous).catch(() => undefined);
    };
    if (hadBrand) {
      await rm(expiring, { recursive: true, force: true });
      if (hadPrevious) await rename(previous, expiring);
      try {
        await rename(brand, previous);
      } catch (e) {
        if (hadPrevious) await rename(expiring, previous).catch(() => undefined);
        throw e;
      }
    }
    try {
      await rename(proposalDir(project.dir), brand);
    } catch (e) {
      await putBack();
      throw e;
    }
    const { extras } = state;
    try {
      await saveSettingsFile(s, {
        ...settings,
        tone: extras.tone || settings.tone,
        bannedWords: mergeWords(settings.bannedWords, extras.bannedWords),
        defaultHashtags: mergeHashtags(settings.defaultHashtags, extras.hashtags),
      });
    } catch (e) {
      // The settings could not be written: put everything back, so that the old brand stays.
      await rename(brand, proposalDir(project.dir)).catch(() => undefined);
      await putBack();
      throw e;
    }
    await rm(expiring, { recursive: true, force: true });
    // extras.json was for this step; in `brand/` it would be served to the browser.
    await rm(path(s, "brand", "extras.json"), { force: true });
    return { version: state.brand.version };
  });
}

/** `POST /api/brand/apply`. */
export function brandApplyRoutes(): Route[] {
  return [route("POST", "/api/brand/apply", async (c) => applyProposal(await c.project()))];
}
