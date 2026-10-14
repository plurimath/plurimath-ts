import {
  type MathNode,
  type NormalizedNode,
  type NormalizedValue,
  RenderError,
} from "../core/index";
import { NODE_SPECS } from "../core/normalize";

/** Reconstructs structural native nodes from measured, generated Ruby models. */
export function hydrateModel(source: NormalizedNode): MathNode {
  const specs = Object.entries(NODE_SPECS).sort((left, right) => {
    if (left[1].rubyClass === source.class) return -1;
    if (right[1].rubyClass === source.class) return 1;
    return (right[1].identity?.prefix.length ?? 0) - (left[1].identity?.prefix.length ?? 0);
  });
  for (const [kind, spec] of specs) {
    const exact = source.class === spec.rubyClass;
    const alias =
      spec.identity !== undefined && source.class.startsWith(`${spec.identity.prefix}::`);
    if (!exact && !alias) continue;
    const result: Record<string, unknown> = { kind };
    if (alias && spec.identity !== undefined)
      result[spec.identity.field] = source.class.slice(spec.identity.prefix.length + 2);
    for (const [ruby, native] of spec.fields) {
      if (Object.hasOwn(source.fields, ruby))
        result[native] = hydrateValue(source.fields[ruby] as NormalizedValue);
    }
    return result as unknown as MathNode;
  }
  throw new RenderError(
    `UnitsML data contains an unknown model class ${source.class}`,
    "unitsml",
    "unitsml",
  );
}

function hydrateValue(value: NormalizedValue): unknown {
  if (Array.isArray(value)) return value.map((child) => hydrateValue(child));
  if (value !== null && typeof value === "object") {
    if (typeof (value as { class?: unknown }).class === "string" && "fields" in value)
      return hydrateModel(value as NormalizedNode);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, hydrateValue(child)]),
    );
  }
  return value;
}
