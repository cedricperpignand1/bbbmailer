import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { weeklyJob } from '@/lib/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronKey = req.headers.get('x-cron-key');
  if (!cronKey || cronKey !== process.env.AUTO_CRON_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await weeklyJob();
  log('Cron', 'Weekly cron triggered via HTTP');

  return NextResponse.json(
    { ok: true, ran: 'weekly', ts: new Date().toISOString() },
    { status: 200 }
  );
}
