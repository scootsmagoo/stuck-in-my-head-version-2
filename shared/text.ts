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
  const content = words.filter((w) => !FILLERS.has(w));
  // Two real words is worth a search. Speech recognition drops a lot of what
  // gets sung, so demanding more mostly discards usable queries.
  return content.length >= 2;
}

const FILLERS = new Set([
  'la', 'na', 'da', 'doo', 'do', 'oh', 'ooh', 'ohh', 'ah', 'aah', 'mm', 'mmm',
  'uh', 'um', 'hmm', 'yeah', 'hey', 'woah', 'whoa', 'dum', 'dee', 'ba', 'bah',
]);

/** Query words long enough to carry meaning, deduped. */
function distinctiveWords(query: string): string[] {
  return [...new Set(tokenize(query).filter((w) => w.length >= 4))];
}

/**
 * Levenshtein distance, abandoned as soon as it exceeds `max` so this stays
 * cheap across a full lyric sheet.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Credit given for a near-miss word, relative to an exact hit. */
const NEAR_MISS_CREDIT = 0.6;

/**
 * Words so common in lyrics that finding them proves almost nothing. Without
 * this, "is this the real life" scores highly against any song in the index,
 * because every song contains "this", "real" and "life" somewhere.
 */
const COMMON = new Set([
  'this', 'that', 'these', 'those', 'what', 'when', 'where', 'which', 'with',
  'your', 'youre', 'yours', 'dont', 'cant', 'wont', 'didnt', 'know', 'knows',
  'like', 'just', 'only', 'never', 'always', 'every', 'been', 'being', 'were',
  'they', 'them', 'then', 'than', 'there', 'here', 'have', 'will', 'would',
  'could', 'should', 'make', 'take', 'give', 'come', 'going', 'gonna', 'wanna',
  'want', 'need', 'feel', 'said', 'says', 'look', 'back', 'down', 'over',
  'away', 'more', 'some', 'into', 'from', 'about', 'again', 'still', 'right',
  'thing', 'things', 'cause', 'because', 'yeah', 'well', 'very', 'much',
  'time', 'life', 'real', 'love', 'baby', 'girl', 'night', 'away', 'good',
]);

/** How much a common word counts relative to a distinctive one. */
const COMMON_WEIGHT = 0.25;

function weightOf(word: string): number {
  return COMMON.has(word) ? COMMON_WEIGHT : 1;
}

function tolerance(length: number): number {
  return length <= 5 ? 1 : 2;
}

/**
 * How much of what was sung actually turns up in a song's lyrics, 0–1.
 *
 * Matching is deliberately fuzzy. Speech recognition on singing mangles words
 * — vowels stretch across notes, consonants vanish, word boundaries land in
 * the wrong place — so an exact-substring test throws away correct songs. A
 * near miss still counts, just for less than a clean hit.
 */
export function lyricsOverlap(query: string, title: string, lyrics?: string): number {
  const wanted = distinctiveWords(query);
  if (wanted.length === 0) return 0;

  const haystack = new Set(tokenize(`${title} ${lyrics ?? ''}`));
  let found = 0;
  let total = 0;

  for (const word of wanted) {
    const weight = weightOf(word);
    total += weight;

    if (haystack.has(word)) {
      found += weight;
      continue;
    }
    const tol = tolerance(word.length);
    for (const candidate of haystack) {
      if (Math.abs(candidate.length - word.length) > tol) continue;
      if (editDistance(word, candidate, tol) <= tol) {
        found += weight * NEAR_MISS_CREDIT;
        break;
      }
    }
  }

  return total === 0 ? 0 : found / total;
}
