import sharp from 'sharp';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');
const CUSTOM_FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'inter-bold.ttf');

// ─────────────────────────────────────────────────────────────────────────────
// Load fonts once at startup.
// If the user drops public/fonts/inter-bold.ttf it will be used for crisp text.
// Otherwise falls back to system fonts (works on Windows/Mac, and on Linux/
// Vercel Skia has a built-in Latin fallback so basic text still renders).
// ─────────────────────────────────────────────────────────────────────────────
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  if (fs.existsSync(CUSTOM_FONT_PATH)) {
    GlobalFonts.registerFromPath(CUSTOM_FONT_PATH, 'BBBFont');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { (GlobalFonts as any).loadSystemFonts(); } catch { /* unavailable on some envs */ }
  fontsReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strip non-printable / non-ASCII chars that would render as boxes.
// GPT-4o often outputs smart quotes, em-dashes, etc.
// ─────────────────────────────────────────────────────────────────────────────
function sanitize(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
    .replace(/[\u2014\u2013]/g, '-')   // em / en dash
    .replace(/\u2026/g, '...')         // ellipsis
    .replace(/[^\x20-\x7E]/g, '');    // strip everything else outside printable ASCII
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-wrap text to fit within maxWidth px given the current canvas context.
// ─────────────────────────────────────────────────────────────────────────────
function wrapLines(
  ctx: { measureText(t: string): { width: number } },
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
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
// Draw the text overlay onto a transparent canvas and return as PNG buffer.
// Layout: dark gradient band → blue accent bar → bold headline → URL label
// ─────────────────────────────────────────────────────────────────────────────
function buildTextOverlay(headline: string, imgWidth: number, imgHeight: number): Buffer {
  ensureFonts();

  const text = sanitize(headline);
  const fontFamily = fs.existsSync(CUSTOM_FONT_PATH)
    ? '"BBBFont", sans-serif'
    : 'sans-serif';
  const maxTextWidth = imgWidth - 96;

  const canvas = createCanvas(imgWidth, imgHeight);
  const ctx = canvas.getContext('2d');

  // ── Auto-size font so the headline always fits ──────────────────────────
  let fontSize = 88;
  let lines: string[] = [];
  while (fontSize >= 42) {
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    lines = wrapLines(ctx, text, maxTextWidth);
    const fits = lines.every(l => ctx.measureText(l).width <= maxTextWidth);
    if (fits) break;
    fontSize -= 4;
  }

  const lineHeight = Math.round(fontSize * 1.22);
  const textBlockH = lines.length * lineHeight;

  // ── Dark gradient (bottom ~45% of image) ───────────────────────────────
  const bandY = Math.round(imgHeight * 0.52);
  const grad = ctx.createLinearGradient(0, bandY, 0, imgHeight);
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.58)');
  grad.addColorStop(1,    'rgba(0,0,0,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, imgWidth, imgHeight - bandY);

  // ── Blue accent bar above the text ─────────────────────────────────────
  const firstLineY = imgHeight - 72 - textBlockH;
  ctx.fillStyle = '#1055FF';
  ctx.fillRect(48, firstLineY - 24, 64, 7);

  // ── Headline text: shadow pass then white ───────────────────────────────
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  for (let i = 0; i < lines.length; i++) {
    const x = 48;
    const y = firstLineY + i * lineHeight;
    // soft drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(lines[i], x + 3, y + 3);
    // white headline
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(lines[i], x, y);
  }

  // ── Website label at the very bottom ────────────────────────────────────
  ctx.font = `600 20px ${fontFamily}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('BUILDERSBIDBOOK.COM', 48, imgHeight - 26);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export:
// 1. Fetch DALL-E image
// 2. Canvas text overlay (gradient + headline + URL)
// 3. BBB logo bottom-right (if public/bbb-logo.png exists)
// 4. Return base64 data URL
// ─────────────────────────────────────────────────────────────────────────────
export async function stampAndSaveImage(
  dalleUrl: string,
  headline: string
): Promise<string> {
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth  = metadata.width  ?? 1024;
  const imgHeight = metadata.height ?? 1024;

  const composites: sharp.OverlayOptions[] = [];

  // ── Text overlay ────────────────────────────────────────────────────────
  if (headline.trim()) {
    const textPng = buildTextOverlay(headline, imgWidth, imgHeight);
    composites.push({ input: textPng, top: 0, left: 0 });
  }

  // ── Logo (bottom-right) ─────────────────────────────────────────────────
  if (fs.existsSync(LOGO_PATH)) {
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

  const outputBuffer = await sharp(imageBuffer)
    .composite(composites)
    .jpeg({ quality: 93 })
    .toBuffer();

  return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
}
