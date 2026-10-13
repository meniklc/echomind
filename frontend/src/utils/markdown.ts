/**
 * Utilities for safe markdown rendering and text-to-speech cleaning.
 */

export function stripMarkdownForSpeech(text: string): string {
  if (!text) return "";
  let clean = text;

  // Remove code blocks
  clean = clean.replace(/```[\s\S]*?```/g, " ");
  // Remove inline code
  clean = clean.replace(/`([^`]+)`/g, "$1");
  // Replace links [text](url) with just text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove bold/italics markers
  clean = clean.replace(/(\*\*|__)(.*?)\1/g, "$2");
  clean = clean.replace(/(\*|_)(.*?)\1/g, "$2");
  // Remove headers (#, ##, etc.)
  clean = clean.replace(/^#{1,6}\s+/gm, "");
  // Remove blockquotes (> )
  clean = clean.replace(/^>\s+/gm, "");
  // Remove bullet points / dashes at start of line
  clean = clean.replace(/^[\s*•-]+\s+/gm, "");
  // Remove citation brackets like [1], [2]
  clean = clean.replace(/\[\d+\]/g, "");
  // Remove emoji characters
  clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
  // Remove horizontal rules
  clean = clean.replace(/^[=-]{3,}\s*$/gm, "");

  // Expand common acronyms for natural browser speech fallback
  clean = clean.replace(/\bFastAPI\b/g, "Fast A P I");
  clean = clean.replace(/\bUVCE\b/g, "U V C E");
  clean = clean.replace(/\bB\.Tech\b/gi, "B Tech");
  clean = clean.replace(/\bCSE\b/g, "C S E");
  clean = clean.replace(/\bLLMs\b/g, "L L M's");
  clean = clean.replace(/\bLLM\b/g, "L L M");
  clean = clean.replace(/\bRAG\b/g, "rag");
  clean = clean.replace(/\bVLMs\b/g, "V L M's");
  clean = clean.replace(/\bOCR\b/g, "O C R");

  // Collapse whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

export interface MarkdownBlock {
  type: "p" | "ul" | "ol" | "code" | "h3";
  content?: string;
  items?: string[];
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      if (currentList) {
        blocks.push({ type: currentList.type, items: currentList.items });
        currentList = null;
      }
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      if (currentList && currentList.type === "ul") {
        currentList.items.push(ulMatch[1]);
      } else {
        if (currentList) blocks.push({ type: currentList.type, items: currentList.items });
        currentList = { type: "ul", items: [ulMatch[1]] };
      }
      continue;
    }

    // Numbered list item
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (currentList && currentList.type === "ol") {
        currentList.items.push(olMatch[1]);
      } else {
        if (currentList) blocks.push({ type: currentList.type, items: currentList.items });
        currentList = { type: "ol", items: [olMatch[1]] };
      }
      continue;
    }

    // If we were inside a list and hit normal text, flush the list
    if (currentList) {
      blocks.push({ type: currentList.type, items: currentList.items });
      currentList = null;
    }

    // Heading
    if (line.startsWith("### ") || line.startsWith("## ")) {
      blocks.push({ type: "h3", content: line.replace(/^#{2,3}\s+/, "") });
      continue;
    }

    // Normal paragraph
    blocks.push({ type: "p", content: line });
  }

  if (currentList) {
    blocks.push({ type: currentList.type, items: currentList.items });
  }

  return blocks;
}
