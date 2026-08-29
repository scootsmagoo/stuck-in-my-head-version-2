import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'paused';

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

interface UseRecorderOptions {
  maxSeconds: number;
  onComplete: (blob: Blob) => void;
}

export function useRecorder({ maxSeconds, onComplete }: UseRecorderOptions) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const secondsRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= maxSeconds) {
        stop();
      }
    }, 1000);
  }, [maxSeconds, stop]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      secondsRef.current = 0;
      setSeconds(0);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearTimer();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState('idle');
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        onComplete(blob);
      };

      recorder.start();
      setState('recording');
      startTimer();
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow mic access in your browser and try again.'
          : 'Could not start recording. Check that your device has a working microphone.',
      );
      setState('idle');
    }
  }, [onComplete, startTimer]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.pause();
      clearTimer();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'paused') {
      recorder.resume();
      setState('recording');
      startTimer();
    }
  }, [startTimer]);

  useEffect(
    () => () => {
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { state, seconds, error, start, pause, resume, stop };
}
