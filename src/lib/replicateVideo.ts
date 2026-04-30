// src/lib/replicateVideo.ts
// Replicate API client for AI video generation (Thursday Instagram Reels).
// Uses minimax/video-01-live — high-quality 6-second vertical video.

const REPLICATE_API = 'https://api.replicate.com/v1';

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

export async function generateReplicateVideo(prompt: string): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set in env');

  const res = await fetch(`${REPLICATE_API}/models/minimax/video-01-live/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt,
        prompt_optimizer: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate create prediction failed (${res.status}): ${err}`);
  }

  const prediction = await res.json() as Prediction;

  // Prefer header makes Replicate wait up to 60s inline — if still pending, poll
  if (prediction.status === 'succeeded') {
    return extractOutput(prediction);
  }

  return pollPrediction(prediction.id, token);
}

async function pollPrediction(id: string, token: string, maxWaitMs = 240_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 6000));
    const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as Prediction;
    if (data.status === 'succeeded') return extractOutput(data);
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate prediction ${data.status}: ${data.error ?? 'unknown'}`);
    }
  }
  throw new Error('Replicate video generation timed out after 4 minutes');
}

function extractOutput(p: Prediction): string {
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!out) throw new Error('Replicate returned empty output');
  return out;
}
