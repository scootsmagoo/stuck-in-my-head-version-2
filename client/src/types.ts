/**
 * The UI renders exactly what the recognition pipeline produces. These were
 * duplicated while the two halves talked over HTTP; now that the pipeline runs
 * in the browser, re-export the shared definitions so they cannot drift.
 */
export type { MatchSource, RankedMatch as SongMatch } from '../../shared/types';
