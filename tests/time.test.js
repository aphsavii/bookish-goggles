import test from "node:test";
import assert from "node:assert/strict";
import { getIstSecondsSinceMidnightFromValue, isIstTimeOnOrAfter } from "../utils/time.js";

test("parses timezone-less timestamp as IST wall clock time", () => {
  const seconds = getIstSecondsSinceMidnightFromValue("2026-04-05 09:49:00");
  assert.equal(seconds, (9 * 3600) + (49 * 60));
});

test("supports direct HH:mm timestamps for IST gating", () => {
  assert.equal(isIstTimeOnOrAfter("09:50:00", "09:49:59"), false);
  assert.equal(isIstTimeOnOrAfter("09:50:00", "09:50:00"), true);
});

test("converts explicit UTC timestamps into IST before comparison", () => {
  assert.equal(isIstTimeOnOrAfter("09:50:00", "2026-04-05T04:20:00.000Z"), true);
  assert.equal(isIstTimeOnOrAfter("09:50:00", "2026-04-05T04:19:59.000Z"), false);
});
