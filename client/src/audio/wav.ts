export class QuietRecordingError extends Error {
  constructor() {
    super('That recording was too quiet to pick up a melody. Hum a bit louder and closer to the mic.');
    this.name = 'QuietRecordingError';
  }
}

/**
 * Recognition only needs the vocal melody, so downsample hard: 16 kHz mono is
 * ample for both humming engines and keeps a 20-second clip around 640 KB,
 * comfortably under serverless request-body limits.
 */
const TARGET_SAMPLE_RATE = 16000;

/** Decode any MediaRecorder blob and re-encode as 16-bit 16 kHz mono WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const audio = await resampleToMono(decoded, TARGET_SAMPLE_RATE);
    const samples = audio.getChannelData(0);
    if (rms(samples) < 0.008) {
      throw new QuietRecordingError();
    }
    return encodeWav(samples, audio.sampleRate);
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

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
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
