import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — load config + recent logs
export async function GET() {
  const [config, logs] = await Promise.all([
    prisma.igPublishConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    }),
    prisma.igPublishLog.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 20,
    }),
  ]);

  const { accessToken: _, ...safeConfig } = config;
  const connected = !!config.igUserId && !!config.accessToken;

  return NextResponse.json({ config: { ...safeConfig, connected }, logs });
}

// POST — save credentials or toggle
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    action?: string;
    igUserId?: string;
    accessToken?: string;
    isActive?: boolean;
  };

  if (body.action === 'toggle') {
    const cfg = await prisma.igPublishConfig.upsert({
      where: { id: 1 },
      create: { id: 1, isActive: body.isActive ?? false },
      update: { isActive: body.isActive ?? false },
    });
    const { accessToken: _, ...safe } = cfg;
    return NextResponse.json({ config: { ...safe, connected: !!cfg.igUserId && !!cfg.accessToken } });
  }

  if (body.action === 'disconnect') {
    const cfg = await prisma.igPublishConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { igUserId: '', accessToken: '', isActive: false },
    });
    const { accessToken: _, ...safe } = cfg;
    return NextResponse.json({ config: { ...safe, connected: false } });
  }

  // Default: save credentials
  if (!body.igUserId || !body.accessToken) {
    return NextResponse.json({ error: 'igUserId and accessToken are required' }, { status: 400 });
  }

  const cfg = await prisma.igPublishConfig.upsert({
    where: { id: 1 },
    create: { id: 1, igUserId: body.igUserId, accessToken: body.accessToken },
    update: { igUserId: body.igUserId, accessToken: body.accessToken },
  });

  const { accessToken: _, ...safe } = cfg;
  return NextResponse.json({ config: { ...safe, connected: true } });
}
