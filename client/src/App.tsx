import { useCallback, useState } from 'react';
import { blobToWav } from './audio/wav';
import { MicIcon, PauseIcon, PlayIcon, StopIcon } from './components/Icons';
import { Results } from './components/Results';
import { useRecorder } from './hooks/useRecorder';
import type { RecognizeResponse, SongMatch } from './types';

const MAX_SECONDS = 20;
const MIN_SECONDS = 8;

type Phase = 'capture' | 'processing' | 'results' | 'no-match' | 'error';

function formatTime(s: number): string {
  return `0:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('capture');
  const [matches, setMatches] = useState<SongMatch[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    setPhase('processing');
    try {
      const wav = await blobToWav(blob);
      const form = new FormData();
      form.append('audio', wav, 'recording.wav');
      const res = await fetch('/api/recognize', { method: 'POST', body: form });
      const data = (await res.json()) as RecognizeResponse;

      if (!res.ok) {
        throw new Error(data.error || `Request failed (HTTP ${res.status})`);
      }
      if (!data.matches || data.matches.length === 0) {
        setPhase('no-match');
        return;
      }
      setMatches(data.matches);
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
                  Tap the mic and hum the melody — the chorus works best.
                  <br />
                  Off-key is fine. Wrong lyrics are fine. Give it 10+ seconds.
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
            <p>Searching for your melody…</p>
          </section>
        )}

        {phase === 'results' && <Results matches={matches} onReset={reset} />}

        {phase === 'no-match' && (
          <section className="message-screen">
            <h2>No match found</h2>
            <p>
              That melody didn't ring a bell. Try humming the chorus, keep a steady
              rhythm, and record at least 10 seconds. Popular songs match best.
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
        Melody recognition by <a href="https://audd.io/" target="_blank" rel="noreferrer">AudD</a>
        {' · '}Artwork via iTunes Search
      </footer>
    </div>
  );
}
