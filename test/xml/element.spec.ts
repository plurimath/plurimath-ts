/**
 * `XmlElement` tree semantics — the build API the renderers use.
 *
 * The byte-level consequences of these behaviours are pinned by the fixture
 * suite (`./serializer.spec.ts`); this file pins the tree semantics
 * directly, each mirroring a measured gem behaviour named in its comment
 * (oracle plurimath 0.11.6 at `00c52783`, Ox 2.14.28).
 */

import { describe, expect, it } from "vitest";
import { XmlElement } from "../../src/xml/index";

describe("names", () => {
  it("keeps the tag name verbatim, namespace colon included", () => {
    // Ruby: Ox::Element.new("m:oMath") dumps as <m:oMath …> — no validation,
    // no namespace handling (measured, `namespaced` fixture).
    expect(new XmlElement("m:oMath").name).toBe("m:oMath");
    expect(new XmlElement("mi").name).toBe("mi");
  });
});

describe("attributes", () => {
  it("iterates in insertion order", () => {
    // Ruby: e["zeta"]="1"; e["alpha"]="2"; e["mid"]="3" dumps zeta alpha mid
    // (measured, `attr-order` fixture) — Hash order, which Map shares.
    const element = new XmlElement("e")
      .setAttribute("zeta", "1")
      .setAttribute("alpha", "2")
      .setAttribute("mid", "3");
    expect([...element.attributes.keys()]).toEqual(["zeta", "alpha", "mid"]);
  });

  it("keeps the original position on reassignment", () => {
    // Ruby: e["a"]="1"; e["b"]="2"; e["a"]="3" => <e a="3" b="2"/> (measured).
    const element = new XmlElement("e")
      .setAttribute("a", "1")
      .setAttribute("b", "2")
      .setAttribute("a", "3");
    expect([...element.attributes.entries()]).toEqual([
      ["a", "3"],
      ["b", "2"],
    ]);
  });

  it("moves to the end after remove and re-add", () => {
    // Ruby: delete("a") then e["a"]="3" => <e b="2" a="3"/> (measured).
    const element = new XmlElement("e")
      .setAttribute("a", "1")
      .setAttribute("b", "2")
      .removeAttribute("a")
      .setAttribute("a", "3");
    expect([...element.attributes.entries()]).toEqual([
      ["b", "2"],
      ["a", "3"],
    ]);
  });

  it("treats removing an absent attribute as a no-op", () => {
    // Ruby: attributes.delete("zz") on an element without it returns nil and
    // changes nothing (measured, `attr-remove` fixture).
    const element = new XmlElement("mo").setAttribute("b", "2").removeAttribute("zz");
    expect([...element.attributes.entries()]).toEqual([["b", "2"]]);
  });

  it("setAttributes writes a plain object in its key order", () => {
    const element = new XmlElement("math").setAttributes({
      xmlns: "http://www.w3.org/1998/Math/MathML",
      display: "block",
    });
    expect([...element.attributes.keys()]).toEqual(["xmlns", "display"]);
    expect(element.attributes.get("display")).toBe("block");
  });

  it("setAttributes preserves a Map's insertion order even for numeric-like keys", () => {
    // The reason the API takes iterables: object keys like "1" would iterate
    // first regardless of insertion; a Map keeps the caller's order.
    const element = new XmlElement("e").setAttributes(
      new Map([
        ["zeta", "a"],
        ["1", "b"],
      ]),
    );
    expect([...element.attributes.keys()]).toEqual(["zeta", "1"]);
  });

  it("stores values verbatim — no entity decoding at this layer", () => {
    // The gem's wrapper decodes ("&#x2211;" stores "∑",
    // OxEngine::Element#update_attrs — measured); that pass belongs to the
    // renderer, which owns a core import. This layer must not half-do it.
    const element = new XmlElement("mo").setAttribute("intent", "&#x2211;");
    expect(element.attributes.get("intent")).toBe("&#x2211;");
  });
});

describe("children", () => {
  it("appends elements and text in document order", () => {
    const mi = new XmlElement("mi").append("y");
    const element = new XmlElement("mtext").append("before ", mi, " after");
    expect(element.children).toEqual(["before ", mi, " after"]);
  });

  it("skips null and undefined, and recurses nested arrays", () => {
    // Ruby: XmlHelper.update_nodes(root, [nil, [mi, [mo]], nil, mn, "tail", nil])
    // appends mi, mo, mn, "tail" (measured, `update-nodes-shape` fixture).
    const mi = new XmlElement("mi");
    const mo = new XmlElement("mo");
    const mn = new XmlElement("mn");
    const element = new XmlElement("mrow").append(null, [mi, [mo]], null, mn, "tail", undefined);
    expect(element.children).toEqual([mi, mo, mn, "tail"]);
  });

  it("keeps an empty string as a real text node", () => {
    // Ruby: (e << "") dumps <t></t>, not <t/> — "" is truthy in Ruby and Ox
    // keeps the child (measured, `empty-string-text` fixture). `if (child)`
    // anywhere in this layer would silently self-close it.
    const element = new XmlElement("t").append("");
    expect(element.children).toEqual([""]);
  });

  it("exposes live views — later appends show through an earlier reference", () => {
    const element = new XmlElement("mrow");
    const seen = element.children;
    element.append(new XmlElement("mi"));
    expect(seen).toHaveLength(1);
  });
});

describe("chaining", () => {
  it("every mutator returns the element itself", () => {
    const element = new XmlElement("e");
    expect(element.setAttribute("a", "1")).toBe(element);
    expect(element.setAttributes({ b: "2" })).toBe(element);
    expect(element.removeAttribute("a")).toBe(element);
    expect(element.append("x")).toBe(element);
  });
});
