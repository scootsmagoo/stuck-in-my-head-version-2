import { createHmac } from 'node:crypto';
import type { RecognitionMatch, RecognitionProvider } from './types.js';

interface AcrHummingHit {
  score?: string | number;
  title?: string;
  artists?: Array<{ name?: string }>;
}

interface AcrIdentifyResponse {
  status?: { code?: number; msg?: string };
  metadata?: {
    humming?: AcrHummingHit[];
    music?: AcrHummingHit[];
  };
}

/**
 * Optional humming engine. Enable by setting ACRCLOUD_HOST, ACRCLOUD_ACCESS_KEY,
 * and ACRCLOUD_ACCESS_SECRET from a humming-enabled project in the ACRCloud console.
 */
export class AcrCloudProvider implements RecognitionProvider {
  readonly name = 'acrcloud';

  constructor(
    private readonly host: string,
    private readonly accessKey: string,
    private readonly accessSecret: string,
  ) {}

  async recognizeHumming(audio: Buffer, mimeType: string): Promise<RecognitionMatch[]> {
    const host = this.host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const dataType = 'audio';
    const signatureVersion = '1';
    const stringToSign = `POST\n/v1/identify\n${this.accessKey}\n${dataType}\n${signatureVersion}\n${timestamp}`;
    const signature = createHmac('sha1', this.accessSecret).update(stringToSign).digest('base64');

    const form = new FormData();
    form.append('sample', new Blob([new Uint8Array(audio)], { type: mimeType }), 'recording.wav');
    form.append('sample_bytes', String(audio.length));
    form.append('access_key', this.accessKey);
    form.append('data_type', dataType);
    form.append('signature_version', signatureVersion);
    form.append('signature', signature);
    form.append('timestamp', timestamp);

    const res = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`ACRCloud request failed with HTTP ${res.status}`);

    const data = (await res.json()) as AcrIdentifyResponse;
    if (data.status?.code && data.status.code !== 0 && data.status.code !== 1001) {
      throw new Error(`ACRCloud error ${data.status.code}: ${data.status.msg ?? 'unknown'}`);
    }

    const hits = data.metadata?.humming ?? data.metadata?.music ?? [];
    return hits
      .map((h) => {
        const artist = h.artists?.[0]?.name ?? '';
        const title = h.title ?? '';
        const raw = typeof h.score === 'string' ? Number(h.score) : (h.score ?? 0);
        const score = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
        return { score, artist, title };
      })
      .filter((m) => m.artist && m.title)
      .sort((a, b) => b.score - a.score);
  }
}
