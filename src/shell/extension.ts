import * as vscode from "vscode";
import { ExplanationEngine } from "../engine/explanationEngine";
import { FakeHarness } from "../harness/fakeHarness";
import { ExplanationPanel, type RenderedPanel } from "./explanationPanel";

export type { RenderedPanel };

/** Lets the smoke test see what the webview really shows. */
export interface CodeGlossApi {
  onDidRender: vscode.Event<RenderedPanel>;
  panelHtml(): string | undefined;
}

export function activate(context: vscode.ExtensionContext): CodeGlossApi {
  const engine = new ExplanationEngine(new FakeHarness(), (state) =>
    panel.show(state),
  );
  const panel = new ExplanationPanel(context.extensionUri, engine.state);

  context.subscriptions.push(
    vscode.commands.registerCommand("codeGloss.openPanel", () => panel.open()),
    vscode.commands.registerCommand("codeGloss.explainSelection", () => {
      // There is no active text editor while the panel has focus.
      const editor =
        vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
      panel.open();
      if (editor) {
        void engine.explain({
          selection: editor.document.getText(editor.selection),
          fileContents: editor.document.getText(),
          settings: {},
        });
      }
    }),
  );

  return {
    onDidRender: panel.onDidRender,
    panelHtml: () => panel.html,
  };
}
