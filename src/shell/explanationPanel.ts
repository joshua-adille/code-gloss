import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { PanelState } from "../engine/explanationEngine";

/** What the webview reports after showing a state. */
export interface RenderedPanel {
  kind: PanelState["kind"];
  text: string;
  html: string;
}

type WebviewMessage =
  | { type: "ready" }
  | ({ type: "rendered" } & RenderedPanel);

/** Hosts the webview beside the editor and shows it each panel state. */
export class ExplanationPanel {
  private panel: vscode.WebviewPanel | undefined;
  private readonly rendered = new vscode.EventEmitter<RenderedPanel>();

  readonly onDidRender = this.rendered.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private state: PanelState,
  ) {}

  get html(): string | undefined {
    return this.panel?.webview.html;
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      return;
    }

    const media = vscode.Uri.joinPath(this.extensionUri, "media");
    const panel = vscode.window.createWebviewPanel(
      "codeGloss.explanation",
      "Explanation",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, enableForms: false, localResourceRoots: [media] },
    );
    panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.type === "ready") {
        void panel.webview.postMessage(this.state);
      } else {
        this.rendered.fire(message);
      }
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    panel.webview.html = panelDocument(panel.webview, media);
    this.panel = panel;
  }

  show(state: PanelState): void {
    this.state = state;
    void this.panel?.webview.postMessage(state);
  }
}

/**
 * The policy is the panel's backstop: nothing remote can load, and the only
 * script that runs is the extension's own, whatever ends up in the page.
 */
function panelDocument(webview: vscode.Webview, media: vscode.Uri): string {
  const nonce = randomBytes(16).toString("base64");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, "panel.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(media, "panel.css"));
  const policy = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${policy}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="${style}">
    <title>Explanation</title>
  </head>
  <body>
    <p id="status" role="status"></p>
    <main id="explanation"></main>
    <script nonce="${nonce}" src="${script}"></script>
  </body>
</html>`;
}
