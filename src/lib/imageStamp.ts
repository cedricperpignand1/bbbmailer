import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');

// ─────────────────────────────────────────────────────────────────────────────
// Download DALL-E image, composite the BBB logo in the bottom-right corner,
// and return the result as a base64 data URL.
//
// Works locally and on Vercel (no filesystem writes needed).
// If no logo file is found at public/bbb-logo.png, returns the image as-is.
// ─────────────────────────────────────────────────────────────────────────────
export async function stampAndSaveImage(dalleUrl: string): Promise<string> {
  // Fetch the DALL-E image
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  const hasLogo = fs.existsSync(LOGO_PATH);

  let outputBuffer: Buffer;

  if (hasLogo) {
    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width ?? 1024;
    const imgHeight = metadata.height ?? 1024;

    // Resize logo to ~17% of image width
    const logoTargetWidth = Math.round(imgWidth * 0.17);
    const logoBuffer = await sharp(LOGO_PATH)
      .resize(logoTargetWidth, null, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    const logoHeight = logoMeta.height ?? 60;

    // Bottom-right corner with padding
    const margin = Math.round(imgWidth * 0.025);
    const left = imgWidth - logoTargetWidth - margin;
    const top = imgHeight - logoHeight - margin;

    outputBuffer = await sharp(imageBuffer)
      .composite([{ input: logoBuffer, left, top, blend: 'over' }])
      .jpeg({ quality: 93 })
      .toBuffer();
  } else {
    outputBuffer = await sharp(imageBuffer).jpeg({ quality: 93 }).toBuffer();
  }

  // Return as base64 data URL — no filesystem writes, works everywhere
  const base64 = outputBuffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}
