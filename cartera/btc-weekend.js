(function (root) {
  const TZ = "Europe/Madrid";

  function tzParts(date, tz) {
    const parts = {};
    for (const part of new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date)) {
      if (part.type !== "literal") parts[part.type] = part.value;
    }
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      weekday
    };
  }

  function zonedLocalToUnixSec(year, month, day, hour, minute, tz) {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
    const parts = tzParts(new Date(utcGuess), tz);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    return Math.floor((utcGuess - (asUtc - utcGuess)) / 1000);
  }

  function addUtcDays(year, month, day, delta) {
    const utc = Date.UTC(year, month - 1, day, 12) + delta * 86400000;
    const next = new Date(utc);
    return {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate()
    };
  }

  function lastDaily2200MadridSec(date) {
    const parts = tzParts(date, TZ);
    let year = parts.year;
    let month = parts.month;
    let day = parts.day;
    if (parts.hour < 22) {
      const prev = addUtcDays(year, month, day, -1);
      year = prev.year;
      month = prev.month;
      day = prev.day;
    }
    return zonedLocalToUnixSec(year, month, day, 22, 0, TZ);
  }

  function lastFriday2200MadridSec(date) {
    const parts = tzParts(date, TZ);
    const daysSinceFriday = (parts.weekday - 5 + 7) % 7;
    let cal = addUtcDays(parts.year, parts.month, parts.day, -daysSinceFriday);
    let sec = zonedLocalToUnixSec(cal.year, cal.month, cal.day, 22, 0, TZ);
    const nowSec = Math.floor(date.getTime() / 1000);
    if (nowSec < sec) {
      cal = addUtcDays(cal.year, cal.month, cal.day, -7);
      sec = zonedLocalToUnixSec(cal.year, cal.month, cal.day, 22, 0, TZ);
    }
    return sec;
  }

  function monday0900AfterFriday(fridaySec) {
    const parts = tzParts(new Date(fridaySec * 1000), TZ);
    const monday = addUtcDays(parts.year, parts.month, parts.day, 3);
    return zonedLocalToUnixSec(monday.year, monday.month, monday.day, 9, 0, TZ);
  }

  function inWeekendWindow(date) {
    const nowSec = Math.floor(date.getTime() / 1000);
    const friday = lastFriday2200MadridSec(date);
    const monday = monday0900AfterFriday(friday);
    return nowSec >= friday && nowSec < monday;
  }

  function btcOpenBaselineSec(date) {
    if (inWeekendWindow(date)) return lastFriday2200MadridSec(date);
    return lastDaily2200MadridSec(date);
  }

  function weekendSparkSpec(date) {
    if (!inWeekendWindow(date)) return { range: "2d", interval: "5m" };
    return { range: "5d", interval: "5m" };
  }

  root.CarteraBtcWeekend = {
    lastDaily2200MadridSec,
    lastFriday2200MadridSec,
    monday0900AfterFriday,
    inWeekendWindow,
    btcOpenBaselineSec,
    weekendSparkSpec
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.CarteraBtcWeekend;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
