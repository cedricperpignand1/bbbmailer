// src/lib/market.ts
const ET_TZ = "America/New_York";

function partsInET(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));

  return { year, month, day, hour, minute, second };
}

// Returns ET parts + original Date for logging
export function nowET() {
  const date = new Date();
  return { date, ...partsInET(date) };
}

// Mon–Fri based on ET calendar day
export function isWeekdayET() {
  const { year, month, day } = nowET();

  // Build a date that represents the ET day at noon UTC-ish (safe)
// We only need day-of-week; easiest: get weekday via Intl in ET.
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: ET_TZ, weekday: "short" });
  const wd = fmt.format(new Date()); // "Mon", "Tue", ...
  return wd !== "Sat" && wd !== "Sun";
}
