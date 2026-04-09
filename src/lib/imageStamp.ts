import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');

// ─────────────────────────────────────────────────────────────────────────────
// Escape XML special chars so SVG text doesn't break
// ─────────────────────────────────────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrap headline into lines that fit within the image at the given font size
// ─────────────────────────────────────────────────────────────────────────────
function wrapText(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the SVG overlay: dark gradient band + blue accent line + headline text
// + buildersbidbook.com label at the bottom
// ─────────────────────────────────────────────────────────────────────────────
function buildTextOverlay(
  headline: string,
  imgWidth: number,
  imgHeight: number
): Buffer {
  const safeHeadline = escapeXml(headline.toUpperCase());
  const charLen = safeHeadline.length;

  // Font size scales down for longer headlines
  const fontSize = charLen <= 18 ? 92 : charLen <= 28 ? 76 : charLen <= 40 ? 62 : 52;
  const maxCharsPerLine = Math.floor((imgWidth - 96) / (fontSize * 0.56));
  const lines = wrapText(safeHeadline, maxCharsPerLine);

  const lineHeight = Math.round(fontSize * 1.2);
  const textBlockHeight = lines.length * lineHeight;

  // Gradient band covers bottom ~42% of the image
  const bandY = Math.round(imgHeight * 0.52);
  const bandH = imgHeight - bandY;

  // First line of text sits ~70px from the bottom (leaves room for URL label)
  const firstLineY = imgHeight - 70 - textBlockHeight;
  const accentBarY = firstLineY - 20;

  // Each text line: render a dark shadow copy offset by 3px, then white on top
  // This is the librsvg-safe way to get readable text over any background.
  const shadowElements = lines
    .map((line, i) => {
      const y = firstLineY + i * lineHeight;
      return `<text x="51" y="${y + 3}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="black" fill-opacity="0.55">${line}</text>`;
    })
    .join('\n');

  const textElements = lines
    .map((line, i) => {
      const y = firstLineY + i * lineHeight;
      return `<text x="48" y="${y}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="white">${line}</text>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="40%"  stop-color="#000000" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.9"/>
    </linearGradient>
  </defs>

  <rect x="0" y="${bandY}" width="${imgWidth}" height="${bandH}" fill="url(#g)"/>

  <rect x="48" y="${accentBarY}" width="60" height="7" rx="3" fill="#1055FF"/>

  ${shadowElements}
  ${textElements}

  <text x="48" y="${imgHeight - 26}" font-family="Arial" font-size="20" font-weight="bold" fill="white" fill-opacity="0.55">BUILDERSBIDBOOK.COM</text>
</svg>`;

  return Buffer.from(svg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export:
// 1. Fetch DALL-E image
// 2. Composite headline text overlay
// 3. Composite BBB logo (if public/bbb-logo.png exists)
// 4. Return base64 data URL — no filesystem writes needed
// ─────────────────────────────────────────────────────────────────────────────
export async function stampAndSaveImage(
  dalleUrl: string,
  headline: string
): Promise<string> {
  // Fetch DALL-E image
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width ?? 1024;
  const imgHeight = metadata.height ?? 1024;

  const composites: sharp.OverlayOptions[] = [];

  // ── 1. Text overlay ────────────────────────────────────────────────────────
  if (headline.trim()) {
    const textSvg = buildTextOverlay(headline, imgWidth, imgHeight);
    composites.push({ input: textSvg, top: 0, left: 0 });
  }

  // ── 2. Logo (bottom-right corner) ─────────────────────────────────────────
  const hasLogo = fs.existsSync(LOGO_PATH);
  if (hasLogo) {
    const logoTargetWidth = Math.round(imgWidth * 0.23);
    const logoBuffer = await sharp(LOGO_PATH)
      .resize(logoTargetWidth, null, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    const logoHeight = logoMeta.height ?? 60;
    const margin = Math.round(imgWidth * 0.03);

    composites.push({
      input: logoBuffer,
      left: imgWidth - logoTargetWidth - margin,
      top: imgHeight - logoHeight - margin,
      blend: 'over',
    });
  }

  // ── 3. Composite all layers and return base64 ─────────────────────────────
  const outputBuffer = await sharp(imageBuffer)
    .composite(composites)
    .jpeg({ quality: 93 })
    .toBuffer();

  return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
}
