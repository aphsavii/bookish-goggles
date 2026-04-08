export function getIstDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata"
  }).format(date);
}

export function getIstTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(",", "");
}

export function getIstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function diffMinutes(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return (endTime - startTime) / 60000;
}

export function getIstTimeString(date = new Date()) {
  const parts = getIstDateParts(date);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getIstSecondsSinceMidnight(date = new Date()) {
  const parts = getIstDateParts(date);
  return (
    (Number(parts.hour) * 3600) +
    (Number(parts.minute) * 60) +
    Number(parts.second)
  );
}

function parseTimeStringToSeconds(value) {
  if (!value) {
    return Number.NaN;
  }

  const match = String(value).trim().match(/(?:^|[ T])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return Number.NaN;
  }

  const [, hours, minutes, seconds = "00"] = match;
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds);
}

export function getIstSecondsSinceMidnightFromValue(value = new Date()) {
  if (value instanceof Date || typeof value === "number") {
    return getIstSecondsSinceMidnight(new Date(value));
  }

  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return getIstSecondsSinceMidnight(new Date());
  }

  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);
  if (!hasExplicitTimezone) {
    return parseTimeStringToSeconds(rawValue);
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return Number.NaN;
  }

  return getIstSecondsSinceMidnight(parsedDate);
}

export function timeStringToSeconds(timeString) {
  if (!timeString) {
    return null;
  }

  const [hours = "0", minutes = "0", seconds = "0"] = String(timeString).split(":");
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds);
}

export function isIstTimeOnOrAfter(timeString, date = new Date()) {
  const currentSeconds = getIstSecondsSinceMidnightFromValue(date);
  const thresholdSeconds = timeStringToSeconds(timeString);

  if (!Number.isFinite(currentSeconds) || !Number.isFinite(thresholdSeconds)) {
    return false;
  }

  return currentSeconds >= thresholdSeconds;
}
