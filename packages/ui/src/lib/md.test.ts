import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./md";

describe("renderMarkdown", () => {
  it("renders headings, lists, inline styles and escapes HTML", () => {
    const html = renderMarkdown("# Brief\n## Weather\n84°F, **sunny**\n- a `code` item\n- <script>alert(1)</script>\n\nSee https://garu.sh now");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
    expect(html).toContain("<strong>sunny</strong>");
    expect(html).toContain("<li>a <code");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="https://garu.sh"');
  });
  it("renders fenced code and paragraphs", () => {
    const html = renderMarkdown("hello\nworld\n\n```\nx < y\n```");
    expect(html).toContain("<p>hello world</p>");
    expect(html).toContain("<pre");
    expect(html).toContain("x &lt; y");
  });
});
