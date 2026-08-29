interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Live captions of whatever the user is singing. Used as a lyrics-search
 * signal — humming/la-la is ignored server-side.
 */
export function startLiveCaptions(onUpdate: (text: string) => void): () => void {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return () => {};

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (ev) => {
    let text = '';
    for (let i = 0; i < ev.results.length; i++) {
      text += ev.results[i][0].transcript + ' ';
    }
    onUpdate(text.trim());
  };
  rec.onerror = () => {};
  try {
    rec.start();
  } catch {
    return () => {};
  }
  return () => {
    try {
      rec.stop();
    } catch {
      rec.abort();
    }
  };
}
