import {
  HarnessError,
  type HarnessAdapter,
  type HarnessErrorKind,
  type HarnessRequest,
} from "../harness/harnessAdapter";
import { renderMarkdown } from "./renderMarkdown";

/** Everything the Explanation panel can show. `html` is safe to display. */
export type PanelState =
  | { kind: "hint"; message: string }
  | { kind: "explaining"; message: string; html: string }
  | { kind: "explained"; html: string }
  | { kind: "failed"; error: HarnessErrorKind; message: string };

export interface ExplainInput {
  selection: string;
  fileContents: string;
  settings: { model?: string };
}

const EXPLAINING_MESSAGE = "Explaining…";

export class ExplanationEngine {
  private currentState: PanelState = {
    kind: "hint",
    message: "Select some code, then run Code Gloss: Explain Selection.",
  };
  private runningExplanation: AbortController | undefined;

  constructor(
    private readonly harness: HarnessAdapter,
    private readonly onStateChange: (state: PanelState) => void,
  ) {}

  get state(): PanelState {
    return this.currentState;
  }

  /** Explains a selection, replacing any explanation already running. */
  async explain(input: ExplainInput): Promise<void> {
    if (input.selection === "") {
      return;
    }

    this.runningExplanation?.abort();
    const run = new AbortController();
    this.runningExplanation = run;

    this.publish({ kind: "explaining", message: EXPLAINING_MESSAGE, html: "" });

    const request: HarnessRequest = {
      selection: input.selection,
      fileContents: input.fileContents,
      model: input.settings.model,
    };

    try {
      await this.streamExplanation(request, run.signal);
    } catch (error) {
      if (!run.signal.aborted) {
        this.publish(failedState(error));
      }
    }
  }

  private async streamExplanation(
    request: HarnessRequest,
    signal: AbortSignal,
  ): Promise<void> {
    let explanation = "";
    for await (const chunk of this.harness.stream(request, signal)) {
      if (signal.aborted) {
        return;
      }
      explanation += chunk;
      this.publish({
        kind: "explaining",
        message: EXPLAINING_MESSAGE,
        html: renderMarkdown(explanation),
      });
    }

    if (!signal.aborted) {
      this.publish({ kind: "explained", html: renderMarkdown(explanation) });
    }
  }

  private publish(state: PanelState): void {
    this.currentState = state;
    this.onStateChange(state);
  }
}

function failedState(error: unknown): PanelState {
  if (error instanceof HarnessError) {
    return { kind: "failed", error: error.kind, message: error.message };
  }
  return {
    kind: "failed",
    error: "failed",
    message: "The harness failed unexpectedly.",
  };
}
