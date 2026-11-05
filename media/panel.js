const vscode = acquireVsCodeApi();
const status = document.getElementById("status");
const explanation = document.getElementById("explanation");

window.addEventListener("message", ({ data: state }) => {
  status.textContent = state.message ?? "";
  document.body.dataset.state = state.kind;
  explanation.innerHTML = state.html ?? "";

  vscode.postMessage({
    type: "rendered",
    kind: state.kind,
    text: document.body.textContent,
    html: document.body.innerHTML,
  });
});

vscode.postMessage({ type: "ready" });
