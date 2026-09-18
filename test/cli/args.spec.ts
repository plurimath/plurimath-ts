/**
 * Argument-parsing unit tests for the `plurimath` CLI (`src/cli/args.ts`).
 */

import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args";

describe("parseArgs", () => {
  it("shows help with no arguments", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
  });

  it("shows help for --help and -h at the top level", () => {
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-h"])).toEqual({ kind: "help" });
  });

  it("shows help for convert --help", () => {
    expect(parseArgs(["convert", "--help"])).toEqual({ kind: "help" });
  });

  it("rejects an unknown command", () => {
    const result = parseArgs(["frobnicate"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/Unknown command "frobnicate"/);
  });

  it("parses --from and --to with a file argument", () => {
    expect(parseArgs(["convert", "--from", "asciimath", "--to", "latex", "formula.txt"])).toEqual({
      kind: "convert",
      args: { from: "asciimath", to: "latex", file: "formula.txt" },
    });
  });

  it("parses --from=x and --to=y form", () => {
    expect(parseArgs(["convert", "--from=latex", "--to=mathml"])).toEqual({
      kind: "convert",
      args: { from: "latex", to: "mathml", file: undefined },
    });
  });

  it("leaves file undefined when none is given (stdin)", () => {
    const result = parseArgs(["convert", "--from", "asciimath", "--to", "latex"]);
    expect(result.kind).toBe("convert");
    expect(result.kind === "convert" && result.args.file).toBeUndefined();
  });

  it("requires --from", () => {
    const result = parseArgs(["convert", "--to", "latex"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/Missing required option --from/);
  });

  it("requires --to", () => {
    const result = parseArgs(["convert", "--from", "asciimath"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/Missing required option --to/);
  });

  it("rejects an unknown input format", () => {
    const result = parseArgs(["convert", "--from", "mathml", "--to", "latex"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/Unknown input format "mathml"/);
  });

  it("rejects an unknown output format", () => {
    const result = parseArgs(["convert", "--from", "asciimath", "--to", "unitsml"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/Unknown output format "unitsml"/);
  });

  it("rejects an unknown option", () => {
    const result = parseArgs(["convert", "--from", "asciimath", "--to", "latex", "--bogus"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/Unknown option "--bogus"/);
  });

  it("rejects a second positional argument", () => {
    const result = parseArgs(["convert", "--from", "asciimath", "--to", "latex", "a.txt", "b.txt"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/only one input file is accepted/);
  });

  it("rejects --from with no value", () => {
    const result = parseArgs(["convert", "--from"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/--from requires a value/);
  });

  it("treats a bare '-' as a literal file argument rather than an unknown option", () => {
    const result = parseArgs(["convert", "--from", "asciimath", "--to", "latex", "-"]);
    expect(result).toEqual({
      kind: "convert",
      args: { from: "asciimath", to: "latex", file: "-" },
    });
  });

  it("treats everything after '--' as positional, even dash-prefixed tokens", () => {
    const result = parseArgs(["convert", "--from", "asciimath", "--to", "latex", "--", "--weird"]);
    expect(result).toEqual({
      kind: "convert",
      args: { from: "asciimath", to: "latex", file: "--weird" },
    });
  });

  it("reports '--from requires a value' rather than a bogus --to value when a flag follows --from", () => {
    const result = parseArgs(["convert", "--from", "--to", "latex"]);
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toMatch(/--from requires a value/);
  });
});
