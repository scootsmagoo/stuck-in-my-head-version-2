export class QuietRecordingError extends Error {
  constructor() {
    super('That recording was too quiet to pick up a melody. Hum a bit louder and closer to the mic.');
    this.name = 'QuietRecordingError';
  }
}

/** Decode any MediaRecorder blob and re-encode as 16-bit mono WAV. */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const samples = mixToMono(audio);
    if (rms(samples) < 0.008) {
      throw new QuietRecordingError();
    }
    return encodeWav(samples, audio.sampleRate);
  } finally {
    await ctx.close();
  }
}

function mixToMono(audio: AudioBuffer): Float32Array {
  const channels = audio.numberOfChannels;
  const length = audio.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
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
