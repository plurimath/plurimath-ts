import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseLatex, toLatex } from "../../../src/formats/latex/index";

describe("Ruby 0.11.20 LaTeX artifact", () => {
  it("builds the cases environment with its open-ended brace", () => {
    const input = "\\begin{cases}x\\end{cases}";
    const formula = parseLatex(input);
    expect(normalize(formula).fields.value).toMatchObject([
      {
        class: "Math::Function::Table::Cases",
        fields: {
          // biome-ignore lint/style/useNamingConvention: Ruby model field names.
          open_paren: { class: "Math::Symbols::Paren::Lcurly", fields: { value: null } },
          // biome-ignore lint/style/useNamingConvention: Ruby model field names.
          close_paren: { class: "Math::Symbols::Symbol", fields: { value: ":}" } },
        },
      },
    ]);
    expect(toLatex(formula)).toBe(input);
  });
});
