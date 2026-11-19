import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, runRuby } from "./oracle-harness";

function censusFields(expression: string): unknown {
  const result = runRuby(`
    begin
    require "json"
    require "tmpdir"
    helper = ${JSON.stringify(join(REPO_ROOT, "scripts", "oracle-model-fields.rb"))}
    # Class-B tests exercise discovery without loading an oracle bundle.
    require helper
    Dir.mktmpdir do |dir|
      core = File.join(dir, "core.rb")
      File.write(core, <<~'RUBY')
        module Plurimath
          module Math
            class Core
              def self.attributes
                @attributes || (superclass.respond_to?(:attributes) ? superclass.attributes : {})
              end

              def self.node_fields(*fields, scalars: {}, symbols: [])
                (fields + symbols).each { |name| attr_accessor name }
                fields.each { |name| attr_accessor :"__#{name}_node" }
                scalars.each_key { |name| attr_accessor name }
                @attributes = attributes.merge(scalars).merge(fields.to_h { |name| [:"__#{name}_node", :node] })
              end
            end
          end
        end
      RUBY
      require core
      model = File.join(dir, "models.rb")
      File.write(model, <<~'RUBY')
        class Parent < Plurimath::Math::Core
          node_fields :value, scalars: { inherited_flag: :boolean }
        end
        class Annotation < Parent
          node_fields :content, symbols: %i[tag], scalars: { enabled: :boolean }
        end
        class Legacy < Plurimath::Math::Core
          attr_accessor :label
          def initialize
            @value = nil
            @__cache = nil
            @lutaml_register = nil
            @using_default = nil
          end
        end
      RUBY
      require model
      puts JSON.generate(${expression})
    end
    rescue Exception => error
      puts error.full_message
      exit 1
    end
  `);
  expect(result.status, result.stdout).toBe(0);
  return JSON.parse(result.stdout.trim());
}

describe("oracle census fields declared by node_fields", () => {
  it("discovers node, symbol and scalar fields without assigned ivars", () => {
    expect(censusFields("OracleModelFields.declared_fields(Annotation)")).toEqual([
      "content",
      "enabled",
      "tag",
    ]);
  });

  it("keeps inherited fields and mapping views out of own declarations", () => {
    expect(censusFields("OracleModelFields.declared_fields(Annotation)")).toEqual([
      "content",
      "enabled",
      "tag",
    ]);
    expect(censusFields("OracleModelFields.declared_fields(Parent)")).toEqual([
      "inherited_flag",
      "value",
    ]);
  });

  it("leaves ordinary source declarations to the existing scanner", () => {
    expect(censusFields("OracleModelFields.declared_fields(Legacy)")).toEqual([]);
  });

  it("still handles oracles from before node_fields existed", () => {
    expect(
      censusFields(`begin
        Plurimath::Math::Core.singleton_class.remove_method(:node_fields)
        OracleModelFields.declared_fields(Legacy)
      end`),
    ).toEqual([]);
  });
});
