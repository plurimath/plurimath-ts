import {
  type CompatibilityEnvelope,
  type FailureReporter,
  PargRuntime,
  type ParsingCompatibility,
} from "parsanol";

/** Only the facade's default text/HTML artifacts opt into this finite budget. */
export class BoundedRuntime extends PargRuntime {
  constructor(
    artifactJson: string,
    entry?: string,
    private readonly maxCallDepth = 8192,
  ) {
    super(artifactJson, entry);
  }

  override parseShape(input: string): unknown {
    const result = this.parseShapeWithCallDepth(input, "strict", "default", this.maxCallDepth);
    // Retain the old raw API's syntax diagnostic for the typed stage mapper.
    return result.ok ? result.shape : super.parseShape(input);
  }

  override parseShapeWithCompatibility(
    input: string,
    compatibility: string,
  ): CompatibilityEnvelope {
    // Native resources throw before this envelope reaches the consumer.
    return this.parseShapeWithCallDepth(
      input,
      compatibility as ParsingCompatibility,
      "default",
      this.maxCallDepth,
    ) as CompatibilityEnvelope;
  }

  override parseShapeWithReporter(
    input: string,
    compatibility: string,
    reporter: string = "default",
  ) {
    return this.parseShapeWithCallDepth(
      input,
      compatibility as ParsingCompatibility,
      reporter as FailureReporter,
      this.maxCallDepth,
    ) as CompatibilityEnvelope;
  }
}
