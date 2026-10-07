/** Slack renders "mrkdwn", not Markdown: no headings, *single-star* bold, no "- " bullets. */
export function toSlackMrkdwn(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      if (h) return `*${h[1]!.trim()}*`;
      return line.replace(/^(\s*)[-*]\s+/, "$1• ").replace(/\*\*(.+?)\*\*/g, "*$1*");
    })
    .join("\n");
}
