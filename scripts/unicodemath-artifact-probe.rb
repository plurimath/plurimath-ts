# frozen_string_literal: true

require "parsanol/parg"

# Probe a named rule in the checksummed grammar the oracle actually loads.
# Only the entry selection varies with locale; source and atoms are shared.
class UnicodemathArtifactProbe
  def self.document
    Plurimath::UnicodeMath::Parser.load_umath
    @document ||= Parsanol::PARG::Parser.new(Umath.artifacts.parse.envelope.fetch("source")).parse
  end

  def self.compiler
    @compiler ||= Parsanol::PARG::Compiler.new(document, nil)
  end

  def rule(name)
    self.class.document
    marker = ::Umath::RawParser.entry_for(Plurimath.configuration.decimal)
    specialized = "#{name}__#{marker}"
    key = self.class.document.rules.key?(specialized) ? specialized : name.to_s
    self.class.compiler.atom_for(key)
  end
end

class UnicodemathArtifactProbe
  def literals(name)
    self.class.document
    marker = ::Umath::RawParser.entry_for(Plurimath.configuration.decimal)
    specialized = "#{name}__#{marker}"
    key = self.class.document.rules.key?(specialized) ? specialized : name.to_s
    finite(self.class.document.rules.fetch(key), [])
  end

  def finite(node, seen)
    case node.kind
    when :lit then [node.a]
    when :cap then finite(node.b, seen)
    when :pred then [""]
    when :alt then node.a.flat_map { |part| finite(part, seen) }
    when :seq
      node.a.reduce([""]) do |prefixes, part|
        prefixes.product(finite(part, seen)).map { |left, right| left + right }
      end
    when :ref
      raise "recursive finite token rule #{node.a}" if seen.include?(node.a)
      finite(self.class.document.rules.fetch(node.a), seen + [node.a])
    else raise "nonliteral token atom #{node.kind.inspect}"
    end
  end
end
