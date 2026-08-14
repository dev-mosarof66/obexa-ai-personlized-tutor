import type { ReactNode } from "react";

type Block =
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const bulletRe = /^\s*[-*]\s+(.*)$/;
  const orderedRe = /^\s*\d+[.)]\s+(.*)$/;
  const headingRe = /^#{1,6}\s+(.*)$/;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = headingRe.exec(line);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1].trim() });
      i++;
      continue;
    }

    const bullet = bulletRe.exec(line);
    const ordered = orderedRe.exec(line);
    if (bullet || ordered) {
      const isOrdered = !!ordered;
      const items: string[] = [];
      while (i < lines.length) {
        const m = isOrdered ? orderedRe.exec(lines[i]) : bulletRe.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !headingRe.test(lines[i]) &&
      !bulletRe.test(lines[i]) &&
      !orderedRe.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(...splitInlineOrderedList(paraLines.join(" ")));
  }

  return blocks;
}

// Some model output runs a numbered list together in one sentence instead of
// one item per line (e.g. "...are: 1. Accuracy: ... 2. Timeliness: ..."). If a
// paragraph contains a clean 1, 2, 3, … run of inline markers, split it into a
// real list instead of rendering the digits as plain text.
function splitInlineOrderedList(text: string): Block[] {
  const markerRe = /(?:^|\s)(\d{1,2})[.)]\s+/g;
  const matches: { index: number; end: number; num: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(text))) {
    matches.push({ index: m.index, end: markerRe.lastIndex, num: Number(m[1]) });
  }

  if (matches.length < 2 || matches.some((match, idx) => match.num !== idx + 1)) {
    return [{ type: "paragraph", text }];
  }

  const blocks: Block[] = [];
  const lead = text.slice(0, matches[0].index).trim();
  if (lead) blocks.push({ type: "paragraph", text: lead });

  const items = matches.map((match, idx) => {
    const end = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
    return text.slice(match.end, end).trim();
  });
  blocks.push({ type: "list", ordered: true, items });
  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*.+?\*\*|`.+?`)/g)
    .filter((part) => part.length > 0)
    .map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={key} className="rounded bg-foreground/10 px-1 py-0.5 text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={key}>{part}</span>;
    });
}

/** Minimal, dependency-free markdown renderer for AI chat replies: headings, bold, inline code, and lists. */
export function MarkdownLite({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="font-semibold">
              {renderInline(block.text, `h${i}`)}
            </p>
          );
        }
        if (block.type === "list") {
          const items = block.items.map((item, j) => (
            <li key={j}>{renderInline(item, `li${i}-${j}`)}</li>
          ));
          return block.ordered ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            {renderInline(block.text, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
}
