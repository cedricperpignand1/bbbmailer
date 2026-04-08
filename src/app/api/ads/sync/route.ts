import { NextResponse } from 'next/server';
import { syncCampaignsFromApi } from '@/lib/googleads/campaigns';
import { log, error } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    await syncCampaignsFromApi();
    log('Sync', 'Campaigns synced from Google Ads API');
    return NextResponse.json({ ok: true, message: 'Campaigns synced successfully' });
  } catch (err) {
    error('Sync', 'Failed to sync campaigns', err);
    return NextResponse.json(
      { error: 'Failed to sync campaigns from Google Ads' },
      { status: 500 }
    );
  }
}
