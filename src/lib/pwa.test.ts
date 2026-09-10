import { describe, expect, it } from "vitest";
import { detectInstalled } from "./pwa";

describe("pwa helpers", () => {
  it("detects installed state", () => {
    expect(detectInstalled(true)).toBe(true);
    expect(detectInstalled(false, true)).toBe(true);
    expect(detectInstalled(false, false)).toBe(false);
    expect(detectInstalled(false)).toBe(false);
  });
});
