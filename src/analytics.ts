import axios from "axios";
import { config } from "./config";

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

export interface AnalyticsTotals extends Reqs, Bytes {}

export interface AnalyticsResponse {
    byQuarter: Record<string, AnalyticsTotals>;
    byMonth: Record<string, AnalyticsTotals>;
    byDay: Record<string, AnalyticsTotals>;
}

interface CloudflareGroup {
    dimensions: {
        date: string;
    };
    sum: {
        requests: number;
        cachedRequests: number;
        bytes: number;
        cachedBytes: number;
    };
}

interface CloudflareGraphQLResponse {
    data?: {
        viewer?: {
            zones?: Array<{
                httpRequests1dGroups?: CloudflareGroup[];
            }>;
        };
    };
    errors?: Array<{
        message?: string;
    }>;
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

const combineTotals = (current: AnalyticsTotals | undefined, next: AnalyticsTotals): AnalyticsTotals => {
    if (!current) {
        return next;
    }

    return {
        ...toReqs(current.reqs + next.reqs, current.cached_reqs + next.cached_reqs),
        ...toBytes(current.bytes + next.bytes, current.cached_bytes + next.cached_bytes),
    };
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

const getGroups = (data: CloudflareGraphQLResponse): CloudflareGroup[] => {
    if (data.errors?.length) {
        const message = data.errors
            .map(({ message }) => message)
            .filter((message): message is string => Boolean(message))
            .join("; ");

        throw new Error(`Cloudflare GraphQL request failed: ${message || "Unknown error"}`);
    }

    const groups = data.data?.viewer?.zones?.[0]?.httpRequests1dGroups;

    if (!Array.isArray(groups)) {
        throw new Error("Cloudflare response is missing httpRequests1dGroups");
    }

    return groups;
};

export const analytics = async ({ signal }: { signal?: AbortSignal } = {}): Promise<AnalyticsResponse> => {
    const now = new Date();
    const timestamp = subMonths(now, config.historyMonths);
    const limit = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24));

    const query = `{
      viewer {
        zones(filter: {zoneTag: "${config.zoneId}"}) {
          httpRequests1dGroups(orderBy:[date_DESC] limit: ${limit}) {
            dimensions { date }
            sum { requests, cachedRequests, bytes, cachedBytes }
          }
        }
      }
    }`;

    const response = await axios.post<CloudflareGraphQLResponse>("https://api.cloudflare.com/client/v4/graphql", { query }, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-email": config.authEmail,
            "x-auth-key": config.authKey,
        },
        signal,
        timeout: config.requestTimeoutMs,
    });

    const httpRequests1dGroups = getGroups(response.data);

    const byDay = new Map<string, AnalyticsTotals>();
    const byMonth = new Map<string, AnalyticsTotals>();
    const byQuarter = new Map<string, AnalyticsTotals>();

    for (const item of httpRequests1dGroups) {
        const key = item.dimensions.date;
        const reqs = toReqs(item.sum.requests, item.sum.cachedRequests);
        const bytes = toBytes(item.sum.bytes, item.sum.cachedBytes);
        const totals = { ...reqs, ...bytes };

        byDay.set(key, totals);

        const monthKey = getPeriodKey(key, "month");
        byMonth.set(monthKey, combineTotals(byMonth.get(monthKey), totals));

        const quarterKey = getPeriodKey(key, "quarter");
        byQuarter.set(quarterKey, combineTotals(byQuarter.get(quarterKey), totals));
    }

    return {
        byQuarter: Object.fromEntries(byQuarter),
        byMonth: Object.fromEntries(byMonth),
        byDay: Object.fromEntries(byDay),
    };
};
