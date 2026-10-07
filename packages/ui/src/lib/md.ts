/**
 * A deliberately small Markdown renderer for agent messages: headings, lists,
 * bold/italic, inline code, fenced code, links, paragraphs. Escapes HTML first,
 * so nothing an agent (or a web page it read) says can inject markup.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code class="mono rounded bg-bg/60 px-1 py-0.5 text-[0.92em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="underline decoration-mute underline-offset-2 hover:text-fg" href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a class="underline decoration-mute underline-offset-2 hover:text-fg" href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      flushPara();
      const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) buf.push(lines[i]!), i++;
      i++;
      out.push(`<pre class="mono overflow-auto rounded-md bg-bg/60 p-2 text-[0.92em]">${esc(buf.join("\n"))}</pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); const lvl = Math.min(h[1]!.length, 3); out.push(`<h${lvl + 2} class="font-semibold ${lvl === 1 ? "text-[1.05em] mt-1" : "text-[1em] mt-2 text-fg-2"}">${inline(h[2]!)}</h${lvl + 2}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i]!.replace(/^\s*[-*]\s+/, "")), i++;
      out.push(`<ul class="list-disc space-y-0.5 pl-5">${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, "")), i++;
      out.push(`<ol class="list-decimal space-y-0.5 pl-5">${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) { flushPara(); out.push(`<blockquote class="border-l-2 border-line-2 pl-3 text-fg-2">${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`); i++; continue; }
    if (!line.trim()) { flushPara(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flushPara();
  return out.join("");
}
