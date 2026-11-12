import type { ParseValue } from "../../pegkit/index";
import { bytePositions, positionAt } from "../../pegkit/stage-captures";

type Origin = "map" | "reference" | "other";
type Lowered = { value: ParseValue; origin: Origin };
type Work =
  | { kind: "visit"; value: unknown }
  | { kind: "array"; count: number }
  | { kind: "object"; keys: string[] }
  | { kind: "tagged"; tag: string; count: number };

/** Source Parsanol shape algebra: spans -> Strings, sequence maps merge in order. */
export function lowerHtmlCaptures(shape: unknown, input: string): ParseValue {
  const work: Work[] = [{ kind: "visit", value: shape }];
  const output: Lowered[] = [];
  const positions = bytePositions(input);
  while (work.length) {
    const task = work.pop() as Work;
    if (task.kind === "visit") {
      const value = task.value;
      if (value === null || typeof value === "string") {
        output.push({ value, origin: "other" });
      } else if (Array.isArray(value)) {
        work.push({ kind: "array", count: value.length });
        for (let i = value.length - 1; i >= 0; i--) work.push({ kind: "visit", value: value[i] });
      } else if (typeof value === "object") {
        const fields = value as Record<string, unknown>;
        const keys = Object.keys(fields);
        if (
          keys.every((key) => ["offset", "length", "value", "line", "column"].includes(key)) &&
          Number.isSafeInteger(fields.offset) &&
          Number.isSafeInteger(fields.length) &&
          (fields.offset as number) >= 0 &&
          (fields.length as number) >= 0
        ) {
          const start = positionAt(positions, fields.offset as number);
          const text =
            typeof fields.value === "string"
              ? fields.value
              : Array.from(input.slice(start))
                  .slice(0, fields.length as number)
                  .join("");
          output.push({ value: text, origin: "reference" });
        } else if (
          keys.length === 2 &&
          typeof fields.tag === "string" &&
          Array.isArray(fields.items)
        ) {
          work.push({
            kind: "tagged",
            tag: fields.tag.replace(/^:/, ""),
            count: fields.items.length,
          });
          for (let i = fields.items.length - 1; i >= 0; i--)
            work.push({ kind: "visit", value: fields.items[i] });
        } else {
          work.push({ kind: "object", keys });
          for (let i = keys.length - 1; i >= 0; i--)
            work.push({ kind: "visit", value: fields[keys[i] as string] });
        }
      } else {
        throw new TypeError("invalid HTML capture leaf");
      }
      continue;
    }
    const count = task.kind === "object" ? task.keys.length : task.count;
    const values = output.splice(output.length - count, count);
    if (task.kind === "array" || (task.kind === "tagged" && task.tag === "repetition")) {
      output.push({ value: values.map((entry) => entry.value), origin: "other" });
    } else if (task.kind === "object") {
      output.push({
        value: Object.fromEntries(task.keys.map((key, i) => [key, values[i]?.value ?? null])),
        origin: "map",
      });
    } else if (task.tag === "maybe") {
      output.push(values[0] ?? { value: null, origin: "other" });
    } else if (task.tag === "sequence") {
      const present = values.filter((entry) => entry.value !== null);
      if (!present.length) output.push({ value: null, origin: "other" });
      else if (present.length === 1) output.push(present[0] as Lowered);
      else if (
        present.some((entry) => entry.origin === "map") &&
        present.every((entry) => entry.origin === "map" || entry.origin === "reference")
      ) {
        const result: Record<string, ParseValue> = {};
        for (const entry of present) if (entry.origin === "map") Object.assign(result, entry.value);
        output.push({ value: result, origin: "map" });
      } else output.push({ value: present.map((entry) => entry.value), origin: "other" });
    } else {
      throw new TypeError(`unknown HTML capture tag ${task.tag}`);
    }
  }
  if (output.length !== 1) throw new TypeError("invalid HTML capture shape");
  return (output[0] as Lowered).value;
}
