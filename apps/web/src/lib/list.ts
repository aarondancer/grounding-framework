import { z } from "zod";

/**
 * Shared search-param shape for paginated browse pages. All fields optional —
 * detail routes inherit list `validateSearch` via the parent path chain, so a
 * required key here would make `search` mandatory on every `<Link>`.
 */
const browseSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  after: z.string().optional(),
  concept: z.string().optional(),
  domain: z.string().optional(),
});

export type BrowseSearch = z.infer<typeof browseSearchSchema>;

/** TanStack Router `validateSearch` — zod parse with lenient fallback. */
export function browseSearch(s: Record<string, unknown>): BrowseSearch {
  const parsed = browseSearchSchema.safeParse(s);
  return parsed.success ? parsed.data : {};
}
