import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { approved } = (await req.json()) as { approved: boolean };
    const decision = await prisma.gadsAiDecision.update({
      where: { id: params.id },
      data: {
        approved,
        executedAt: approved ? new Date() : null,
      },
    });
    return NextResponse.json(decision);
  } catch (err) {
    console.error('[ADS Decisions]', err);
    return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 });
  }
}
