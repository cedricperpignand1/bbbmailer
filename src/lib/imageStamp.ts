import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const IG_AI_DIR = path.join(PUBLIC_DIR, 'ig-ai');
const LOGO_PATH = path.join(PUBLIC_DIR, 'bbb-logo.png');

// Max number of images to keep — oldest are deleted automatically
const MAX_SAVED_IMAGES = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Download DALL-E image, composite the BBB logo in the bottom-right corner,
// save to /public/ig-ai/[timestamp].jpg, and return the stable local path.
//
// If no logo file is found at public/bbb-logo.png, saves the image as-is.
// ─────────────────────────────────────────────────────────────────────────────
export async function stampAndSaveImage(dalleUrl: string): Promise<string> {
  // Ensure output directory exists
  fs.mkdirSync(IG_AI_DIR, { recursive: true });

  // Fetch the DALL-E image (Node.js fetch, no CORS issues)
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  const timestamp = Date.now();
  const filename = `post-${timestamp}.jpg`;
  const outputPath = path.join(IG_AI_DIR, filename);

  const hasLogo = fs.existsSync(LOGO_PATH);

  if (hasLogo) {
    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width ?? 1024;
    const imgHeight = metadata.height ?? 1024;

    // Resize logo to ~17% of image width (matches the size in their real posts)
    const logoTargetWidth = Math.round(imgWidth * 0.17);
    const logoBuffer = await sharp(LOGO_PATH)
      .resize(logoTargetWidth, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    const logoHeight = logoMeta.height ?? 60;

    // Bottom-right corner with padding
    const margin = Math.round(imgWidth * 0.025);
    const left = imgWidth - logoTargetWidth - margin;
    const top = imgHeight - logoHeight - margin;

    await sharp(imageBuffer)
      .composite([{ input: logoBuffer, left, top, blend: 'over' }])
      .jpeg({ quality: 93 })
      .toFile(outputPath);
  } else {
    // No logo — save as-is
    await sharp(imageBuffer)
      .jpeg({ quality: 93 })
      .toFile(outputPath);
  }

  // Prune old images if over the limit
  pruneOldImages();

  return `/ig-ai/${filename}`;
}

function pruneOldImages() {
  try {
    const files = fs
      .readdirSync(IG_AI_DIR)
      .filter((f) => f.startsWith('post-') && f.endsWith('.jpg'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(IG_AI_DIR, f)).mtimeMs }))
      .sort((a, b) => a.time - b.time); // oldest first

    if (files.length > MAX_SAVED_IMAGES) {
      const toDelete = files.slice(0, files.length - MAX_SAVED_IMAGES);
      for (const f of toDelete) {
        fs.unlinkSync(path.join(IG_AI_DIR, f.name));
      }
    }
  } catch {
    // Non-critical — ignore prune errors
  }
}
