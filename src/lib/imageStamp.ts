import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');

// Font candidates — first found wins.
// The Noto Sans entry (last) is bundled inside next itself so it always exists in production.
const FONT_CANDIDATES = [
  { file: path.join(process.cwd(), 'public', 'fonts', 'inter-bold.ttf'), family: 'BBB' },
  { file: 'C:\\Windows\\Fonts\\arialbd.ttf',   family: 'Arial' },
  { file: 'C:\\Windows\\Fonts\\calibrib.ttf',  family: 'Calibri' },
  { file: 'C:\\Windows\\Fonts\\verdanab.ttf',  family: 'Verdana' },
  { file: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',         family: 'DejaVu Sans' },
  { file: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', family: 'Liberation Sans' },
  { file: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',          family: 'FreeSans' },
  { file: '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',                  family: 'DejaVu Sans' },
  // Always-available fallback — shipped with next/og, works on Vercel and any server
  {
    file: path.join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'noto-sans-v27-latin-regular.ttf'),
    family: 'NotoSans',
  },
];

let _fontFamily: string | null = null;

function initFont(): string {
  if (_fontFamily !== null) return _fontFamily;
  for (const { file, family } of FONT_CANDIDATES) {
    if (fs.existsSync(file)) {
      try {
        GlobalFonts.registerFromPath(file, family);
        _fontFamily = family;
        return family;
      } catch {
        // try next
      }
    }
  }
  _fontFamily = 'sans-serif';
  return _fontFamily;
}

function sanitize(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '');
}

/** Word-wrap using actual Canvas text measurements. */
function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  text: string,
  maxPx: number,
  maxLines = 3
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxPx) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

// ─── main export ─────────────────────────────────────────────────────────────

