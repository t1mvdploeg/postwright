// Compiles the server and the main script into build/, next to a copy of the web folder:
// the server finds the web files, and its template example, relative to itself.
import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

rmSync("build", { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "desktop/tsconfig.json"], {
  stdio: "inherit",
});
cpSync("src/web", "build/src/web", { recursive: true });
cpSync("src/server/template-example.json", "build/src/server/template-example.json");
