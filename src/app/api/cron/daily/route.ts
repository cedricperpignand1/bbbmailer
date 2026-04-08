import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { dailyJob } from '@/lib/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronKey = req.headers.get('x-cron-key');
  if (!cronKey || cronKey !== process.env.AUTO_CRON_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await dailyJob();
  log('Cron', 'Daily cron triggered via HTTP');

  return NextResponse.json(
    { ok: true, ran: 'daily', ts: new Date().toISOString() },
    { status: 200 }
  );
}
