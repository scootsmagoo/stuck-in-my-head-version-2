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

type Phase = 'capture' | 'processing' | 'results' | 'no-match' | 'error';

function formatTime(s: number): string {
  return `0:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('capture');
  const [matches, setMatches] = useState<SongMatch[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleRecordingComplete = useCallback(async (blob: Blob, transcript: string) => {
    setPhase('processing');
    try {
      const wav = await blobToWav(blob);
      // Recognition runs entirely in the browser so the app can be served as
      // static files; AudD and iTunes both allow cross-origin requests.
      const { matches } = await recognize(wav, transcript, { apiToken: AUDD_API_TOKEN });

      if (matches.length === 0) {
        setPhase('no-match');
        return;
      }
      setMatches(matches);
      setPhase('results');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  }, []);

  const recorder = useRecorder({ maxSeconds: MAX_SECONDS, onComplete: handleRecordingComplete });

  const reset = () => {
    setMatches([]);
    setErrorMessage('');
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
            <p>
              Try singing the chorus (words help), keep a steady rhythm, and record at
              least 10 seconds. Humming a guitar riff usually won't match — the vocal
              melody will.
            </p>
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
