import type { KnowledgeBaseEntry } from "./types";

const MAX_RAW_TEXT_CHARS_PER_DOC = 15000;

/** Serializes matched knowledge-base entries into one prompt-ready context block. */
export function buildSourceContext(entries: KnowledgeBaseEntry[]): string {
  return entries
    .map((entry, i) => {
      const rawText =
        entry.rawText.length > MAX_RAW_TEXT_CHARS_PER_DOC
          ? entry.rawText.slice(0, MAX_RAW_TEXT_CHARS_PER_DOC) + "\n...[truncated]"
          : entry.rawText;

      return `### Source document ${i + 1} (documentId: ${entry.documentId})
Analysis:
${JSON.stringify(entry.analysis, null, 2)}

Raw text:
${rawText}`;
    })
    .join("\n\n");
}
