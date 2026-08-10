/**
 * Encodes ARCHITECTURE.md §3's eight dependency rules. This is the gate that
 * keeps the layering real: source-level discipline is not a promise, it is a
 * CI check. (What actually *ships* per subpath is proven separately by the
 * package-isolation gate — see scripts/gate-package.mjs.)
 */
module.exports = {
  forbidden: [
    {
      name: "layer-1-imports-nothing",
      comment:
        "Rule 1: pegkit, core and xml import nothing else from src/ — they are the base layer.",
      severity: "error",
      from: { path: "^src/(pegkit|core|xml)/" },
      to: {
        path: "^src/",
        pathNot: "^src/(pegkit|core|xml)/",
      },
    },
    {
      name: "leaf-services-import-core-only",
      comment:
        "Rule 2: leaf services (formatting, unitsml) import only core and their own data.",
      severity: "error",
      from: { path: "^src/(formatting|unitsml)/" },
      to: {
        // `^src/$1/` is the leaf service's own directory, via the capture group
        // above — the same backreference rule 4 uses. Without it this rule
        // forbade a leaf service from importing its own files, which rule 1
        // has always allowed layer 1 to do (`src/core/index.ts` imports
        // `./errors` and is not a violation). Splitting a leaf service into
        // more than one file is not a layering breach.
        // `src/generated/` is deliberately NOT allowed here. It holds
        // format-owned data, and §3 rule 2 gives a leaf service `core` plus its
        // own files and nothing else — so `formatting/` reaching into
        // `generated/asciimath/` is the leak this rule exists to catch.
        path: "^src/",
        pathNot: "^src/core/|^src/$1/",
      },
    },
    {
      name: "formats-import-allowed-layers-only",
      comment:
        "Rule 3: a format imports only layer-1 modules, leaf services, its own data and its " +
        "own render kind files. `generated` and `render` are only allowed here as directions; " +
        "the per-format constraints are format-imports-own-generated-data-only and " +
        "format-render-imports-own-kind-files-only.",
      severity: "error",
      from: { path: "^src/formats/" },
      to: {
        path: "^src/",
        pathNot: "^src/(pegkit|core|xml|formatting|unitsml|generated|formats|render)/",
      },
    },
    {
      name: "format-render-imports-own-kind-files-only",
      comment:
        "Rule 8 (§3, node-major render layout): under src/render, format F may import only " +
        "<kind>/<F>.ts — its own per-kind files, never another format's.",
      severity: "error",
      from: { path: "^src/formats/([^/]+)/" },
      to: {
        path: "^src/render/",
        pathNot: "^src/render/[^/]+/$1\\.ts$",
      },
    },
    {
      name: "render-kind-file-imports-allowed-set-only",
      comment:
        "Rule 8: a kind file src/render/<kind>/<F>.ts imports only core, its own format's " +
        "generated data (src/generated/<F>), that format's render-shared helpers " +
        "(src/formats/<F>/render-shared.ts), and sibling kind files of the same format " +
        "(<other-kind>/<F>.ts — Ruby's base-class inheritance imports). It never imports the " +
        "dispatch table: recursion goes through context.render.",
      severity: "error",
      from: { path: "^src/render/[^/]+/([^/]+)\\.ts$" },
      to: {
        path: "^src/",
        pathNot:
          "^src/core/|^src/generated/$1/|^src/formats/$1/render-shared\\.ts$|^src/render/[^/]+/$1\\.ts$",
      },
    },
    {
      name: "only-formats-reach-render",
      comment:
        "Rule 8: nothing else under src/ imports src/render (root and compat entries " +
        "excepted) — among format roots, only F reaches F files. Formats are constrained " +
        "per-format by format-render-imports-own-kind-files-only, render files by " +
        "render-kind-file-imports-allowed-set-only.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/(formats|render|compat)/|^src/index\\.ts$" },
      to: { path: "^src/render/" },
    },
    {
      name: "render-shared-is-a-leaf",
      comment:
        "Rule 8: render-shared.ts imports neither render.ts, renderer.ts, nor any kind file " +
        "— it is the acyclic base the dispatch table and the kind files both stand on.",
      severity: "error",
      from: { path: "^src/formats/[^/]+/render-shared\\.ts$" },
      to: { path: "^src/render/|^src/formats/[^/]+/(render|renderer)\\.ts$" },
    },
    {
      name: "format-imports-own-generated-data-only",
      comment:
        "Rule 4 (generated-data closure): src/formats/<F> reaches src/generated/<F> only — " +
        "another format's data slice in F's module graph is the bundle leak the layout exists " +
        "to prevent.",
      severity: "error",
      from: { path: "^src/formats/([^/]+)/" },
      to: {
        path: "^src/generated/",
        pathNot: "^src/generated/$1/",
      },
    },
    {
      name: "render-kind-file-imports-own-generated-data-only",
      comment:
        "Rule 4 (generated-data closure): src/render/<kind>/<F>.ts reaches src/generated/<F> " +
        "only — same closure as the format root, stated for the render layer.",
      severity: "error",
      from: { path: "^src/render/[^/]+/([^/]+)\\.ts$" },
      to: {
        path: "^src/generated/",
        pathNot: "^src/generated/$1/",
      },
    },
    {
      name: "no-format-imports-another-format",
      comment:
        "Rule 4: formats are independent. Only compat and the root entry cross format boundaries.",
      severity: "error",
      from: { path: "^src/formats/([^/]+)/" },
      to: {
        path: "^src/formats/([^/]+)/",
        pathNot: "^src/formats/$1/",
      },
    },
    {
      name: "evaluation-imports-core-only",
      comment: "Rule 6: evaluation imports core only.",
      severity: "error",
      from: { path: "^src/evaluation/" },
      to: { path: "^src/", pathNot: "^src/core/" },
    },
    {
      name: "nothing-imports-evaluation",
      comment: "Rule 6: no format or leaf service imports evaluation; only the root entry does.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/index\\.ts$" },
      to: { path: "^src/evaluation/" },
    },
    {
      name: "no-circular",
      comment: "Circular imports break the layering and the ESM initialisation order.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Dead modules are removed, not left to rot.",
      severity: "warn",
      from: { orphan: true, pathNot: "\\.d\\.ts$" },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types"],
      // Without these, scanning a directory finds no TypeScript at all and the
      // gate passes vacuously — "0 modules cruised" is a failure, not a pass.
      extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"],
    },
  },
};
