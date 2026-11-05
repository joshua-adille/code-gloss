/** What the Explanation engine asks a Harness to explain. */
export interface HarnessRequest {
  selection: string;
  fileContents: string;
  /** Omitted to use the harness's default model. */
  model?: string;
}

export type HarnessErrorKind =
  | "not-installed"
  | "not-logged-in"
  | "input-too-large"
  | "failed";

export class HarnessError extends Error {
  constructor(
    readonly kind: HarnessErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "HarnessError";
  }
}

/** The contract every Harness adapter implements. */
export interface HarnessAdapter {
  detect(): Promise<boolean>;

  /**
   * Streams the explanation as Markdown chunks. Aborting `signal` cancels the
   * run. A failed run throws a HarnessError from the stream.
   */
  stream(request: HarnessRequest, signal: AbortSignal): AsyncIterable<string>;
}
