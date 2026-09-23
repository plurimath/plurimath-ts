# The exact case/when dispatch shape from `Formula#to_display`
# (plurimath-oracle lib/plurimath/math/formula.rb:203-215), extracted
# verbatim (only the WHEN bodies are replaced with a marker string so the
# probe can show which arm matched, or none, without needing the rest of
# the gem's 3000+ files as dependencies).
class Probe
  MATH_ZONE_TYPES = %i[omml latex mathml asciimath unicodemath].freeze

  def to_display(type = nil)
    return "invalid" unless MATH_ZONE_TYPES.include?(type.downcase.to_sym)

    math_zone = case type
                when :asciimath
                  "ASCII-MATCHED"
                when :latex
                  "LATEX-MATCHED"
                when :mathml
                  "MATHML-MATCHED"
                when :omml
                  "OMML-MATCHED"
                when :unicodemath
                  "UNICODEMATH-MATCHED"
                end
    "|_ Math zone\n#{math_zone}"
  end
end
