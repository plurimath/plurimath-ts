/**
 * Encodes ARCHITECTURE.md §3's seven dependency rules. This is the gate that
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
        path: "^src/",
        pathNot: "^src/(core|generated)/",
      },
    },
    {
      name: "formats-import-allowed-layers-only",
      comment:
        "Rule 3: a format imports only layer-1 modules, leaf services and its own data.",
      severity: "error",
      from: { path: "^src/formats/" },
      to: {
        path: "^src/",
        pathNot: "^src/(pegkit|core|xml|formatting|unitsml|generated|formats)/",
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
