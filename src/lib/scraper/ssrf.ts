import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Bloki adresów prywatnych/lokalnych — patrz 06-scraping.md.
const BLOCKED_V4_RANGES: [string, number][] = [
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["192.0.0.0", 24], // IETF
  ["192.0.2.0", 24], // TEST-NET
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Adresy IPv4 mapowane na IPv6 (::ffff:1.2.3.4) — oceniaj regułami IPv4.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") || // link-local
    normalized.startsWith("fc") || // unique local fc00::/7
    normalized.startsWith("fd")
  );
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true; // nierozpoznany format — odrzuć bezpiecznie
}

export class UnsafeUrlError extends Error {}

/**
 * Sprawdza, że URL jest http(s) i nie rozwiązuje się do adresu prywatnego/lokalnego.
 * Wywoływać przed KAŻDYM pobraniem, także po przekierowaniach (patrz 06-scraping.md).
 *
 * Znane ograniczenie (świadomie akceptowane): między tym sprawdzeniem a właściwym
 * `fetch` nazwa domeny jest rozwiązywana po raz drugi, więc teoretycznie możliwy jest
 * atak DNS-rebinding. Pełna ochrona wymaga przypięcia IP w warstwie HTTP.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Nieprawidłowy adres URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Dozwolone są tylko adresy http/https.");
  }

  const hostname = url.hostname;
  if (hostname === "localhost") {
    throw new UnsafeUrlError("Adresy lokalne są zablokowane.");
  }

  const directIpVersion = isIP(hostname);
  if (directIpVersion) {
    if (isBlockedIp(hostname)) {
      throw new UnsafeUrlError("Adres prowadzi do sieci prywatnej/lokalnej.");
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("Nie udało się rozwiązać nazwy domeny.");
  }

  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a.address))) {
    throw new UnsafeUrlError("Adres prowadzi do sieci prywatnej/lokalnej.");
  }

  return url;
}
