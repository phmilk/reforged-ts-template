// reforged-map's TypeScript plugin as the Template enables it
// (phmilk/reforged-ts-template#88): the entry in tsconfig.base.json, and the
// plugin loaded by the Template's own tsserver through its default search
// path and pnpm's layout, with no probe location. src/main.ts is opened with
// the content the open request passes, in tsserver's memory only: nothing is
// written to the repository. (A file under src/ that is not on disk would land
// in an inferred project, which loads no plugin.)
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import * as ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

const PLUGIN = "reforged-map/typescript-plugin";

/** The Template's tsserver, the one VS Code runs under "Use Workspace Version". */
const TSSERVER = path.join(
  ROOT,
  "node_modules",
  "typescript",
  "lib",
  "tsserver.js",
);

/** The map's entry point, opened with a literal of the Footman as its content. */
const SOURCE = path.join(ROOT, "src", "main.ts");
const CONTENT = 'export const footman = FourCC("hfoo");\n';

/** A minimal client of tsserver's protocol: one request at a time is enough here. */
class TsServer {
  readonly #process: ChildProcess;
  readonly #pending = new Map<
    number,
    (response: { success: boolean; body?: unknown }) => void
  >();
  #seq = 0;
  #buffer = Buffer.alloc(0);

  constructor() {
    this.#process = spawn(
      process.execPath,
      [
        TSSERVER,
        "--disableAutomaticTypingAcquisition",
        "--suppressDiagnosticEvents",
      ],
      { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] },
    );
    this.#process.stdout?.on("data", (chunk: Buffer) => {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      this.#read();
    });
  }

  request(
    command: string,
    args: object,
  ): Promise<{ success: boolean; body?: unknown }> {
    const seq = ++this.#seq;
    return new Promise((resolve) => {
      this.#pending.set(seq, resolve);
      this.#process.stdin?.write(
        JSON.stringify({ seq, type: "request", command, arguments: args }) +
          "\n",
      );
    });
  }

  close(): void {
    this.#process.kill();
  }

  #read(): void {
    for (;;) {
      // tsserver counts one byte of newline after each message, but writes
      // its host's: on Windows, "\r\n" leaves a "\n" before the next header.
      const header = /^\s*Content-Length: (\d+)\r\n\r\n/.exec(
        this.#buffer.toString("latin1"),
      );
      if (header === null) return;
      const start = header[0].length;
      const length = Number(header[1]);
      if (this.#buffer.length < start + length) return;
      const message = JSON.parse(
        this.#buffer.subarray(start, start + length).toString("utf8"),
      ) as {
        type: string;
        request_seq?: number;
        success?: boolean;
        body?: unknown;
      };
      this.#buffer = this.#buffer.subarray(start + length);
      if (message.type !== "response" || message.request_seq === undefined)
        continue;
      this.#pending.get(message.request_seq)?.({
        success: message.success === true,
        body: message.body,
      });
      this.#pending.delete(message.request_seq);
    }
  }
}

describe("the entry in tsconfig.base.json", () => {
  it("enables the plugin by name, with no mapFolder option", () => {
    const base = ts.readConfigFile(
      path.join(ROOT, "tsconfig.base.json"),
      (file) => ts.sys.readFile(file),
    ).config as { compilerOptions: { plugins?: unknown } };
    expect(base.compilerOptions.plugins).toEqual([{ name: PLUGIN }]);
  });

  it("is inherited by the map's and the Lua tests' tsconfig", () => {
    for (const file of ["tsconfig.json", "tests/lua/tsconfig.json"]) {
      const config = ts.readConfigFile(path.join(ROOT, file), (name) =>
        ts.sys.readFile(name),
      ).config as { compilerOptions?: { plugins?: unknown } };
      expect(config.compilerOptions?.plugins, file).toBeUndefined();
    }
  });
});

describe("the plugin under the Template's TypeScript", () => {
  let server: TsServer;

  beforeAll(() => {
    server = new TsServer();
  });

  afterAll(() => {
    server.close();
  });

  // The hover needs a map folder: it finds the one at the project root, which
  // copyProject() fills, with no mapFolder option.
  it('names the Footman on the hover of FourCC("hfoo"), from the map folder at the root', async () => {
    const opened = await server.request("open", {
      file: SOURCE,
      fileContent: CONTENT,
      projectRootPath: ROOT,
    });
    expect(opened.success).toBe(true);
    const offset = CONTENT.indexOf('"hfoo"') + 2;
    const hover = await server.request("quickinfo", {
      file: SOURCE,
      line: 1,
      offset,
    });
    expect(hover.success).toBe(true);
    // Any Patch: which one the hover names is reforged-builtins' data, tested
    // in the library, and it moves with every Patch the library adopts (#101).
    expect((hover.body as { documentation: string }).documentation).toMatch(
      /^\*\*Footman\*\* \(`hfoo`\), a Built-in unit of Patch \d+\.\d+\.\d+/,
    );
  });
});
