import { useCallback, useState } from 'react';
import { recognize } from '../../shared/recognize';
import { blobToWav } from './audio/wav';
import { MicIcon, PauseIcon, PlayIcon, StopIcon } from './components/Icons';
import { Results } from './components/Results';
import { useRecorder } from './hooks/useRecorder';
import type { SongMatch } from './types';

const MAX_SECONDS = 20;
const MIN_SECONDS = 8;

/**
 * Optional AudD token, inlined at build time from a local .env. The deployed
 * GitHub Pages build leaves it unset and falls back to AudD's anonymous tier,
 * so no key is ever published.
 */
const AUDD_API_TOKEN = import.meta.env.VITE_AUDD_API_TOKEN as string | undefined;

type Phase = 'capture' | 'review' | 'processing' | 'results' | 'no-match' | 'error';

function formatTime(s: number): string {
  return `0:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('capture');
  const [matches, setMatches] = useState<SongMatch[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [melodySearched, setMelodySearched] = useState(false);
  const [pending, setPending] = useState<Blob | null>(null);
  const [words, setWords] = useState('');

  /**
   * Recording stops at a review step rather than searching immediately. The
   * lyrics index is near-exact: "fanta sea" finds nothing where "fantasy"
   * finds Bohemian Rhapsody at the top. The person who just sang it can fix
   * that in a second, and on browsers without speech recognition this is the
   * only way to supply words at all.
   */
  const handleRecordingComplete = useCallback((blob: Blob, transcript: string) => {
    setPending(blob);
    setWords(transcript);
    setPhase('review');
  }, []);

  const runSearch = useCallback(
    async (blob: Blob | null, lyrics: string) => {
      if (!blob) return;
      setPhase('processing');
      try {
        const wav = await blobToWav(blob);
        const result = await recognize(wav, lyrics, { apiToken: AUDD_API_TOKEN });
        setMelodySearched(result.melodySearched);

        if (result.matches.length === 0) {
          setPhase('no-match');
          return;
        }
        setMatches(result.matches);
        setPhase('results');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
        setPhase('error');
      }
    },
    [],
  );

  const recorder = useRecorder({ maxSeconds: MAX_SECONDS, onComplete: handleRecordingComplete });

  const reset = () => {
    setMatches([]);
    setErrorMessage('');
    setPending(null);
    setWords('');
    setPhase('capture');
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">Stuck In My Head</h1>
        <p className="tagline">Hum it, sing it, whistle it — we'll name that tune.</p>
      </header>

      <main className="main">
        {phase === 'capture' && (
          <section className="capture">
            {recorder.state === 'idle' && (
              <>
                <button className="record-button" onClick={recorder.start} aria-label="Start recording">
                  <MicIcon size={44} />
                </button>
                <p className="hint">
                  Tap the mic and sing or hum the <strong>vocal melody</strong> — usually the chorus.
                  <br />
                  Words help a lot if you know any. Guitar riffs usually won't match.
                  <br />
                  Off-key is fine. Give it 10+ seconds.
                </p>
                {recorder.error && <p className="error-text">{recorder.error}</p>}
              </>
            )}

            {recorder.state !== 'idle' && (
              <>
                <div className={`record-visual ${recorder.state === 'recording' ? 'live' : ''}`}>
                  <div className="bars" aria-hidden>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className="bar" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="timer">{formatTime(recorder.seconds)}</span>
                  <span className="record-status">
                    {recorder.state === 'paused' ? 'Paused' : 'Listening…'}
                  </span>

                  <div
                    className="level-meter"
                    role="meter"
                    aria-label="Microphone input level"
                    aria-valuenow={Math.round(recorder.level * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`level-fill ${recorder.level > 0.18 ? 'good' : 'low'}`}
                      style={{ width: `${Math.round(recorder.level * 100)}%` }}
                    />
                  </div>
                  <p className={`level-hint ${recorder.audible ? '' : 'warn'}`}>
                    {recorder.audible
                      ? 'Got you — keep going.'
                      : 'Barely hearing you. Move closer, or mute other noise.'}
                  </p>
                  {recorder.transcript && (
                    <p className="live-captions">“{recorder.transcript}”</p>
                  )}
                </div>

                <div className="controls">
                  {recorder.state === 'recording' ? (
                    <button className="control-button" onClick={recorder.pause} aria-label="Pause">
                      <PauseIcon />
                    </button>
                  ) : (
                    <button className="control-button" onClick={recorder.resume} aria-label="Resume">
                      <PlayIcon />
                    </button>
                  )}
                  <button
                    className="control-button stop"
                    onClick={recorder.stop}
                    disabled={recorder.seconds < MIN_SECONDS}
                    aria-label="Stop and identify"
                  >
                    <StopIcon />
                  </button>
                </div>
                <p className="hint">
                  {recorder.seconds < MIN_SECONDS
                    ? 'Keep going — a few more seconds…'
                    : 'Tap stop when you\u2019re done to identify the song.'}
                </p>
              </>
            )}
          </section>
        )}

        {phase === 'review' && (
          <section className="review">
            <h2>Any words you caught?</h2>
            <p className="hint">
              {words
                ? "This is what we heard — fix anything that looks off. Even one\u00a0correct word beats a whole garbled line."
                : "We didn't pick up any words. Type whatever you remember, however\u00a0rough — a fragment is plenty."}
            </p>
            <textarea
              className="lyrics-input"
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder="e.g. is this the real life, is this just fantasy"
              rows={3}
              autoFocus
            />
            <div className="review-actions">
              <button className="button-primary" onClick={() => runSearch(pending, words)}>
                Search
              </button>
              <button className="button-secondary" onClick={() => runSearch(pending, '')}>
                Skip words
              </button>
            </div>
            <button className="link-button" onClick={reset}>
              Record again
            </button>
          </section>
        )}

        {phase === 'processing' && (
          <section className="processing">
            <div className="spinner" aria-hidden />
            <p>Searching melody and lyrics…</p>
          </section>
        )}

        {phase === 'results' && <Results matches={matches} onReset={reset} />}

        {phase === 'no-match' && (
          <section className="message-screen">
            <h2>No match found</h2>
            {melodySearched ? (
              <p>
                Try again with a steadier rhythm — pitch matters less than timing.
                Singing the chorus with any words you know helps most.
              </p>
            ) : (
              <p>
                Heads up: melody matching isn't switched on, so your tune itself
                wasn't searched — only <strong>words you sang</strong> and whether a
                recording was playing nearby. Singing actual lyrics, however
                garbled, is what works right now.
              </p>
            )}
            <button className="button-secondary" onClick={reset}>
              Try again
            </button>
          </section>
        )}

        {phase === 'error' && (
          <section className="message-screen">
            <h2>Something went wrong</h2>
            <p className="error-text">{errorMessage}</p>
            <button className="button-secondary" onClick={reset}>
              Try again
            </button>
          </section>
        )}
      </main>

      <footer className="footer">
        Melody + lyrics via <a href="https://audd.io/" target="_blank" rel="noreferrer">AudD</a>
        {' · '}Artwork via iTunes Search
      </footer>
    </div>
  );
}
