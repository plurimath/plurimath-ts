/**
 * Argument parsing for the CLI's render options (`src/cli/args.ts`):
 * `--display-style <true|false>` and the `--split-on-linebreak`,
 * `--math-rendering` and `--intent` switches. Their output is checked against
 * the gem in `./flag-output.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args";

const BASE = ["convert", "--from", "asciimath", "--to", "mathml"];

function optionsOf(...flags: string[]) {
  const result = parseArgs([...BASE, ...flags]);
  if (result.kind !== "convert") throw new Error(`expected convert, got ${JSON.stringify(result)}`);
  return result.args.options;
}

function errorOf(...flags: string[]): string {
  const result = parseArgs([...BASE, ...flags]);
  if (result.kind !== "error") throw new Error(`expected error, got ${JSON.stringify(result)}`);
  return result.message;
}

describe("render option flags", () => {
  it("sets no option when no render flag is given", () => {
    expect(optionsOf()).toEqual({});
  });

  it("reads --display-style true and false, as a separate or = value", () => {
    expect(optionsOf("--display-style", "true")).toEqual({ displayStyle: true });
    expect(optionsOf("--display-style", "false")).toEqual({ displayStyle: false });
    expect(optionsOf("--display-style=true")).toEqual({ displayStyle: true });
    expect(optionsOf("--display-style=false")).toEqual({ displayStyle: false });
  });

  it("lets the last --display-style win", () => {
    expect(optionsOf("--display-style", "false", "--display-style=true")).toEqual({
      displayStyle: true,
    });
  });

  it("turns on each switch", () => {
    expect(optionsOf("--split-on-linebreak")).toEqual({ splitOnLinebreak: true });
    expect(optionsOf("--math-rendering")).toEqual({ mathRendering: true });
    expect(optionsOf("--intent")).toEqual({ intent: true });
  });

  it("combines flags with a file argument in any order", () => {
    const result = parseArgs([
      "convert",
      "--intent",
      "f.txt",
      "--display-style",
      "false",
      "--from",
      "latex",
      "--split-on-linebreak",
      "--to",
      "omml",
      "--math-rendering",
    ]);
    expect(result).toEqual({
      kind: "convert",
      args: {
        from: "latex",
        to: "omml",
        file: "f.txt",
        options: { intent: true, displayStyle: false, splitOnLinebreak: true, mathRendering: true },
      },
    });
  });

  it("does not take the token after a switch as its value", () => {
    // The gem's string options would read "false" as the value (and split
    // anyway); here it is the input file.
    const result = parseArgs([...BASE, "--split-on-linebreak", "false"]);
    expect(result).toEqual({
      kind: "convert",
      args: { from: "asciimath", to: "mathml", file: "false", options: { splitOnLinebreak: true } },
    });
  });
});

describe("filenames that are object keys", () => {
  it.each(["toString", "constructor", "__proto__", "hasOwnProperty"])(
    "takes %s as the input file, not as a switch",
    (name) => {
      expect(parseArgs([...BASE, name])).toEqual({
        kind: "convert",
        args: { from: "asciimath", to: "mathml", file: name, options: {} },
      });
    },
  );
});

describe("render option errors", () => {
  it.each(["yes", "no", "TRUE", "1", "0", ""])("rejects --display-style %j", (value) => {
    expect(errorOf("--display-style", value)).toBe(
      `Invalid --display-style value "${value}". Use "true" or "false".`,
    );
    expect(errorOf(`--display-style=${value}`)).toBe(
      `Invalid --display-style value "${value}". Use "true" or "false".`,
    );
  });

  it("rejects an inherited object key as a --display-style value", () => {
    expect(errorOf("--display-style=toString")).toMatch(/Invalid --display-style value/);
  });

  it("requires a value after --display-style", () => {
    expect(errorOf("--display-style")).toBe("--display-style requires a value.");
    expect(errorOf("--display-style", "--intent")).toBe("--display-style requires a value.");
  });

  it.each(["--split-on-linebreak=true", "--math-rendering=false", "--intent=true"])(
    "rejects a value attached to the switch %s",
    (flag) => {
      expect(errorOf(flag)).toBe(`Unknown option "${flag}".`);
    },
  );

  it.each(["-s", "-d", "-m", "--xml-engine", "--formatter", "--unknown"])(
    "rejects the unsupported option %s",
    (flag) => {
      expect(errorOf(flag)).toBe(`Unknown option "${flag}".`);
    },
  );
});
