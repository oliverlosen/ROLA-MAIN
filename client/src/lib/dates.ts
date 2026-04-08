import { formatDistanceToNow } from "date-fns";

export type ApiDateLike = Date | string | number | null | undefined;

const EXPLICIT_TIMEZONE_PATTERN = /(z|[+-]\d{2}:\d{2}|[+-]\d{4}|(?:\s|T)(UTC|GMT))$/i;
const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;
const EPOCH_MILLISECONDS_THRESHOLD = 1e12;

type ParsedApiDate = {
  date: Date;
  relativeSafe: boolean;
};

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function parseEpochTimestamp(value: number) {
  const timestamp = Math.abs(value) < EPOCH_MILLISECONDS_THRESHOLD ? value * 1000 : value;
  return new Date(timestamp);
}

function parseApiDate(value: ApiDateLike): ParsedApiDate | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? { date: value, relativeSafe: true } : null;
  }

  if (typeof value === "number") {
    const date = parseEpochTimestamp(value);
    return isValidDate(date) ? { date, relativeSafe: true } : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (NUMERIC_PATTERN.test(trimmed)) {
    const date = parseEpochTimestamp(Number(trimmed));
    return isValidDate(date) ? { date, relativeSafe: true } : null;
  }

  const date = new Date(trimmed);
  if (!isValidDate(date)) return null;

  return {
    date,
    relativeSafe: EXPLICIT_TIMEZONE_PATTERN.test(trimmed),
  };
}

function formatExactDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatRelativeNotificationTime(value: ApiDateLike) {
  const parsed = parseApiDate(value);
  if (!parsed) return "";

  if (parsed.relativeSafe) {
    return formatDistanceToNow(parsed.date, { addSuffix: true });
  }

  return formatExactDate(parsed.date);
}
