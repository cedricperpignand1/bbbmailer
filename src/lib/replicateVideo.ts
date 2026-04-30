// src/lib/replicateVideo.ts
// Replicate API client for AI video generation (Thursday Instagram Reels).
//
// MODEL TIERS (set REPLICATE_VIDEO_MODEL in env to switch):
//   "svd"     → stability-ai/stable-video-diffusion  ~$0.01-0.02/video  ← DEFAULT (cheapest)
//   "wan"     → wan-ai/wan2.1-i2v-480p               ~$0.05-0.10/video  (mid-range, supports motion prompt)
//   "minimax" → minimax/video-01-live                 ~$0.50-1.00/video  (premium quality)
//
// All three are image-to-video models — they animate the branded first-frame image.

const REPLICATE_API = 'https://api.replicate.com/v1';

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

type VideoModel = 'svd' | 'wan' | 'minimax';

function resolveModel(): VideoModel {
  const v = (process.env.REPLICATE_VIDEO_MODEL ?? 'svd').toLowerCase();
  if (v === 'minimax') return 'minimax';
  if (v === 'wan') return 'wan';
  return 'svd';
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

  return pollPrediction(prediction.id, token, model);
}

// ─────────────────────────────────────────────────────────────────────────────

function buildRequest(
  model: VideoModel,
  motionPrompt: string,
  imageUrl: string
): { modelPath: string; input: Record<string, unknown> } {
  if (model === 'svd') {
    return {
      modelPath: 'stability-ai/stable-video-diffusion',
      input: {
        input_image: imageUrl,
        sizing_strategy: 'maintain_aspect_ratio',
        frames_per_second: 6,
        video_length: '25_frames_with_svd_xt',
        motion_bucket_id: 180,   // 0-255 — higher = more dynamic motion
        cond_aug: 0.02,
      },
    };
  }

  if (model === 'wan') {
    return {
      modelPath: 'wan-ai/wan2.1-i2v-480p',
      input: {
        image: imageUrl,
        prompt: motionPrompt,
        num_frames: 81,
        sample_steps: 30,
        fast_mode: 'Enabled',
      },
    };
  }

  // minimax (premium)
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

async function pollPrediction(
  id: string,
  token: string,
  model: VideoModel,
  maxWaitMs = 240_000
): Promise<string> {
  const start = Date.now();
  const interval = model === 'svd' ? 4000 : 6000; // SVD is faster
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, interval));
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
