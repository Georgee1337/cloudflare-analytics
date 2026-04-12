import express from 'express';
import { analytics, AnalyticsResponse } from './analytics';
import compression from 'compression';
import { config } from './config';

type Period = 'all' | 'day' | 'month' | 'quarter';

interface CacheEntry {
  data: AnalyticsResponse;
  fetchedAt: string;
  expiresAt: number;
}

const CACHE_CONTROL_HEADER = `public, must-revalidate, max-age=${config.maxCacheSeconds}`;
const PERIODS: Period[] = ['all', 'day', 'month', 'quarter'];

let cache: CacheEntry | null = null;

const app = express();
app.use(compression());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const parsePeriod = (value: unknown): Period => {
  const normalizedValue = typeof value === 'string' ? value.toLowerCase() : 'all';

  if (!PERIODS.includes(normalizedValue as Period)) {
    throw new Error(`Invalid period "${String(value)}". Expected one of: ${PERIODS.join(', ')}`);
  }

  return normalizedValue as Period;
};

const isTruthy = (value: unknown): boolean =>
  typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const buildPayload = (entry: CacheEntry, period: Period, includeMeta: boolean, cacheStatus: string) => {
  const periodData =
    period === 'all'
      ? entry.data
      : period === 'day'
        ? entry.data.byDay
        : period === 'month'
          ? entry.data.byMonth
          : entry.data.byQuarter;

  if (!includeMeta) {
    return periodData;
  }

  return {
    meta: {
      cacheStatus,
      period,
      fetchedAt: entry.fetchedAt,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    },
    data: periodData,
  };
};

const isCacheFresh = (entry: CacheEntry | null): entry is CacheEntry =>
  Boolean(entry && entry.expiresAt > Date.now());

const fetchAnalyticsWithTimeout = async (): Promise<CacheEntry> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const value = await analytics({ signal: controller.signal });
    const fetchedAt = new Date();

    cache = {
      data: value,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: fetchedAt.getTime() + config.maxCacheSeconds * 1000,
    };

    return cache;
  } finally {
    clearTimeout(timeout);
  }
};

app.get('/', async (req, res) => {
  let period: Period;

  try {
    period = parsePeriod(req.query.period);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid period value' });
  }

  const includeMeta = isTruthy(req.query.includeMeta);

  if (isCacheFresh(cache)) {
    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    res.setHeader('X-Cache-Status', 'HIT');
    return res.status(200).json(buildPayload(cache, period, includeMeta, 'HIT'));
  }

  try {
    const hadCachedValue = Boolean(cache);
    const entry = await fetchAnalyticsWithTimeout();
    const cacheStatus = hadCachedValue ? 'REFRESH' : 'MISS';

    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    res.setHeader('X-Cache-Status', cacheStatus);
    return res.status(200).json(buildPayload(entry, period, includeMeta, cacheStatus));
  } catch (error) {
    console.error('Analytics fetch failed:', error);

    if (cache) {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Cache-Status', 'STALE');
      return res.status(200).json(buildPayload(cache, period, includeMeta, 'STALE'));
    }

    return res.status(502).json({ error: 'Unable to fetch Cloudflare analytics from Cloudflare' });
  }
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    cache: {
      warm: Boolean(cache),
      fresh: isCacheFresh(cache),
      fetchedAt: cache?.fetchedAt ?? null,
      expiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
    },
  });
});

app.listen(config.port, () => console.log(`Listening on http://localhost:${config.port}`));
