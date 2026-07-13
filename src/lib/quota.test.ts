import { describe, expect, it } from "vitest";
import { deviceQuotaKey, getClientIp, ipQuotaKey, truncateForClassifier } from "./quota";

describe("deviceQuotaKey", () => {
  it("buduje oczekiwany klucz", () => {
    expect(deviceQuotaKey("abc-123")).toBe("device:abc-123");
  });
});

describe("ipQuotaKey", () => {
  const date = new Date("2026-07-13T10:00:00Z");

  it("jest stały dla tego samego IP i dnia", () => {
    expect(ipQuotaKey("1.2.3.4", date)).toBe(ipQuotaKey("1.2.3.4", date));
  });

  it("jest różny dla różnych IP", () => {
    expect(ipQuotaKey("1.2.3.4", date)).not.toBe(ipQuotaKey("5.6.7.8", date));
  });

  it("jest różny dla różnych dni", () => {
    const otherDay = new Date("2026-07-14T10:00:00Z");
    expect(ipQuotaKey("1.2.3.4", date)).not.toBe(ipQuotaKey("1.2.3.4", otherDay));
  });

  it("nie zawiera surowego IP", () => {
    expect(ipQuotaKey("1.2.3.4", date)).not.toContain("1.2.3.4");
  });
});

describe("truncateForClassifier", () => {
  it("przycina do 500 znaków", () => {
    const long = "a".repeat(600);
    expect(truncateForClassifier(long)).toHaveLength(500);
  });

  it("nie zmienia krótkich tekstów", () => {
    expect(truncateForClassifier("krótki tekst")).toBe("krótki tekst");
  });
});

describe("getClientIp", () => {
  it("bierze pierwszy adres z x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("zwraca 'local' bez nagłówka", () => {
    const request = new Request("http://localhost");
    expect(getClientIp(request)).toBe("local");
  });
});
