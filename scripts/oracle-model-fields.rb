# frozen_string_literal: true

# Runtime field discovery for the Lutaml-backed oracle model. Kept separate
# until the generators can regenerate all payloads against the newer oracle.
module OracleModelFields
  module_function

  # node_fields creates Ruby accessors in Core and scalar Lutaml attributes.
  # Their declarations need not contain a literal @ivar or attr_accessor in
  # the model source. Read the runtime declarations, keeping mapping views
  # (__value_node etc.) and framework state out of the model field list.
  def declared_fields(klass)
    core = Plurimath::Math::Core
    return [] unless core.respond_to?(:node_fields)

    core_source = core.method(:node_fields).source_location&.first
    accessors = klass.instance_methods(false).filter_map do |name|
      field = name.to_s
      next unless field.match?(/\A[a-z][a-z_0-9]*\z/)
      next unless klass.instance_methods(false).include?(:"#{field}=")
      next unless klass.instance_method(name).source_location&.first == core_source

      field
    end
    attributes = klass.attributes.keys.map(&:to_s)
    inherited = klass.superclass.attributes.keys.map(&:to_s)
    scalars = (attributes - inherited).reject { |name| name.start_with?("__") }
    (accessors + scalars).uniq.sort
  end
end
