import type { SongMatch } from '../types';
import { MusicNoteIcon } from './Icons';

function Artwork({ url, title, large }: { url: string | null; title: string; large?: boolean }) {
  const className = large ? 'artwork artwork-large' : 'artwork artwork-small';
  if (!url) {
    return (
      <div className={`${className} artwork-placeholder`}>
        <MusicNoteIcon size={large ? 64 : 24} />
      </div>
    );
  }
  return <img className={className} src={url} alt={`Album cover for ${title}`} />;
}

function TopMatch({ match }: { match: SongMatch }) {
  return (
    <div className="top-match">
      <Artwork url={match.artworkUrl} title={match.title} large />
      <div className="top-match-info">
        <h2 className="song-title">{match.title}</h2>
        <p className="song-artist">{match.artist}</p>
        {match.album && <p className="song-album">{match.album}</p>}
        <div className="confidence">
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{ width: `${Math.min(match.score, 100)}%` }}
            />
          </div>
          <span className="confidence-label">{match.score}% match</span>
        </div>
        {match.previewUrl && (
          <audio className="preview-player" controls src={match.previewUrl} preload="none" />
        )}
        {match.storeUrl && (
          <a className="store-link" href={match.storeUrl} target="_blank" rel="noreferrer">
            View on Apple Music
          </a>
        )}
      </div>
    </div>
  );
}

export function Results({ matches, onReset }: { matches: SongMatch[]; onReset: () => void }) {
  const [best, ...rest] = matches;

  return (
    <div className="results">
      <TopMatch match={best} />

      {rest.length > 0 && (
        <div className="alternatives">
          <h3 className="alternatives-heading">Not it? Other possibilities</h3>
          <ol className="alternatives-list">
            {rest.map((m) => (
              <li key={`${m.artist}-${m.title}`} className="alternative">
                <Artwork url={m.artworkUrl} title={m.title} />
                <div className="alternative-info">
                  <span className="alternative-title">{m.title}</span>
                  <span className="alternative-artist">{m.artist}</span>
                </div>
                <span className="alternative-score">{m.score}%</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button className="button-secondary" onClick={onReset}>
        Try again
      </button>
    </div>
  );
}
