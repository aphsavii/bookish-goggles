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

export function timeStringToSeconds(timeString) {
  if (!timeString) {
    return null;
  }

  const [hours = "0", minutes = "0", seconds = "0"] = String(timeString).split(":");
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds);
}

export function isIstTimeOnOrAfter(timeString, date = new Date()) {
  const currentSeconds = getIstSecondsSinceMidnight(date);
  const thresholdSeconds = timeStringToSeconds(timeString);

  if (!Number.isFinite(thresholdSeconds)) {
    return false;
  }

  return currentSeconds >= thresholdSeconds;
}
