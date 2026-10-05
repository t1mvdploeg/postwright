// The own templates of a project: list, rename and delete. Making them is in
// `template-proposal.ts`; this is what happens to them afterwards.
import { z } from "zod";
import { ApiError, route, type Route } from "./http.js";
import { LIMITS } from "../web/studio/own-template.js";
import { deleteOwnTemplate, readOwnTemplates, renameOwnTemplate } from "./template-store.js";

const RenameSchema = z.object({ name: z.string().trim().min(1).max(LIMITS.name) }).strict();

export const firstIssue = (e: z.ZodError) => `${e.issues[0].path.join(".") || "input"}: ${e.issues[0].message}`;

export function templateRoutes(): Route[] {
  return [
    route("GET", "/api/templates", async (c) => readOwnTemplates((await c.project()).dir)),
    route("PUT", "/api/templates/:id", async (c) => {
      const r = RenameSchema.safeParse(await c.readJson());
      if (!r.success) throw new ApiError(400, firstIssue(r.error));
      return renameOwnTemplate((await c.project()).dir, c.params.id, r.data.name);
    }),
    route("DELETE", "/api/templates/:id", async (c) => {
      await deleteOwnTemplate((await c.project()).dir, c.params.id);
      return { ok: true };
    }),
  ];
}
