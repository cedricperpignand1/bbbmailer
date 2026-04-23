import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return new NextResponse('missing id', { status: 400 });

  const img = await prisma.igImageStore.findUnique({ where: { id } });
  if (!img) return new NextResponse('not found', { status: 404 });

  const buf = Buffer.from(img.data, 'base64');
  return new NextResponse(buf, {
    headers: {
      'Content-Type':   'image/jpeg',
      'Content-Length': String(buf.length),
      'Cache-Control':  'public, max-age=86400',
    },
  });
}
