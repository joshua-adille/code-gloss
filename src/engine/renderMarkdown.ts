import MarkdownIt from "markdown-it";

/**
 * Explanations are untrusted: text in a file can steer what the harness writes,
 * so an explanation must not be able to carry the code anywhere. Raw HTML is
 * escaped, and images and links stay as plain text so no URL can be fetched or
 * clicked.
 */
const markdown = new MarkdownIt({ html: false, linkify: false }).disable([
  "image",
  "link",
  "autolink",
  "reference",
]);

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
