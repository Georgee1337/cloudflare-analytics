import "dotenv/config";

const getRequiredEnv = (name: "ZONE_ID" | "X_AUTH_EMAIL" | "X_AUTH_KEY"): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const parseIntegerEnv = (name: string, fallback: number, minimum = 0): number => {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }

  return parsedValue;
};

export const config = {
  port: parseIntegerEnv("PORT", 3000, 0),
  maxCacheSeconds: parseIntegerEnv("MAX_CACHE", 86400, 0),
  requestTimeoutMs: parseIntegerEnv("REQ_TIMEOUT_MS", 8000, 1),
  historyMonths: parseIntegerEnv("HISTORY_MONTHS", 3, 1),
  zoneId: getRequiredEnv("ZONE_ID"),
  authEmail: getRequiredEnv("X_AUTH_EMAIL"),
  authKey: getRequiredEnv("X_AUTH_KEY"),
};
