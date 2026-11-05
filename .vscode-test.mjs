import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/smoke/**/*.smoke.js",
  mocha: { ui: "bdd", timeout: 30_000 },
  launchArgs: [
    // VS Code's IPC socket lives here, and the path has a length limit that a
    // deep checkout would exceed.
    `--user-data-dir=${join(tmpdir(), "code-gloss-smoke")}`,
  ],
});