export async function stampAndSaveImage(
  dalleUrl: string,
  headline: string
): Promise<string> {
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imgBuf = Buffer.from(await res.arrayBuffer());

  const family = initFont();
  const fontFamily = family === 'sans-serif' ? 'sans-serif' : `"${family}"`;
  const baseImg = await loadImage(imgBuf);
  const W = baseImg.width  || 1024;
  const H = baseImg.height || 1024;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1. Draw base image
  ctx.drawImage(baseImg, 0, 0, W, H);

  // 2. Strong dark gradient band — bottom 55% (Fox Business style)
  const bandY = Math.round(H * 0.42);
  const grad = ctx.createLinearGradient(0, bandY, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.25, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6,  'rgba(0,0,0,0.82)');
  grad.addColorStop(1,    'rgba(0,0,0,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, W, H - bandY);

  // 3. Headline text — centered, large, bold (Fox Business style)
  const text = sanitize(headline);
  if (text) {
    const maxTextW = Math.round(W * 0.88); // wide — nearly full width
    const len = text.length;
    const fontSize = len <= 14 ? 96 : len <= 22 ? 82 : len <= 32 ? 70 : 60;

    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    const lines  = wrapText(ctx, text, maxTextW);
    const lineH  = Math.round(fontSize * 1.18);
    const blockH = lines.length * lineH;

    // Position: headline sits in the lower 45%, URL label at very bottom
    const urlY       = H - 32;
    const firstLineY = urlY - 48 - blockH;
    const accentY    = firstLineY - 22;

    // Blue accent bar — centered above headline
    const accentW = 70;
    ctx.fillStyle = '#1055FF';
    ctx.beginPath();
    ctx.roundRect(W / 2 - accentW / 2, accentY, accentW, 8, 4);
    ctx.fill();

    // Text lines — centered with shadow
    for (let i = 0; i < lines.length; i++) {
      const y = firstLineY + i * lineH;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      const lineW = ctx.measureText(lines[i]).width;
      const x = (W - lineW) / 2;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(lines[i], x + 3, y + 3);
      // White text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(lines[i], x, y);
    }

    // URL label — centered at bottom
    ctx.font = `bold 20px ${fontFamily}`;
    const urlText = 'BUILDERSBIDBOOK.COM';
    const urlW = ctx.measureText(urlText).width;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(urlText, (W - urlW) / 2, urlY);
  }

  // 4. BBB logo — TOP-RIGHT corner
  if (fs.existsSync(LOGO_PATH)) {
    const logoImg = await loadImage(fs.readFileSync(LOGO_PATH));
    const logoW   = Math.round(W * 0.22);
    const scale   = logoW / logoImg.width;
    const logoH   = Math.round(logoImg.height * scale);
    const margin  = Math.round(W * 0.03);
    ctx.drawImage(logoImg, W - logoW - margin, margin, logoW, logoH);
  }

  // 5. Encode to JPEG
  const outBuf = await canvas.encode('jpeg', 93);
  return `data:image/jpeg;base64,${outBuf.toString('base64')}`;
}

/**
 * Same as stampAndSaveImage but writes to /public/ig-images/{fileName}.jpg
 * and returns the file name (caller builds the public URL).
 */
export async function stampAndSaveFile(
  dalleUrl: string,
  headline: string
): Promise<string> {
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imgBuf = Buffer.from(await res.arrayBuffer());

  const family = initFont();
  const fontFamily = family === 'sans-serif' ? 'sans-serif' : `"${family}"`;
  const baseImg = await loadImage(imgBuf);
  const W = baseImg.width || 1024;
  const H = baseImg.height || 1024;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(baseImg, 0, 0, W, H);

  const bandY = Math.round(H * 0.42);
  const grad = ctx.createLinearGradient(0, bandY, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.25, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6,  'rgba(0,0,0,0.82)');
  grad.addColorStop(1,    'rgba(0,0,0,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, W, H - bandY);

  const text = sanitize(headline);
  if (text) {
    const maxTextW = Math.round(W * 0.88);
    const len = text.length;
    const fontSize = len <= 14 ? 96 : len <= 22 ? 82 : len <= 32 ? 70 : 60;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    const lines  = wrapText(ctx, text, maxTextW);
    const lineH  = Math.round(fontSize * 1.18);
    const blockH = lines.length * lineH;
    const urlY       = H - 32;
    const firstLineY = urlY - 48 - blockH;
    const accentY    = firstLineY - 22;
    const accentW = 70;
    ctx.fillStyle = '#1055FF';
    ctx.beginPath();
    ctx.roundRect(W / 2 - accentW / 2, accentY, accentW, 8, 4);
    ctx.fill();
    for (let i = 0; i < lines.length; i++) {
      const y = firstLineY + i * lineH;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      const lineW = ctx.measureText(lines[i]).width;
      const x = (W - lineW) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(lines[i], x + 3, y + 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(lines[i], x, y);
    }
    ctx.font = `bold 20px ${fontFamily}`;
    const urlText = 'BUILDERSBIDBOOK.COM';
    const urlW = ctx.measureText(urlText).width;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(urlText, (W - urlW) / 2, urlY);
  }

  if (fs.existsSync(LOGO_PATH)) {
    const logoImg = await loadImage(fs.readFileSync(LOGO_PATH));
    const logoW   = Math.round(W * 0.22);
    const scale   = logoW / logoImg.width;
    const logoH   = Math.round(logoImg.height * scale);
    const margin  = Math.round(W * 0.03);
    ctx.drawImage(logoImg, W - logoW - margin, margin, logoW, logoH);
  }

  const outBuf = await canvas.encode('jpeg', 93);

  const dir = path.join(process.cwd(), 'public', 'ig-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  fs.writeFileSync(path.join(dir, fileName), outBuf);
  return fileName;
}

/**
 * Creates a 9:16 story image (1080x1920) from a square DALL-E URL.
 * The photo fills the top portion, a dark branded panel sits at the bottom.
 * Returns base64 JPEG string (data:image/jpeg;base64,...).
 */
export async function stampStoryImage(
  dalleUrl: string,
  headline: string
): Promise<string> {
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imgBuf  = Buffer.from(await res.arrayBuffer());
  const baseImg = await loadImage(imgBuf);

  const family    = initFont();
  const fontFamily = family === 'sans-serif' ? 'sans-serif' : `"${family}"`;

  // 9:16 canvas
  const SW = 1080;
  const SH = 1920;

  const canvas = createCanvas(SW, SH);
  const ctx    = canvas.getContext('2d');

  // 1. Dark background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, SW, SH);

  // 2. Photo — top 70% of canvas, centered & cropped to fill width
  const photoH   = Math.round(SH * 0.70);
  const srcSize  = Math.min(baseImg.width, baseImg.height);
  const srcX     = Math.round((baseImg.width  - srcSize) / 2);
  const srcY     = Math.round((baseImg.height - srcSize) / 2);
  ctx.drawImage(baseImg, srcX, srcY, srcSize, srcSize, 0, 0, SW, photoH);

  // 3. Gradient fade from photo into dark panel
  const fadeGrad = ctx.createLinearGradient(0, photoH - 120, 0, photoH + 60);
  fadeGrad.addColorStop(0, 'rgba(10,10,10,0)');
  fadeGrad.addColorStop(1, 'rgba(10,10,10,1)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, photoH - 120, SW, 180);

  // 4. Blue accent bar
  const accentY = photoH + 60;
  ctx.fillStyle = '#1055FF';
  ctx.beginPath();
  ctx.roundRect(SW / 2 - 40, accentY, 80, 8, 4);
  ctx.fill();

  // 5. Headline text
  const text = sanitize(headline);
  if (text) {
    const maxTextW = Math.round(SW * 0.88);
    const len      = text.length;
    const fontSize = len <= 14 ? 88 : len <= 22 ? 76 : len <= 32 ? 64 : 54;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    const lines  = wrapText(ctx, text, maxTextW);
    const lineH  = Math.round(fontSize * 1.2);

    const startY = accentY + 50;
    for (let i = 0; i < lines.length; i++) {
      const y     = startY + i * lineH;
      const lineW = ctx.measureText(lines[i]).width;
      const x     = (SW - lineW) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(lines[i], x + 3, y + 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(lines[i], x, y);
    }
  }

  // 6. URL label
  ctx.font = `bold 32px ${fontFamily}`;
  const urlText = 'BUILDERSBIDBOOK.COM';
  const urlW    = ctx.measureText(urlText).width;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(urlText, (SW - urlW) / 2, SH - 80);

  // 7. Logo — top-right
  if (fs.existsSync(LOGO_PATH)) {
    const logoImg = await loadImage(fs.readFileSync(LOGO_PATH));
    const logoW   = Math.round(SW * 0.28);
    const scale   = logoW / logoImg.width;
    const logoH   = Math.round(logoImg.height * scale);
    const margin  = Math.round(SW * 0.04);
    ctx.drawImage(logoImg, SW - logoW - margin, margin, logoW, logoH);
  }

  const outBuf = await canvas.encode('jpeg', 93);
  return `data:image/jpeg;base64,${outBuf.toString('base64')}`;
}
