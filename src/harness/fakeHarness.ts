import {
  HarnessError,
  type HarnessAdapter,
  type HarnessRequest,
} from "./harnessAdapter";

export interface FakeHarnessOptions {
  /**
   * What the run does, in order: stream a chunk, or fail with an error.
   * Defaults to a stand-in that describes the request.
   */
  steps?: (string | HarnessError)[];
  stepDelayMs?: number;
}

const MAX_CHUNKS = 40;

export class FakeHarness implements HarnessAdapter {
  /** Every request this harness has been asked to explain, oldest first. */
  readonly requests: HarnessRequest[] = [];
  cancelledRuns = 0;

  private readonly stepDelayMs: number;

  constructor(private readonly options: FakeHarnessOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 40;
  }

  async detect(): Promise<boolean> {
    return true;
  }

  async *stream(
    request: HarnessRequest,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    this.requests.push(request);
    for (const step of this.options.steps ?? describeRequest(request)) {
      await pause(this.stepDelayMs, signal);
      if (signal.aborted) {
        this.cancelledRuns += 1;
        return;
      }
      if (step instanceof HarnessError) {
        throw step;
      }
      yield step;
    }
  }
}

/** Stands in for a real explanation, split up so that it visibly streams. */
function describeRequest({ selection, fileContents }: HarnessRequest): string[] {
  const text = [
    "## Fake explanation\n\n",
    "This text comes from the fake harness, so it says nothing about what ",
    "the code means. ",
    `It was given ${lineCount(selection)} of ${lineCount(fileContents)} lines:`,
    "\n\n```\n",
    selection,
    "\n```\n",
  ].join("");

  const chunkLength = Math.ceil(text.length / MAX_CHUNKS);
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += chunkLength) {
    chunks.push(text.slice(start, start + chunkLength));
  }
  return chunks;
}

function lineCount(text: string): number {
  return text.split("\n").length;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
