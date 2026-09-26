import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import tstl from "typescript-to-lua";
import { AuthorError } from "./errors.ts";

const diagnosticsHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

/**
 * Where the tstl project writes its bundle: the tsconfig's `tstl.luaBundle`,
 * resolved the way typescript-to-lua resolves it (against `outDir` if set,
 * else the tsconfig's folder). A tsconfig that does not parse, or has no
 * `luaBundle`, is an AuthorError.
 */
export function luaBundleFile(tsconfig: string): string {
  const parsed = tstl.parseConfigFileWithSystem(tsconfig);
  const errors = parsed.errors.filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new AuthorError(
      `${path.basename(tsconfig)} could not be read:\n${ts.formatDiagnostics(errors, diagnosticsHost).trimEnd()}`,
    );
  }
  const { luaBundle, outDir } = parsed.options;
  if (typeof luaBundle !== "string" || luaBundle === "") {
    throw new AuthorError(
      `${path.basename(tsconfig)}: \`tstl.luaBundle\` is not set. The build compiles the source into one Lua bundle; set it to a file in the output folder (e.g. "dist/bundle.lua").`,
    );
  }
  const projectRoot = path.dirname(path.resolve(tsconfig));
  return path.resolve(
    outDir ? path.resolve(projectRoot, outDir) : projectRoot,
    luaBundle,
  );
}

/**
 * Compiles the tstl project into its Lua bundle and returns the bundle's
 * bytes, read from `bundleFile` (the tsconfig's `luaBundle`, see
 * `luaBundleFile`). The tsconfig is only read and nothing overrides it: the
 * tsconfig alone describes the compile. Any error diagnostic stops the build
 * with tstl's diagnostics.
 */
export function compileBundle(
  tsconfig: string,
  bundleFile: string,
): Uint8Array {
  const result = tstl.transpileProject(tsconfig);
  const errors = result.diagnostics.filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0 || result.emitSkipped) {
    const text = ts
      .formatDiagnostics(result.diagnostics, diagnosticsHost)
      .trimEnd();
    throw new AuthorError(
      `typescript-to-lua failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n${text}`,
    );
  }
  if (!fs.existsSync(bundleFile)) {
    throw new AuthorError(
      `typescript-to-lua wrote no bundle at ${bundleFile}; check luaBundle and luaBundleEntry in the tsconfig.`,
    );
  }
  return new Uint8Array(fs.readFileSync(bundleFile));
}
