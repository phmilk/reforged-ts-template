// pnpm hook for `pnpm use:local` (scripts/use-local.ts). Inert unless that
// command has written .local-packages/packages.json, an ignored file naming
// the tarballs it packed from a reforged-ts checkout; then each listed
// package resolves to its tarball instead of the registry. Only the manifest
// pnpm reads in memory changes: package.json on disk stays as committed.
const fs = require("node:fs");
const path = require("node:path");

const folder = path.join(__dirname, ".local-packages");
const list = path.join(folder, "packages.json");
/** Package name to tarball file name, `{}` when the Template uses the registry. */
const tarballs = fs.existsSync(list) ? JSON.parse(fs.readFileSync(list, "utf8")) : {};

function readPackage(manifest) {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    for (const [name, file] of Object.entries(tarballs)) {
      if (name in dependencies) dependencies[name] = `file:${path.join(folder, file).split(path.sep).join("/")}`;
    }
  }
  return manifest;
}

module.exports = { hooks: { readPackage } };
