export class QuietRecordingError extends Error {
  constructor() {
    super(
      "We couldn't hear anything at all — check that the right microphone is " +
        'selected and unmuted, then try again.',
    );
    this.name = 'QuietRecordingError';
  }
}

/**
 * Recognition only needs the vocal melody, so downsample hard: 16 kHz mono is
 * ample for both humming engines and keeps a clip small enough for any host.
 */
const TARGET_SAMPLE_RATE = 16000;

/** Loudness is measured over short windows, not the whole take. */
const WINDOW_SECONDS = 0.25;

/**
 * Roughly -50 dBFS in the *loudest* window. This is deliberately permissive:
 * it exists only to catch a muted or wrong-device microphone, not to judge how
 * loudly someone hums. Averaging over a whole recording instead would punish
 * anyone who leaves silence at either end.
 */
const SILENCE_FLOOR = 0.003;

/** Keep audio above this share of the loudest window when trimming the ends. */
const TRIM_RATIO = 0.2;

/** Padding kept either side of the trimmed region, so notes aren't clipped. */
const TRIM_PADDING_SECONDS = 0.2;

/** Decode any MediaRecorder blob and re-encode as 16-bit 16 kHz mono WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const audio = await resampleToMono(decoded, TARGET_SAMPLE_RATE);
    const samples = audio.getChannelData(0);

    const windows = windowLoudness(samples, TARGET_SAMPLE_RATE);
    if (peak(windows) < SILENCE_FLOOR) {
      throw new QuietRecordingError();
    }

    return encodeWav(trimSilence(samples, windows, TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
  } finally {
    await ctx.close();
  }
}

/**
 * Rendering through a single-channel OfflineAudioContext both downmixes to
 * mono and resamples with proper anti-aliasing.
 */
async function resampleToMono(audio: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(audio.duration * sampleRate));
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = audio;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

/** RMS per fixed-size window, so quiet stretches can't dilute loud ones. */
function windowLoudness(samples: Float32Array, sampleRate: number): Float32Array {
  const size = Math.max(1, Math.floor(WINDOW_SECONDS * sampleRate));
  const count = Math.max(1, Math.ceil(samples.length / size));
  const out = new Float32Array(count);
  for (let w = 0; w < count; w++) {
    const start = w * size;
    const end = Math.min(samples.length, start + size);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    out[w] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return out;
}

function peak(windows: Float32Array): number {
  let max = 0;
  for (let i = 0; i < windows.length; i++) if (windows[i] > max) max = windows[i];
  return max;
}

/**
 * Drop the dead air at either end. Recognition services want a short clip of
 * actual sound; leading silence while someone works out how the tune goes is
 * wasted length. The threshold is relative to the recording's own peak so a
 * noisy room raises the bar rather than defeating it.
 */
function trimSilence(
  samples: Float32Array,
  windows: Float32Array,
  sampleRate: number,
): Float32Array {
  const threshold = Math.max(SILENCE_FLOOR, peak(windows) * TRIM_RATIO);

  let first = 0;
  while (first < windows.length && windows[first] < threshold) first++;
  let last = windows.length - 1;
  while (last > first && windows[last] < threshold) last--;
  if (first >= windows.length) return samples;

  const size = Math.floor(WINDOW_SECONDS * sampleRate);
  const pad = Math.floor(TRIM_PADDING_SECONDS * sampleRate);
  const start = Math.max(0, first * size - pad);
  const end = Math.min(samples.length, (last + 1) * size + pad);
  return samples.subarray(start, end);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}
