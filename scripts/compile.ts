import fs from "node:fs";
import ts from "typescript";
import tstl from "typescript-to-lua";
import { BuildError } from "./errors.ts";

/**
 * Compiles the tstl project into one Lua bundle written at `bundleFile` and
 * returns its bytes. `bundleFile` overrides the tsconfig's `luaBundle`, so the
 * bundle follows the configured output folder; the tsconfig is only read.
 * Any error diagnostic stops the build with tstl's diagnostics.
 */
export function compileBundle(tsconfig: string, bundleFile: string): Uint8Array {
  const result = tstl.transpileProject(tsconfig, { luaBundle: bundleFile });
  const errors = result.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0 || result.emitSkipped) {
    const host: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    };
    const text = ts.formatDiagnostics(result.diagnostics, host).trimEnd();
    throw new BuildError(`typescript-to-lua failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n${text}`);
  }
  if (!fs.existsSync(bundleFile)) {
    throw new BuildError(`typescript-to-lua wrote no bundle at ${bundleFile}; check luaBundle and luaBundleEntry in the tsconfig.`);
  }
  return new Uint8Array(fs.readFileSync(bundleFile));
}
