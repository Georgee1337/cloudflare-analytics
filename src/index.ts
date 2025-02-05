import express from 'express';
import { analytics } from './analytics';
import 'dotenv/config';
import compression from 'compression';

const ONE_DAY_SECONDS = 86400;
const REQ_TIMEOUT = 8000;
const { MAX_CACHE = ONE_DAY_SECONDS } = process.env;

let CACHE: any | null = null;
let CACHE_IS_EMPTY = true;

const isEmpty = (obj: Record<string, unknown> = {}): boolean => Object.keys(obj).length === 0;

const app = express();
app.use(compression());;

const fetchAnalyticsWithTimeout = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQ_TIMEOUT);

  try {
    const value = await analytics();
    return value;
  } catch (error) {
    console.error('Analytics fetch failed:', error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

app.get('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (CACHE && !CACHE_IS_EMPTY) {
      console.log('Serving from cache');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', `public, must-revalidate, max-age=${MAX_CACHE}`);
      const data = JSON.stringify(CACHE);
      res.setHeader('Content-Length', Buffer.byteLength(data));
      return res.end(data);
    }

    const value = await fetchAnalyticsWithTimeout();

    if (value && !isEmpty(value)) {
      CACHE = value;
      CACHE_IS_EMPTY = false;
    }

    if (!CACHE_IS_EMPTY) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', `public, must-revalidate, max-age=${MAX_CACHE}`);
      const data = JSON.stringify(CACHE);
      res.setHeader('Content-Length', Buffer.byteLength(data));
      return res.end(data);
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
