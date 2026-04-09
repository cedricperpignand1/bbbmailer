import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');

// Font candidates — first found wins
const FONT_CANDIDATES = [
  { file: path.join(process.cwd(), 'public', 'fonts', 'inter-bold.ttf'), family: 'BBB' },
  { file: 'C:\\Windows\\Fonts\\arialbd.ttf',   family: 'Arial' },
  { file: 'C:\\Windows\\Fonts\\calibrib.ttf',  family: 'Calibri' },
  { file: 'C:\\Windows\\Fonts\\verdanab.ttf',  family: 'Verdana' },
  { file: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',         family: 'DejaVu Sans' },
  { file: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', family: 'Liberation Sans' },
  { file: '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',          family: 'FreeSans' },
  { file: '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',                  family: 'DejaVu Sans' },
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
  const baseImg = await loadImage(imgBuf);
  const W = baseImg.width  || 1024;
  const H = baseImg.height || 1024;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1. Draw base image
  ctx.drawImage(baseImg, 0, 0, W, H);

  // 2. Dark gradient band — bottom 42%
  const bandY = Math.round(H * 0.58);
  const grad = ctx.createLinearGradient(0, bandY, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.38, 'rgba(0,0,0,0.52)');
  grad.addColorStop(1,    'rgba(0,0,0,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, W, H - bandY);

  // 3. Headline text (left 67% — keeps logo area clear)
  const text = sanitize(headline);
  if (text) {
    const maxTextW = Math.round(W * 0.67);
    const len = text.length;
    const fontSize = len <= 18 ? 86 : len <= 28 ? 72 : len <= 40 ? 60 : 50;

    ctx.font = `bold ${fontSize}px "${family}"`;
    const lines  = wrapText(ctx, text, maxTextW);
    const lineH  = Math.round(fontSize * 1.22);
    const blockH = lines.length * lineH;

    const urlY       = H - 28;
    const firstLineY = urlY - 34 - blockH;
    const accentY    = firstLineY - 20;

    // Blue accent bar
    ctx.fillStyle = '#1055FF';
    ctx.fillRect(48, accentY, 58, 7);

    // Text: shadow pass then white
    for (let i = 0; i < lines.length; i++) {
      const y = firstLineY + i * lineH;
      ctx.font = `bold ${fontSize}px "${family}"`;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(lines[i], 51, y + 3);
      ctx.fillStyle = 'white';
      ctx.fillText(lines[i], 48, y);
    }

    // URL label
    ctx.font = `19px "${family}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.48)';
    ctx.fillText('BUILDERSBIDBOOK.COM', 48, urlY);
  }

  // 4. BBB logo — bottom-right corner
  if (fs.existsSync(LOGO_PATH)) {
    const logoImg = await loadImage(fs.readFileSync(LOGO_PATH));
    const logoW   = Math.round(W * 0.22);
    const scale   = logoW / logoImg.width;
    const logoH   = Math.round(logoImg.height * scale);
    const margin  = Math.round(W * 0.03);
    ctx.drawImage(logoImg, W - logoW - margin, H - logoH - margin, logoW, logoH);
  }

  // 5. Encode to JPEG
  const outBuf = await canvas.encode('jpeg', 93);
  return `data:image/jpeg;base64,${outBuf.toString('base64')}`;
}
