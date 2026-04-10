import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!id) return new NextResponse('missing id', { status: 400 });

  const img = await prisma.igImageStore.findUnique({ where: { id } });
  if (!img) return new NextResponse('not found', { status: 404 });

  const buf = Buffer.from(img.data, 'base64');
  return new NextResponse(buf, {
    headers: {
      'Content-Type':  'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
