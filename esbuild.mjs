import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["vscode", "mocha"],
  logLevel: "warning",
};

await build({
  ...shared,
  entryPoints: ["src/shell/extension.ts"],
  outfile: "dist/extension.js",
});

await build({
  ...shared,
  entryPoints: ["test/smoke/explainSelection.smoke.ts"],
  outfile: "out/smoke/explainSelection.smoke.js",
});
