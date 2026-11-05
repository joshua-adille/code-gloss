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
    for (const step of this.options.steps ?? []) {
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
