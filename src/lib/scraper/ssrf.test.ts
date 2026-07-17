import { describe, expect, it } from "vitest";
import { assertSafeUrl, isBlockedIp, normalizeUrlInput, UnsafeUrlError } from "./ssrf";

describe("isBlockedIp", () => {
  it("blocks private and loopback IPv4 ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("172.16.5.5")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.1.1")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
  });

  it("blocks IPv6 loopback and link-local", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeUrl("ftp://example.com")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects direct private IP addresses", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeUrl("http://192.168.0.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost", async () => {
    await expect(assertSafeUrl("http://localhost/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects invalid URLs", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("normalizeUrlInput", () => {
  it("adds https:// when protocol is missing", () => {
    expect(normalizeUrlInput("fundacja.pl")).toBe("https://fundacja.pl");
  });

  it("leaves http:// URLs unchanged", () => {
    expect(normalizeUrlInput("http://fundacja.pl")).toBe("http://fundacja.pl");
  });

  it("leaves https:// URLs unchanged", () => {
    expect(normalizeUrlInput("https://fundacja.pl")).toBe("https://fundacja.pl");
  });

  it("trims whitespace before adding the protocol", () => {
    expect(normalizeUrlInput("  fundacja.pl  ")).toBe("https://fundacja.pl");
  });

  it("leaves disallowed protocols unchanged so assertSafeUrl rejects them", () => {
    expect(normalizeUrlInput("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});
