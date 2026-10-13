import React from "react";
import { parseMarkdownBlocks } from "../utils/markdown";

interface MarkdownViewProps {
  content: string;
}

function renderInline(text: string): React.ReactNode[] {
  // Regex splitting on code, bold, italic, and links
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Inline code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[12px] text-teal-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold: **text**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      const isSafe = /^https?:\/\/|^mailto:/i.test(url.trim());
      if (isSafe) {
        return (
          <a
            key={idx}
            href={url.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-2)] underline underline-offset-2 hover:text-[var(--accent)]"
          >
            {label}
          </a>
        );
      }
      return <span key={idx}>{label}</span>;
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function MarkdownView({ content }: MarkdownViewProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-200">
      {blocks.map((block, i) => {
        if (block.type === "h3" && block.content) {
          return (
            <h3 key={i} className="pt-1 font-semibold text-white">
              {renderInline(block.content)}
            </h3>
          );
        }
        if (block.type === "ul" && block.items) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-slate-200">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol" && block.items) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5 text-slate-200">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.content) {
          return <p key={i}>{renderInline(block.content)}</p>;
        }
        return null;
      })}
    </div>
  );
}
