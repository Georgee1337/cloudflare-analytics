import express from 'express';
import { analytics } from './analytics';
import 'dotenv/config';

const ONE_DAY_SECONDS = 86400;
const REQ_TIMEOUT = 8000;
const { MAX_CACHE = ONE_DAY_SECONDS } = process.env;

let CACHE: any | null = null;

const isEmpty = (obj: Record<string, unknown> = {}): boolean => Object.keys(obj).length === 0;

const app = express();

app.get('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const value = await Promise.race([
      analytics(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), REQ_TIMEOUT)
      ),
    ]);

    if (value && !isEmpty(value)) CACHE = value;

    if (!isEmpty(CACHE)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Cache-Control',
        `public, must-revalidate, max-age=${MAX_CACHE}`
      );
      const data = JSON.stringify(CACHE);
      res.setHeader('Content-Length', Buffer.byteLength(data));
      return res.end(data);
    }
  } catch (error) {
    console.error(error);
    res.send(error);
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
