/**
 * `xml` — the XML element tree + Ox-compatible serializer (ARCHITECTURE.md
 * §3). Layer 1: imports nothing internal; consumed by the output renderers
 * (`formats/mathml`, later `formats/omml`), which build a tree and make one
 * dump call.
 *
 * The byte-level contract — layout, escaping, and the gem's post-dump
 * `REPLACABLES` rewrite — is measured against the pinned oracle and pinned by
 * the fixtures in `test/xml/`; `./serializer` documents every rule with the
 * probe that established it.
 *
 * Not published as a package subpath (§4's export map has no `/xml`): this is
 * plumbing for renderers, not public API, and stays reachable only through
 * the formats that use it until a maintainer decides otherwise.
 */

export type { XmlAppendable, XmlChild } from "./element";
export { XmlElement } from "./element";
export type { DumpOptions } from "./serializer";
export { dump, dumpNodes, XmlDepthLimitError, XmlIndentError } from "./serializer";
