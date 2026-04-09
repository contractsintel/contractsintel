// Strip HTML tags + decode entities into readable plain text.
// Preserves paragraph breaks via block-element → newline mapping.
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    // Block-level → newlines so paragraphs survive
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    // Strip everything else
    .replace(/<[^>]+>/g, "")
    // Decode common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // Collapse 3+ blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
