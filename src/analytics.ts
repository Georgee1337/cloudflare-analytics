import axios from "axios";
import 'dotenv/config';

const { ZONE_ID, X_AUTH_EMAIL, X_AUTH_KEY, HISTORY_MONTHS = 3 } = process.env;


interface Reqs {
    reqs: number;
    reqs_pretty: string;
    cached_reqs: number;
    cached_reqs_pretty: string;
    uncached_reqs: number;
    uncached_reqs_pretty: string;
    cached_reqs_percentage: string;
}

interface Bytes {
    bytes: number;
    bytes_pretty: string;
    cached_bytes: number;
    cached_bytes_pretty: string;
    uncached_bytes: number;
    uncached_bytes_pretty: string;
    cached_bytes_percentage: string;
}

const prettyReq = (value: number): string => {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

const toReqs = ({
    requests: uncached_reqs,
    cachedRequests: cached_reqs,
}: {
    requests: number;
    cachedRequests: number;
}): Reqs => {
    const reqs = cached_reqs + uncached_reqs;

    return {
        reqs,
        reqs_pretty: prettyReq(reqs),
        cached_reqs,
        cached_reqs_pretty: prettyReq(cached_reqs),
        uncached_reqs,
        uncached_reqs_pretty: prettyReq(uncached_reqs),
        cached_reqs_percentage: `${((cached_reqs / reqs) * 100).toFixed(2)}%`,
    };
};

const prettyBytes = (value: number): string => {
    const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const index = Math.floor(Math.log(value) / Math.log(1024));
    const size = value / Math.pow(1024, index);

    return `${size.toFixed(2)} ${UNITS[index]}`;
};

const toBytes = ({
    cachedBytes: cached_bytes,
    bytes: uncached_bytes,
}: {
    cachedBytes: number;
    bytes: number;
}): Bytes => {
    const bytes = cached_bytes + uncached_bytes;

    return {
        bytes,
        bytes_pretty: prettyBytes(bytes),
        cached_bytes,
        cached_bytes_pretty: prettyBytes(cached_bytes),
        uncached_bytes,
        uncached_bytes_pretty: prettyBytes(uncached_bytes),
        cached_bytes_percentage: `${((cached_bytes / bytes) * 100).toFixed(2)}%`,
    };
};

const addReqs = (item1: Reqs | null, item2: Reqs | null): Reqs => {
    if (!item1) return item2 as Reqs;
    if (!item2) return item1 as Reqs;

    return toReqs({
        cachedRequests: item1.cached_reqs + item2.cached_reqs,
        requests: item1.reqs + item2.reqs,
    });
};

const addBytes = (item1: Bytes | null, item2: Bytes | null): Bytes => {
    if (!item1) return item2 as Bytes;
    if (!item2) return item1 as Bytes;

    return toBytes({
        cachedBytes: item1.cached_bytes + item2.cached_bytes,
        bytes: item1.bytes + item2.bytes,
    });
};

const differenceInDays = (date1: Date, date2: Date): number => {
    const diffInMs = Math.abs(date1.getTime() - date2.getTime());
    return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
};

const subMonths = (date: Date, months: number): Date => {
    const newDate = new Date(date);
    newDate.setMonth(date.getMonth() - months);
    return newDate;
};

const format = (date: Date, formatStr: string): string => {
    const formatter = new Intl.DateTimeFormat(undefined, {
        year: formatStr.includes('yyyy') ? 'numeric' : undefined,
        month: formatStr.includes('MM') ? '2-digit' : undefined,
        day: formatStr.includes('dd') ? '2-digit' : undefined,
    });
    return formatter.format(date);
};

const getMonthKey = (rawKey: string): string => {
    const key = rawKey.split('-');
    key.pop();
    return key.join('-');
};

const getQuarterKey = (key: string): string => {
    const date = new Date(key);
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    const year = date.getFullYear();
    return `Q${quarter}-${year}`;
};

export const analytics = async () => {
    const now = new Date();
    const timestamp = subMonths(now, Number(HISTORY_MONTHS));
    const limit = differenceInDays(now, timestamp);

    const query = `{
      viewer {
        zones(filter: {zoneTag: "${ZONE_ID}"}) {
          httpRequests1dGroups(orderBy:[date_DESC] limit: ${limit}, filter: { date_gt: "2022-12-21" }) {
            dimensions {
              date
            }
            sum {
              requests
              cachedRequests
              bytes
              cachedBytes
            }
          }
        }
      }
    }`;

    const { data } = await axios
        .post(
            "https://api.cloudflare.com/client/v4/graphql",
            {
                query: query,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-email": X_AUTH_EMAIL,
                    "x-auth-key": X_AUTH_KEY,
                },
            }
        )
    const body: any = data;
    const [{ httpRequests1dGroups }] = body.data.viewer.zones;

    const byDay = httpRequests1dGroups.reduce((acc: Record<string, Reqs & Bytes>, item: any, index: number) => {
        const key = item.dimensions.date;
        return { ...acc, [key]: { ...toReqs(item.sum), ...toBytes(item.sum) } };
    }, {});

    const byMonth = Object.keys(byDay).reduce((acc: Record<string, Reqs & Bytes>, key: string) => {
        const monthKey = getMonthKey(key);
        acc[monthKey] = {
            ...addReqs(acc[monthKey], byDay[key]),
            ...addBytes(acc[monthKey], byDay[key]),
        };
        return acc;
    }, {});

    const byQuarter = Object.keys(byDay).reduce((acc: Record<string, Reqs & Bytes>, key: string) => {
        const quarterKey = getQuarterKey(key);

        acc[quarterKey] = {
            ...addReqs(acc[quarterKey], byDay[key]),
            ...addBytes(acc[quarterKey], byDay[key]),
        };
        return acc;
    }, {});

    return {
        byQuarter,
        byMonth,
        byDay,
    };
};