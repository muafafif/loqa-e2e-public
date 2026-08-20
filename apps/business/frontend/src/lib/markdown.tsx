"use client";

import React from "react";
import type { Citation } from "@/types";
import { CitationBadge } from "@/components/chat/CitationBadge";

// ── Inline renderer ────────────────────────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, [text](url), [N] citation markers

function renderInline(text: string, citations: Citation[], key?: string | number): React.ReactNode {
  // Tokenise into segments: bold, italic, inline-code, links, citations
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[(\d+)\]|\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));

    if (m[2] !== undefined) {
      nodes.push(<strong key={m.index} className="font-semibold">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={m.index} className="italic">{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={m.index} className="px-1.5 py-0.5 rounded text-xs bg-black/30 font-mono">
          {m[4]}
        </code>
      );
    } else if (m[5] !== undefined) {
      const idx = parseInt(m[5]);
      const citation = citations.find((c) => c.index === idx);
      nodes.push(citation
        ? <CitationBadge key={m.index} citation={citation} />
        : <span key={m.index}>{m[0]}</span>
      );
    } else if (m[6] !== undefined && m[7] !== undefined) {
      nodes.push(
        <a key={m.index} href={m[7]} target="_blank" rel="noopener noreferrer"
          className="text-brand-400 underline underline-offset-2 hover:text-brand-300 transition-colors">
          {m[6]}
        </a>
      );
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));

  return nodes.length === 1 ? nodes[0] : <React.Fragment key={key}>{nodes}</React.Fragment>;
}

// ── Block parser ───────────────────────────────────────────────────────────────

type Block =
  | { t: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { t: "hr" }
  | { t: "code"; lang: string; lines: string[] }
  | { t: "blockquote"; lines: string[] }
  | { t: "ul"; items: string[][] }
  | { t: "ol"; items: string[][] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "para"; text: string };

function parseBlocks(raw: string): Block[] {
  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks
    if (line.trim() === "") { i++; continue; }

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      blocks.push({ t: "code", lang, lines: codeLines });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      blocks.push({ t: "heading", level: hMatch[1].length as 1|2|3|4|5|6, text: hMatch[2] });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ t: "blockquote", lines: bqLines });
      continue;
    }

    // Unordered list
    if (/^[-*+] /.test(line)) {
      const items: string[][] = [];
      let currentItem: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (/^[-*+] /.test(l)) {
          if (currentItem.length) items.push(currentItem);
          currentItem = [l.replace(/^[-*+] /, "")];
          i++;
        } else if (/^  +/.test(l) && currentItem.length) {
          currentItem.push(l.trim());
          i++;
        } else {
          break;
        }
      }
      if (currentItem.length) items.push(currentItem);
      blocks.push({ t: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[][] = [];
      let currentItem: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (/^\d+\. /.test(l)) {
          if (currentItem.length) items.push(currentItem);
          currentItem = [l.replace(/^\d+\. /, "")];
          i++;
        } else if (/^   +/.test(l) && currentItem.length) {
          currentItem.push(l.trim());
          i++;
        } else {
          break;
        }
      }
      if (currentItem.length) items.push(currentItem);
      blocks.push({ t: "ol", items });
      continue;
    }

    // Table (GFM): header | col | …  /  separator  /  rows
    if (line.includes("|") && i + 1 < lines.length && /^\|?[-| :]+\|?$/.test(lines[i + 1].trim())) {
      const parseRow = (l: string) =>
        l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const head = parseRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }

    // Paragraph — accumulate until blank line or block-level element starts
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (/^(#{1,6} |```|> |-  |[-*+] |\d+\. |---|===|\*\*\*|___)/.test(l)) break;
      if (l.includes("|") && i + 1 < lines.length && /^\|?[-| :]+\|?$/.test(lines[i + 1].trim())) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ t: "para", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── React renderer ─────────────────────────────────────────────────────────────

export function MarkdownContent({ content, citations = [] }: { content: string; citations?: Citation[] }) {
  const blocks = parseBlocks(content);

  return (
    <div className="markdown-body space-y-1.5 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        switch (block.t) {
          case "heading": {
            const cls = [
              "font-bold mt-2 mb-0.5",
              block.level <= 2 ? "text-base" : "text-sm",
            ].join(" ");
            return <p key={bi} className={cls}>{renderInline(block.text, citations, bi)}</p>;
          }

          case "hr":
            return <hr key={bi} className="my-2 border-white/10" />;

          case "code":
            return (
              <pre key={bi} className="overflow-x-auto rounded-lg text-xs my-1 p-3 bg-black/40 border border-white/10 font-mono">
                <code>{block.lines.join("\n")}</code>
              </pre>
            );

          case "blockquote":
            return (
              <blockquote key={bi} className="border-l-2 border-brand-500 pl-3 my-1 opacity-80 italic">
                {block.lines.map((l, li) => (
                  <span key={li} className="block">{renderInline(l, citations, li)}</span>
                ))}
              </blockquote>
            );

          case "ul":
            return (
              <ul key={bi} className="list-disc list-outside pl-5 space-y-0.5">
                {block.items.map((item, ii) => (
                  <li key={ii} className="leading-snug">
                    {item.map((line, li) => (
                      <span key={li} className={li > 0 ? "block pl-2" : undefined}>
                        {renderInline(line, citations)}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={bi} className="list-decimal list-outside pl-5 space-y-0.5">
                {block.items.map((item, ii) => (
                  <li key={ii} className="leading-snug">
                    {item.map((line, li) => (
                      <span key={li} className={li > 0 ? "block pl-2" : undefined}>
                        {renderInline(line, citations)}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            );

          case "table":
            return (
              <div key={bi} className="overflow-x-auto my-1">
                <table className="w-full text-xs border-collapse">
                  <thead className="border-b border-white/20">
                    <tr>
                      {block.head.map((h, hi) => (
                        <th key={hi} className="px-3 py-1.5 text-left font-semibold opacity-90">
                          {renderInline(h, citations)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 1 ? "bg-white/5" : ""}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 border-b border-white/10">
                            {renderInline(cell, citations)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "para":
            return (
              <p key={bi} className="leading-relaxed">
                {renderInline(block.text, citations, bi)}
              </p>
            );
        }
      })}
    </div>
  );
}
