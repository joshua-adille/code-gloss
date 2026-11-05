import * as assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { CodeGlossApi, RenderedPanel } from "../../src/shell/extension";

const LINE_WITH_UNSAVED_EDIT = "const unsavedEdit = 1;";
const LINE_WITH_RAW_HTML = '<img src="https://example.invalid/raw.png">';
const LINE_WITH_IMAGE = "![leak](https://example.invalid/markdown.png)";
const LINE_AT_OTHER_CURSOR = "const otherCursor = 2;";

describe("Code Gloss in real VS Code", () => {
  it("explains the selected code in a panel beside the editor", async () => {
    const extension = vscode.extensions.getExtension<CodeGlossApi>(
      "joshua-adille.code-gloss",
    );
    assert.ok(extension);
    const api = await extension.activate();
    const renders: RenderedPanel[] = [];
    api.onDidRender((render) => renders.push(render));

    const folder = await mkdtemp(join(tmpdir(), "code-gloss-"));
    const file = join(folder, "sample.ts");
    await writeFile(file, "const onDisk = 1;\n");
    const document = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand("codeGloss.openPanel");
    const hint = await waitFor(() => renders.find((r) => r.kind === "hint"));
    assert.match(hint.text, /select some code/i);

    assert.equal(vscode.window.activeTextEditor?.document, document);
    assert.equal(editor.viewColumn, vscode.ViewColumn.One);
    const [codeGroup, panelGroup] = vscode.window.tabGroups.all;
    assert.ok(codeGroup?.activeTab?.input instanceof vscode.TabInputText);
    assert.ok(panelGroup?.activeTab?.input instanceof vscode.TabInputWebview);

    // The fake harness wraps the selection in a code fence, and the backticks
    // here close it. That puts this hostile text into the Markdown renderer,
    // which is where an injected file would aim it.
    const unsavedText = [
      LINE_WITH_UNSAVED_EDIT,
      "```",
      LINE_WITH_RAW_HTML,
      LINE_WITH_IMAGE,
      "",
      LINE_AT_OTHER_CURSOR,
    ].join("\n");
    await editor.edit((edit) =>
      edit.replace(
        new vscode.Range(0, 0, document.lineCount, 0),
        unsavedText,
      ),
    );
    assert.ok(document.isDirty);
    editor.selections = [
      new vscode.Selection(0, 0, 3, LINE_WITH_IMAGE.length),
      new vscode.Selection(5, 0, 5, LINE_AT_OTHER_CURSOR.length),
    ];

    await vscode.commands.executeCommand("codeGloss.explainSelection");
    const explained = await waitFor(() =>
      renders.find((r) => r.kind === "explained"),
    );

    const partialTexts = renders
      .filter((r) => r.kind === "explaining")
      .map((r) => r.text);
    assert.ok(
      new Set(partialTexts).size > 2,
      "expected the explanation to stream in over several renders",
    );
    assert.ok(partialTexts[0]?.includes("Explaining"));

    assert.match(explained.html, /<h2[ >]/, "expected rendered Markdown");
    assert.ok(explained.text.includes(LINE_WITH_UNSAVED_EDIT));
    assert.ok(
      explained.text.includes("4 of 6 lines"),
      "expected the editor's text rather than the file on disk",
    );
    assert.ok(!explained.text.includes(LINE_AT_OTHER_CURSOR));

    assert.ok(explained.text.includes(LINE_WITH_RAW_HTML));
    assert.ok(explained.text.includes(LINE_WITH_IMAGE));
    assert.doesNotMatch(explained.html, /<(img|a)\b/i);

    assert.equal(vscode.window.activeTextEditor?.document, document);

    const policy = api
      .panelHtml()
      ?.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
    assert.ok(policy, "expected a content security policy");
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /script-src 'nonce-[^' ]+'(;|$)/);
    assert.doesNotMatch(policy, /unsafe/);
    assert.deepEqual(
      policy.split("; ").map((directive) => directive.split(" ")[0]),
      ["default-src", "style-src", "script-src", "base-uri", "form-action"],
      "images, connections, fonts and frames must fall back to default-src",
    );
  });
});

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the panel");
}
