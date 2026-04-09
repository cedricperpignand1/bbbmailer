import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');

// ─────────────────────────────────────────────────────────────────────────────
// Fetch DALL-E image, stamp the BBB logo in the bottom-right corner,
// and return a base64 data URL. Text is handled by DALL-E itself.
// ─────────────────────────────────────────────────────────────────────────────
export async function stampAndSaveImage(dalleUrl: string): Promise<string> {
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  const composites: sharp.OverlayOptions[] = [];

  if (fs.existsSync(LOGO_PATH)) {
    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth  = metadata.width  ?? 1024;
    const imgHeight = metadata.height ?? 1024;

    const logoW = Math.round(imgWidth * 0.23);
    const logoBuffer = await sharp(LOGO_PATH)
      .resize(logoW, null, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const logoH = (await sharp(logoBuffer).metadata()).height ?? 60;
    const margin = Math.round(imgWidth * 0.03);

    composites.push({
      input: logoBuffer,
      left: imgWidth - logoW - margin,
      top:  imgHeight - logoH - margin,
      blend: 'over',
    });
  }

  const outputBuffer = composites.length > 0
    ? await sharp(imageBuffer).composite(composites).jpeg({ quality: 93 }).toBuffer()
    : await sharp(imageBuffer).jpeg({ quality: 93 }).toBuffer();

  return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
}
