// src/lib/replicateVideo.ts
// Replicate API client for AI video generation (Thursday Instagram Reels).
//
// Set REPLICATE_VIDEO_MODEL in Vercel env to pick a tier:
//
//   "wan"     → wavespeedai/wan-2.1-i2v-480p   ~$0.04-0.08/video  ← DEFAULT (cheapest working)
//   "minimax" → minimax/video-01-live            ~$0.50-1.00/video  (premium quality)
//
// Both are image-to-video: they animate the branded first-frame image.

const REPLICATE_API = 'https://api.replicate.com/v1';

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

type VideoModel = 'wan' | 'minimax';

function resolveModel(): VideoModel {
  const v = (process.env.REPLICATE_VIDEO_MODEL ?? 'wan').toLowerCase();
  if (v === 'minimax') return 'minimax';
  return 'wan';
}

export async function generateReplicateVideo(
  motionPrompt: string,
  firstFrameImageUrl: string
): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set in env');

  const model = resolveModel();
  const { modelPath, input } = buildRequest(model, motionPrompt, firstFrameImageUrl);

  const res = await fetch(`${REPLICATE_API}/models/${modelPath}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate (${model}) create prediction failed (${res.status}): ${err}`);
  }

  const prediction = await res.json() as Prediction;
  if (prediction.status === 'succeeded') return extractOutput(prediction);

  return pollPrediction(prediction.id, token);
}

// ─────────────────────────────────────────────────────────────────────────────

function buildRequest(
  model: VideoModel,
  motionPrompt: string,
  imageUrl: string
): { modelPath: string; input: Record<string, unknown> } {
  if (model === 'wan') {
    return {
      modelPath: 'wavespeedai/wan-2.1-i2v-480p',
      input: {
        image: imageUrl,
        prompt: motionPrompt,
        num_frames: 81,
        sample_steps: 20,
        frames_per_second: 16,
        fast_mode: 'Enabled',
      },
    };
  }

  // minimax (premium, confirmed working)
  return {
    modelPath: 'minimax/video-01-live',
    input: {
      prompt: motionPrompt,
      first_frame_image: imageUrl,
      prompt_optimizer: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function pollPrediction(id: string, token: string, maxWaitMs = 240_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 5000));
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
