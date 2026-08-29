/** Shared string helpers for matching titles/artists across providers. */

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(feat|ft|featuring)\b.*$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for']);

/** Dice coefficient on word sets, 0–1. */
export function similarity(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) {
    const na = normalizeKey(a);
    const nb = normalizeKey(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.8;
    return 0;
  }
  let overlap = 0;
  for (const w of A) if (B.has(w)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

const COVERISH =
  /\b(karaoke|tribute|originally|made famous|backing|instrumental|lullaby|kidz bop|8-?bit|cover version|as made famous|mashup|liner notes)\b/i;

export function looksLikeCover(artist: string, album?: string | null): boolean {
  return COVERISH.test(artist) || COVERISH.test(album ?? '');
}

/** Wordless humming / filler that shouldn't go to a lyrics search. */
export function isUsefulTranscript(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length < 3) return false;
  const fillers = new Set(['la', 'na', 'da', 'doo', 'do', 'oh', 'ah', 'mm', 'mmm', 'uh', 'um', 'hmm', 'yeah', 'hey', 'woah', 'whoa']);
  const content = words.filter((w) => !fillers.has(w));
  return content.length >= 3;
}

/** Keep lyrics hits that actually contain distinctive sung words. */
export function lyricsMentionQuery(query: string, title: string, lyrics?: string): boolean {
  const distinctive = tokenize(query).filter((w) => w.length >= 4);
  if (distinctive.length < 2) return similarity(query, title) >= 0.5;
  const hay = `${title} ${lyrics ?? ''}`.toLowerCase();
  const hits = distinctive.filter((w) => hay.includes(w)).length;
  return hits / distinctive.length >= 0.5;
}
