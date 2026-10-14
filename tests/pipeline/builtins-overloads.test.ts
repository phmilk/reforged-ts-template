import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../scripts/config.ts";
import { GENERATORS, generate } from "../../scripts/generate.ts";
import {
  FIXTURE_OBJECTS_MAP,
  ROOT,
  linkNodeModules,
  makeTempDir,
} from "./helpers.ts";

/** The Footman the fixture map renames Militia, passed to a Native as a literal. */
const MODIFIED_FOOTMAN = `declare const owner: player;
CreateUnit(owner, FourCC("hfoo"), 0, 0, 0);

export {};
`;

/**
 * A Map project with reforged-builtins' overloads turned on: the Template's
 * tsconfig files, its node_modules linked, the files the pipeline generates
 * from the objects fixture map, and `src/modified-footman.ts`. Its program
 * adds `reforged-builtins/3.0.0` to `types`, as the README says to.
 */
function overloadsProgram(): { program: ts.Program; root: string } {
  const root = makeTempDir();
  for (const name of ["tsconfig.json", "tsconfig.base.json"])
    fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
  linkNodeModules(root);
  const config = resolveConfig({ mapFolder: FIXTURE_OBJECTS_MAP }, root);
  generate(config, GENERATORS, () => undefined);
  fs.writeFileSync(
    path.join(config.sourceFolder, "modified-footman.ts"),
    MODIFIED_FOOTMAN,
  );

  const base = ts.readConfigFile(
    path.join(root, "tsconfig.base.json"),
    (file) => ts.sys.readFile(file),
  ).config as { compilerOptions: { types: string[] } };
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(root, "tsconfig.json"),
    { types: [...base.compilerOptions.types, "reforged-builtins/3.0.0"] },
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  if (parsed === undefined) throw new Error("tsconfig.json did not parse");
  return {
    program: ts.createProgram(parsed.fileNames, parsed.options),
    root,
  };
}

/** The first call to `name` in `source`. */
function findCall(source: ts.SourceFile, name: string): ts.CallExpression {
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (
      found === undefined &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    )
      found = node;
    else ts.forEachChild(node, visit);
  };
  visit(source);
  if (found === undefined) throw new Error(`no call to ${name}`);
  return found;
}

describe("reforged-builtins' overloads, turned on", () => {
  it("lose to the map's overload of a Built-in object it modifies (ADR 0014)", () => {
    const { program, root } = overloadsProgram();
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
    ).toEqual([]);
    // The package's overloads are in the program, its hfoo among them.
    expect(
      program
        .getSourceFiles()
        .find(
          (file) =>
            file.fileName.split("/").slice(-2).join("/") ===
            "reforged-builtins/3.0.0.d.ts",
        )?.text,
    ).toContain('declare function FourCC(id: "hfoo"): Rawcode<"unit">;');

    const source = program.getSourceFile(
      path.join(root, "src", "modified-footman.ts"),
    );
    if (source === undefined) throw new Error("no modified-footman.ts");
    const checker = program.getTypeChecker();
    const signature = checker.getResolvedSignature(findCall(source, "FourCC"));

    expect(
      path.relative(
        root,
        path.resolve(signature?.declaration?.getSourceFile().fileName ?? ""),
      ),
    ).toBe(path.join("src", "generated", "map-objects.d.ts"));
    expect(
      ts.displayPartsToString(signature?.getDocumentationComment(checker)),
    ).toContain("named Militia in this map");
  });
});
