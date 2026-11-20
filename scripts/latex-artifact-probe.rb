# frozen_string_literal: true

# The loaded latexmath grammar retains its exported atom inventory. Rebuild
# individual probe rules from that inventory, never from retired Ruby APIs.
require "parsanol"
require "json"
require "digest"

module LatexArtifactProbe
  module_function

  def rules
    Plurimath::Latex::Parser.load_latexmath
    @rules ||= begin
      spec = Gem.loaded_specs.fetch("latexmath")
      path = File.join(spec.full_gem_path, "data", "latex-atoms.json")
      bytes = File.binread(path)
      artifact = JSON.parse(File.read(File.join(spec.full_gem_path, "artifacts", "latex.json")))
      expected = artifact.fetch("source")[/data\/latex-atoms\.json sha256:([0-9a-f]{64})/, 1]
      raise "latex atom inventory does not match the loaded grammar" unless expected == Digest::SHA256.hexdigest(bytes)
      data = JSON.parse(bytes)
      raise "unsupported latex atom inventory" unless data.fetch("format") == "latexmath-atoms/v1"

      data.fetch("rules").to_h
    end
  end

  def node(name)
    choices = rules.fetch(name.to_s)
    choices.fetch("*") { choices.fetch({ "." => "dot", "," => "comma", "٫" => "arabic" }.fetch(Plurimath.configuration.decimal)) }
  end

  def first(node, tag)
    return node[1] if node.first == tag

    node.drop(1).each do |child|
      next unless child.is_a?(Array)
      value = first(child, tag)
      return value unless value.nil?
    end
    nil
  end

  def literals(name)
    atom = node(name)
    raise "#{name} is not an alternative" unless atom.first == "alt"

    atom.drop(1).map do |branch|
      value = first(branch, "str")
      raise "#{name} has a nonliteral branch" unless value
      value
    end
  end

  def symbol_rows
    # The first two branches are entity and explicit spacing probes; the last
    # three delegate to independently emitted class lists.
    branches = node("symbol_class_commands").drop(3)[0...-3]
    rows = branches.map do |branch|
      text = first(branch, "str")
      capture = first(branch, "as")
      kind = case capture
             when "symbols", "operant" then capture
             else Plurimath::Latex::Constants::SYMBOLS.fetch(text.to_sym).to_s
             end
      [text, kind]
    end.uniq
    raise "empty latex symbol inventory" if rows.empty?

    rows.sort_by { |text, kind| [-text.length, text, kind == "symbols" ? 0 : 1, kind] }
  end

  class Parser < Parsanol::Parser
    def compile(node)
      type, *args = node
      case type
      when "str" then str(args.fetch(0))
      when "re" then match(args.fetch(0))
      when "ref" then public_send(args.fetch(0))
      when "as" then compile(args.fetch(1)).as(args.fetch(0).to_sym)
      when "seq" then args.map { |child| compile(child) }.reduce(:>>)
      when "alt" then args.map { |child| compile(child) }.reduce(:|)
      when "rep"
        inner = compile(args.fetch(3))
        args.fetch(2) == "maybe" ? inner.maybe : inner.repeat(args.fetch(0), args.fetch(1))
      when "look"
        inner = compile(args.fetch(1))
        args.fetch(0) ? inner.present? : inner.absent?
      else raise "unsupported latex atom #{type.inspect}"
      end
    end
  end

  def parser
    @parser_class ||= begin
      klass = Class.new(Parser)
      rules.each_key do |name|
        klass.rule(name.to_sym) { compile(LatexArtifactProbe.node(name)) }
      end
      klass
    end
    @parser_class.new
  end
end
