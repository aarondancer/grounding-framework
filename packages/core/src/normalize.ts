/**
 * Pre-lexical normalization (spec/13 normative):
 *   1. Unicode NFKC
 *   2. CRLF/CR → LF
 *   3. trim leading/trailing Unicode whitespace
 *   4. collapse internal whitespace runs to one ASCII space
 *   5. locale-independent lowercase (String.prototype.toLowerCase)
 *   6. punctuation preserved
 *
 * TypeScript MUST NOT emulate PostgreSQL unaccent; accent folding happens in
 * the database at materialization/query time.
 */
export function normalizeForLexical(text: string): string {
  return text.normalize("NFKC").replace(/\r\n?/g, "\n").trim().replace(/\s+/g, " ").toLowerCase();
}
