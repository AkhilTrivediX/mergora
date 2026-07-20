export interface SiteSearchEntry {
  readonly availability: string;
  readonly group: string;
  readonly id: string;
  readonly route: string;
  readonly summary: string;
  readonly terms: readonly string[];
  readonly title: string;
  readonly visibleStatus?: string;
}

export interface RankedSiteSearchEntry {
  readonly entry: SiteSearchEntry;
  readonly score: number;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function matchScore(entry: SiteSearchEntry, query: string): number | null {
  const normalized = normalizeSearchText(query);
  if (normalized === "") return 0;
  const id = normalizeSearchText(entry.id);
  const title = normalizeSearchText(entry.title);
  const terms = entry.terms.map(normalizeSearchText);
  const group = normalizeSearchText(entry.group);
  const summary = normalizeSearchText(entry.summary);
  const tokens = normalized.split(" ").filter(Boolean);
  const primary = `${id} ${title}`;
  const curated = `${terms.join(" ")} ${group}`;
  const complete = `${primary} ${curated} ${summary}`;
  if (!tokens.every((token) => complete.includes(token))) return null;
  if (id === normalized) return 1_000;
  if (title === normalized) return 975;
  if (id.startsWith(normalized)) return 925;
  if (title.startsWith(normalized)) return 900;
  if (terms.includes(normalized)) return 850;
  if (terms.some((term) => term.startsWith(normalized))) return 825;
  if (primary.includes(normalized)) return 750;
  if (curated.includes(normalized)) return 650;
  if (tokens.every((token) => primary.includes(token) || curated.includes(token))) return 600;
  return 400;
}

export function rankSiteSearch(
  entries: readonly SiteSearchEntry[],
  query: string,
  maximum = 12,
): readonly RankedSiteSearchEntry[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 100) {
    throw new RangeError("Mergora site search maximum must be an integer from 1 to 100.");
  }
  return entries
    .map((entry) => {
      const score = matchScore(entry, query);
      if (score === null) return null;
      const currentSourceTieBreak = entry.availability === "source-present-unreleased" ? 1 : 0;
      return { entry, score: score + currentSourceTieBreak };
    })
    .filter((result): result is RankedSiteSearchEntry => result !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.title.localeCompare(right.entry.title, "en-US") ||
        left.entry.id.localeCompare(right.entry.id, "en-US"),
    )
    .slice(0, maximum);
}
