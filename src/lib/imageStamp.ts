import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const LOGO_PATH = path.join(process.cwd(), 'public', 'bbb-logo.png');

// Font search order — first match wins, its TTF bytes get base64-embedded in the SVG
// so librsvg renders the text with that exact font regardless of system state.
const FONT_PATHS = [
  path.join(process.cwd(), 'public', 'fonts', 'inter-bold.ttf'), // user-supplied
  'C:\\Windows\\Fonts\\arialbd.ttf',    // Windows — Arial Bold
  'C:\\Windows\\Fonts\\calibrib.ttf',   // Windows — Calibri Bold
  'C:\\Windows\\Fonts\\verdanab.ttf',   // Windows — Verdana Bold
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',        // Debian/Ubuntu
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',// Debian/Ubuntu
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
];

// Cached base64 font string — read once per process lifetime
let _fontBase64: string | null = null;
function loadFontBase64(): string {
  if (_fontBase64 !== null) return _fontBase64;
  for (const p of FONT_PATHS) {
    if (fs.existsSync(p)) {
      _fontBase64 = fs.readFileSync(p).toString('base64');
      return _fontBase64;
    }
  }
  _fontBase64 = '';
  return '';
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

/** Wrap text into lines based on estimated character width for a bold font. */
function wrapLines(text: string, fontSize: number, maxPx: number, maxLines = 3): string[] {
  const charW = fontSize * 0.55; // bold sans-serif average char width
  const maxChars = Math.floor(maxPx / charW);
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (test.length <= maxChars) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

// ─── SVG text overlay ────────────────────────────────────────────────────────
// The font TTF is base64-embedded inside the SVG @font-face so librsvg
// doesn't need any system fonts — it uses the embedded bytes directly.
// Layout: dark gradient band at bottom-left · blue accent bar · headline · URL
// Logo area (bottom-right 35%) is intentionally left clear.

function buildTextSvg(headline: string, imgW: number, imgH: number): Buffer {
  const text = sanitize(headline);
  if (!text) return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

  const fontBase64 = loadFontBase64();
  const ff = fontBase64 ? 'BBB' : 'Arial';

  // Text stays in the left 67% so it never reaches the logo (bottom-right)
  const maxTextW = Math.round(imgW * 0.67);
  const len = text.length;
  const fontSize = len <= 18 ? 86 : len <= 28 ? 72 : len <= 40 ? 60 : 50;
  const lines = wrapLines(text, fontSize, maxTextW);
  const lineH  = Math.round(fontSize * 1.22);
  const blockH = lines.length * lineH;

  // Dark gradient band — bottom 42%
  const bandY = Math.round(imgH * 0.58);

  // Positions (anchored from the bottom)
  const urlY       = imgH - 28;
  const firstLineY = urlY - 34 - blockH;
  const accentY    = firstLineY - 20;

  const fontFaceStyle = fontBase64
    ? `<style>@font-face{font-family:'BBB';src:url('data:font/truetype;base64,${fontBase64}');font-weight:bold;}</style>`
    : '';

  const textEls = lines.map((line, i) => {
    const y = firstLineY + i * lineH;
    const s = escapeXml(line);
    // shadow pass (offset 3px, semi-transparent black) then white on top
    return `<text x="51" y="${y + 3}" font-family="${ff}" font-size="${fontSize}" font-weight="bold" fill="black" fill-opacity="0.4">${s}</text>
<text x="48" y="${y}" font-family="${ff}" font-size="${fontSize}" font-weight="bold" fill="white">${s}</text>`;
  }).join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
<defs>
  ${fontFaceStyle}
  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
    <stop offset="38%"  stop-color="#000000" stop-opacity="0.52"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
  </linearGradient>
</defs>
<rect x="0" y="${bandY}" width="${imgW}" height="${imgH - bandY}" fill="url(#g)"/>
<rect x="48" y="${accentY}" width="58" height="7" rx="3" fill="#1055FF"/>
${textEls}
<text x="48" y="${urlY}" font-family="${ff}" font-size="19" fill="white" fill-opacity="0.48">${escapeXml('BUILDERSBIDBOOK.COM')}</text>
</svg>`;

  return Buffer.from(svg);
}

// ─── main export ─────────────────────────────────────────────────────────────

export async function stampAndSaveImage(
  dalleUrl: string,
  headline: string
): Promise<string> {
  const res = await fetch(dalleUrl);
  if (!res.ok) throw new Error(`Failed to fetch DALL-E image: ${res.status}`);
  const imgBuf = Buffer.from(await res.arrayBuffer());

  const { width: imgW = 1024, height: imgH = 1024 } = await sharp(imgBuf).metadata();
  const composites: sharp.OverlayOptions[] = [];

  // 1. Text overlay (bottom-left area)
  if (headline.trim()) {
    composites.push({ input: buildTextSvg(headline, imgW, imgH), top: 0, left: 0 });
  }

  // 2. BBB logo — bottom-right corner
  if (fs.existsSync(LOGO_PATH)) {
    const logoW  = Math.round(imgW * 0.22);
    const logoBuf = await sharp(LOGO_PATH)
      .resize(logoW, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const logoH  = (await sharp(logoBuf).metadata()).height ?? 60;
    const margin = Math.round(imgW * 0.03);
    composites.push({
      input: logoBuf,
      left: imgW - logoW - margin,
      top:  imgH - logoH - margin,
      blend: 'over',
    });
  }

  const out = composites.length
    ? await sharp(imgBuf).composite(composites).jpeg({ quality: 93 }).toBuffer()
    : await sharp(imgBuf).jpeg({ quality: 93 }).toBuffer();

  return `data:image/jpeg;base64,${out.toString('base64')}`;
}
