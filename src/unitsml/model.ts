import {
  type MathNode,
  type NormalizedNode,
  type NormalizedValue,
  RenderError,
} from "../core/index";
import { NODE_SPECS } from "../core/normalize";
import { UNITSML_DATA } from "./data";

/** Reconstructs structural native nodes from measured, generated Ruby models. */
export function hydrateModel(source: NormalizedNode): MathNode {
  const specs = Object.entries(NODE_SPECS);
  const measuredKind = UNITSML_DATA.modelKinds?.[source.class];
  const exact = specs.find(([, spec]) => spec.rubyClass === source.class);
  const candidates = specs.filter(
    ([, spec]) =>
      spec.identity !== undefined && source.class.startsWith(`${spec.identity.prefix}::`),
  );
  const longestPrefix = Math.max(
    0,
    ...candidates.map(([, spec]) => spec.identity?.prefix.length ?? 0),
  );
  const closest = candidates.filter(([, spec]) => spec.identity?.prefix.length === longestPrefix);
  const measured =
    measuredKind === undefined ? undefined : specs.find(([kind]) => kind === measuredKind);
  if (exact !== undefined && measuredKind !== undefined && exact[0] !== measuredKind) {
    throw new RenderError(
      `UnitsML census kind ${measuredKind} conflicts with the exact carrier ${exact[0]} for ${source.class}`,
      "unitsml",
      "unitsml",
    );
  }
  if (measuredKind !== undefined && measured === undefined) {
    throw new RenderError(
      `UnitsML census kind ${measuredKind} is unknown for ${source.class}`,
      "unitsml",
      "unitsml",
    );
  }
  const selected = exact ?? measured ?? (closest.length === 1 ? closest[0] : undefined);
  if (selected === undefined && closest.length > 1) {
    throw new RenderError(
      `UnitsML class ${source.class} has ambiguous carriers and no measured class-kind mapping`,
      "unitsml",
      "unitsml",
    );
  }
  for (const [kind, spec] of selected === undefined ? [] : [selected]) {
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
