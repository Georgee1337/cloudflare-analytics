import axios from "axios";
import 'dotenv/config';

const { ZONE_ID, X_AUTH_EMAIL, X_AUTH_KEY, HISTORY_MONTHS = 3 } = process.env;

interface Reqs {
    reqs: number;
    cached_reqs: number;
    uncached_reqs: number;
    cached_reqs_percentage: string;
}

interface Bytes {
    bytes: number;
    cached_bytes: number;
    uncached_bytes: number;
    cached_bytes_percentage: string;
}

const formatPercentage = (numerator: number, denominator: number) =>
    denominator ? `${((numerator / denominator) * 100).toFixed(2)}%` : "0%";

const toReqs = (requests: number, cachedRequests: number): Reqs => {
    const uncachedRequests = requests - cachedRequests;
    return {
        reqs: requests,
        cached_reqs: cachedRequests,
        uncached_reqs: uncachedRequests,
        cached_reqs_percentage: formatPercentage(cachedRequests, requests),
    };
};

const toBytes = (bytes: number, cachedBytes: number): Bytes => {
    const uncachedBytes = bytes - cachedBytes;
    return {
        bytes,
        cached_bytes: cachedBytes,
        uncached_bytes: uncachedBytes,
        cached_bytes_percentage: formatPercentage(cachedBytes, bytes),
    };
};

const addReqs = (a: Reqs | null, b: Reqs | null): Reqs => {
    if (!a) return b as Reqs;
    if (!b) return a;
    return toReqs(a.reqs + b.reqs, a.cached_reqs + b.cached_reqs);
};

const addBytes = (a: Bytes | null, b: Bytes | null): Bytes => {
    if (!a) return b as Bytes;
    if (!b) return a;
    return toBytes(a.bytes + b.bytes, a.cached_bytes + b.cached_bytes);
};

const subMonths = (date: Date, months: number): Date => {
    const newDate = new Date(date);
    newDate.setMonth(date.getMonth() - months);
    return newDate;
};

const getPeriodKey = (dateStr: string, type: "month" | "quarter"): string => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    if (type === "month") return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return `Q${Math.ceil((date.getMonth() + 1) / 3)}-${year}`;
};

export const analytics = async () => {
    const now = new Date();
    const timestamp = subMonths(now, Number(HISTORY_MONTHS));
    const limit = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24));

    const query = `{
      viewer {
        zones(filter: {zoneTag: "${ZONE_ID}"}) {
          httpRequests1dGroups(orderBy:[date_DESC] limit: ${limit}) {
            dimensions { date }
            sum { requests, cachedRequests, bytes, cachedBytes }
          }
        }
      }
    }`;

    const { data } = await axios.post("https://api.cloudflare.com/client/v4/graphql", { query }, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-email": X_AUTH_EMAIL,
            "x-auth-key": X_AUTH_KEY,
        },
    });

    const [{ httpRequests1dGroups }] = data.data.viewer.zones;

    const byDay = new Map<string, Reqs & Bytes>();
    const byMonth = new Map<string, Reqs & Bytes>();
    const byQuarter = new Map<string, Reqs & Bytes>();

    for (const item of httpRequests1dGroups) {
        const key = item.dimensions.date;
        const reqs = toReqs(item.sum.requests, item.sum.cachedRequests);
        const bytes = toBytes(item.sum.bytes, item.sum.cachedBytes);

        byDay.set(key, { ...reqs, ...bytes });

        const monthKey = getPeriodKey(key, "month");
        byMonth.set(monthKey, { ...addReqs(byMonth.get(monthKey), reqs), ...addBytes(byMonth.get(monthKey), bytes) });

        const quarterKey = getPeriodKey(key, "quarter");
        byQuarter.set(quarterKey, { ...addReqs(byQuarter.get(quarterKey), reqs), ...addBytes(byQuarter.get(quarterKey), bytes) });
    }

    return {
        byQuarter: Object.fromEntries(byQuarter),
        byMonth: Object.fromEntries(byMonth),
        byDay: Object.fromEntries(byDay),
    };
};
