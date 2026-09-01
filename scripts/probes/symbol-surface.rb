# frozen_string_literal: true

# Symbol-surface probe (TODO.plan/p2-output-formats/04-symbol-data.md).
#
# Enumerates every Plurimath symbol class in a *pinned* oracle checkout,
# instantiates it, and calls the live render methods. It never parses method
# bodies and never invokes a generator, so its counts are runtime facts about
# the gem rather than a source-text estimate.
#
# Run it against the pinned oracle, from that checkout:
#
#   ruby -v                       # must report the oracle's supported Ruby
#   cd <oracle>
#   BUNDLE_GEMFILE=$PWD/Gemfile bundle exec ruby -Ilib \
#     <plurimath-ts>/scripts/probes/symbol-surface.rb
#
# PLURIMATH_GEM_ROOT overrides the gem root when the loaded copy cannot be
# located from $LOADED_FEATURES (for example under a packaged install).

require "json"
require "shellwords"
require "plurimath"

def gem_root
  override = ENV["PLURIMATH_GEM_ROOT"]
  return File.expand_path(override) if override && !override.empty?

  entry = $LOADED_FEATURES.find { |path| path.end_with?("/lib/plurimath.rb") }
  return File.expand_path("../..", entry) if entry

  Gem.loaded_specs.fetch("plurimath").full_gem_path
end

def revision_of(directory)
  revision = `git -C #{directory.shellescape} rev-parse HEAD 2>/dev/null`.strip
  revision.empty? ? nil : revision
end

def descendants(root, into = [])
  (root.descendants || []).sort_by(&:name).each do |child|
    into << child
    descendants(child, into)
  end
  into
end

def symbol_id(klass)
  klass.name.delete_prefix("Plurimath::Math::Symbols::")
end

def mathml_descriptor(element)
  {
    "tag" => element.name.to_s,
    "text" => element.nodes.map(&:to_s),
    "attributes" => element.attributes.to_h { |key, value| [key.to_s, value.to_s] }.sort.to_h,
  }
end

def value_for(klass, format, table: false, display_style: nil, value: nil, rspace: nil)
  node = klass.new(value, nil, options: rspace ? { rspace: rspace } : {})
  options = table ? { table: true } : {}
  case format
  when "asciimath" then node.to_asciimath(options: options)
  when "html" then node.to_html(options: options)
  when "latex" then node.to_latex(options: options)
  when "mathml" then mathml_descriptor(node.to_mathml_without_math_tag(false, options: options))
  when "omml" then node.to_omml_without_math_tag(display_style, options: options)
  when "unicodemath" then node.to_unicodemath(options: options)
  else raise "unknown format #{format}"
  end
end

root_directory = gem_root
Dir.glob(File.join(root_directory, "lib/plurimath/math/**/*.rb")).sort.each { |file| require file }

root = Plurimath::Math::Symbols::Symbol
descendant_classes = descendants(root).uniq.sort_by(&:name)
all_classes = [root, *descendant_classes]
static_classes = descendant_classes.reject { |klass| symbol_id(klass) == "Paren" }

formats = %w[asciimath html latex mathml omml unicodemath]
format_metrics = formats.to_h do |format|
  values = static_classes.to_h { |klass| [symbol_id(klass), value_for(klass, format)] }
  multiplicities = values.values.tally
  types = values.values.group_by { |value| value.nil? ? "nil" : value.class.name }
    .transform_values(&:length).sort.to_h
  [
    format,
    {
      "rows" => values.length,
      "distinct_payloads" => values.values.uniq.length,
      # Rows whose payload some earlier row already emitted. `rows -
      # distinct_payloads`, stated directly so the document quotes a measured
      # number rather than a subtraction.
      "duplicate_rows_beyond_first" => values.length - values.values.uniq.length,
      # How many rows the single most-repeated payload covers. This is what
      # bounds any deduplication saving: a maximum of N means no payload is
      # shared by more than N ids.
      "max_payload_multiplicity" => multiplicities.values.max,
      "types" => types,
      "nil_ids" => values.select { |_id, value| value.nil? }.keys.sort,
    },
  ]
end

axis_metrics = %w[html omml].to_h do |format|
  baseline = static_classes.to_h { |klass| [symbol_id(klass), value_for(klass, format)] }
  table = static_classes.to_h do |klass|
    [symbol_id(klass), value_for(klass, format, table: true)]
  end
  custom_value = static_classes.to_h do |klass|
    [symbol_id(klass), value_for(klass, format, value: "zzvaluezz")]
  end
  rspace = static_classes.to_h do |klass|
    [symbol_id(klass), value_for(klass, format, rspace: "thickmathspace")]
  end
  display_true = if format == "omml"
                   static_classes.to_h do |klass|
                     [symbol_id(klass), value_for(klass, format, display_style: true)]
                   end
                 else
                   baseline
                 end
  [
    format,
    {
      "table_variants" => baseline.keys.count { |id| baseline.fetch(id) != table.fetch(id) },
      "custom_value_variants" => baseline.keys.count do |id|
        baseline.fetch(id) != custom_value.fetch(id)
      end,
      "rspace_variants" => baseline.keys.count { |id| baseline.fetch(id) != rspace.fetch(id) },
      "display_style_variants" => baseline.keys.count do |id|
        baseline.fetch(id) != display_true.fetch(id)
      end,
    },
  ]
end

helper_names = %i[insert_t_tag omml_nodes t_tag font_style_t_tag nary_attr_value]
helper_owners = helper_names.to_h do |method_name|
  owners = static_classes.group_by { |klass| klass.new.method(method_name).owner.name }
    .transform_values(&:length).sort.to_h
  [method_name.to_s, owners]
end

method_owners = %i[to_html to_omml_without_math_tag].to_h do |method_name|
  owners = static_classes.group_by { |klass| klass.new.method(method_name).owner.name }
  [
    method_name.to_s,
    {
      "distinct_owners" => owners.length,
      "owned_by_symbol_root" => owners.fetch(root.name, []).length,
    },
  ]
end

puts JSON.pretty_generate(
  "ruby_version" => RUBY_VERSION,
  "oracle_root" => root_directory,
  "oracle_revision" => revision_of(root_directory),
  "symbol_classes_total_including_root" => all_classes.length,
  "symbol_descendants" => descendant_classes.length,
  "static_symbol_rows" => static_classes.length,
  # The canonical row order: sorted by fully qualified class name. The
  # generated maps must key in exactly this order.
  "static_symbol_ids" => static_classes.map { |klass| symbol_id(klass) },
  "excluded" => {
    "Symbol" => {
      "reason" => "dynamic root",
      "html_nil" => root.new.to_html.nil?,
      "html_probe" => root.new("x").to_html,
      "omml_nil" => root.new.to_omml_without_math_tag(nil).nil?,
      "omml_probe" => root.new("x").to_omml_without_math_tag(nil),
    },
    "Paren" => {
      "reason" => "abstract carrier",
      "html" => descendant_classes.find { |klass| symbol_id(klass) == "Paren" }.new.to_html,
      "omml" => descendant_classes.find do |klass|
        symbol_id(klass) == "Paren"
      end.new.to_omml_without_math_tag(nil),
    },
  },
  "formats" => format_metrics,
  "axes" => axis_metrics,
  "omml_helper_owners" => helper_owners,
  "payload_method_owners" => method_owners,
)
