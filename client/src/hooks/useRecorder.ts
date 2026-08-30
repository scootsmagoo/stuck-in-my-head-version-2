import { useCallback, useEffect, useRef, useState } from 'react';
import { startLiveCaptions } from '../audio/captions';

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
  onComplete: (blob: Blob, transcript: string) => void;
}

export function useRecorder({ maxSeconds, onComplete }: UseRecorderOptions) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  /** Smoothed input loudness, 0–1, for the live meter. */
  const [level, setLevel] = useState(0);
  /** False while the loudest sound so far is barely above the noise floor. */
  const [audible, setAudible] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const secondsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const stopCaptionsRef = useRef<(() => void) | null>(null);
  const transcriptRef = useRef('');
  const meterCtxRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const levelRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopCaptions = () => {
    stopCaptionsRef.current?.();
    stopCaptionsRef.current = null;
  };

  const stopMetering = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    meterCtxRef.current?.close().catch(() => {});
    meterCtxRef.current = null;
    levelRef.current = 0;
    setLevel(0);
  };

  /**
   * Drive a live input meter off the same stream MediaRecorder is using. This
   * is the only way a user can tell the microphone is actually picking them up
   * before committing to a take — silent failure is the worst outcome here.
   */
  const startMetering = (stream: MediaStream) => {
    stopMetering();
    const ctx = new AudioContext();
    meterCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);

      // Map to a dB scale so a quiet hum is still visibly moving the meter;
      // a linear bar would leave everything below -30 dBFS looking dead.
      const db = 20 * Math.log10(rms + 1e-9);
      const norm = Math.max(0, Math.min(1, (db + 60) / 60));

      // Fast attack, slow release, so the bar tracks notes but doesn't flicker.
      const prev = levelRef.current;
      const next = norm > prev ? norm : prev * 0.85 + norm * 0.15;
      levelRef.current = next;
      setLevel(next);
      if (norm > 0.18) setAudible(true);

      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
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

  const startCaptions = useCallback(() => {
    stopCaptions();
    stopCaptionsRef.current = startLiveCaptions((text) => {
      transcriptRef.current = text;
      setTranscript(text);
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      secondsRef.current = 0;
      transcriptRef.current = '';
      setSeconds(0);
      setTranscript('');
      setAudible(false);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearTimer();
        stopCaptions();
        stopMetering();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState('idle');
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        onComplete(blob, transcriptRef.current);
      };

      recorder.start();
      setState('recording');
      startTimer();
      startCaptions();
      startMetering(stream);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow mic access in your browser and try again.'
          : 'Could not start recording. Check that your device has a working microphone.',
      );
      setState('idle');
    }
  }, [onComplete, startCaptions, startTimer]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.pause();
      clearTimer();
      stopCaptions();
      stopMetering();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'paused') {
      recorder.resume();
      setState('recording');
      startTimer();
      startCaptions();
      if (streamRef.current) startMetering(streamRef.current);
    }
  }, [startCaptions, startTimer]);

  useEffect(
    () => () => {
      clearTimer();
      stopCaptions();
      stopMetering();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { state, seconds, error, transcript, level, audible, start, pause, resume, stop };
}
