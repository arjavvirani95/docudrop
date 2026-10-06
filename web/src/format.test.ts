import { expect, it } from "vitest";
import { formatBytes, timeLeft } from "./format";

it("formats bytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
});

it("formats time left", () => {
  const now = 1_000_000_000_000;
  expect(timeLeft(now / 1000 + 3 * 86_400 + 3600, now)).toBe("3d 1h left");
  expect(timeLeft(now / 1000 + 5400, now)).toBe("1h 30m left");
  expect(timeLeft(now / 1000 - 1, now)).toBe("expired");
});
