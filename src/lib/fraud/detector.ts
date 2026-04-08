import { prisma } from '../prisma';
import { log } from '../logger';

export type ClickData = {
  gclid: string;
  ip: string;
  userAgent: string;
  clickTimestamp: Date;
  pageLoadTimestamp: Date;
  timeDeltaMs: number;
  hasMouse: boolean;
  sessionDurationMs: number;
  pagesViewed: number;
};

export type FraudResult = {
  score: number;
  flags: string[];
  action: 'allow' | 'flag' | 'block';
};

export async function scoreClick(
  click: ClickData,
  ipqsScore?: number
): Promise<FraudResult> {
  let score = 0;
  const flags: string[] = [];

  if (click.timeDeltaMs > 3000) {
    score += 30;
    flags.push('SLOW_DELTA');
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const repeatCount = await prisma.gadsAdClick.count({
    where: { ip: click.ip, createdAt: { gte: oneDayAgo } },
  });
  if (repeatCount > 0) {
    score += 40;
    flags.push('REPEAT_IP');
  }

  if (!click.hasMouse) {
    score += 20;
    flags.push('NO_MOUSE');
  }

  if (click.sessionDurationMs < 2000) {
    score += 35;
    flags.push('INSTANT_BOUNCE');
  } else if (click.sessionDurationMs < 4000) {
    score += 15;
    flags.push('FAST_BOUNCE');
  }

  if (click.pagesViewed === 1 && click.sessionDurationMs < 5000) {
    score += 10;
    flags.push('SINGLE_PAGE');
  }

  if (ipqsScore !== undefined && ipqsScore >= 75) {
    score += 50;
    flags.push('IPQS_HIGH_RISK');
  }

  let action: 'allow' | 'flag' | 'block';
  if (score >= 80) {
    action = 'block';
  } else if (score >= 50) {
    action = 'flag';
  } else {
    action = 'allow';
  }

  log(
    'Fraud',
    `gclid=${click.gclid} score=${score} action=${action} flags=[${flags.join(',')}]`
  );

  return { score, flags, action };
}
