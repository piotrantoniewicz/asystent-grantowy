import { safeFetch } from "./fetch";

type RobotsRules = { disallow: string[] };

const robotsCache = new Map<string, Promise<RobotsRules>>();

function parseRobotsTxt(text: string): RobotsRules {
  const lines = text.split("\n").map((l) => l.trim());
  const disallow: string[] = [];
  let appliesToUs = false;
  let inRelevantGroup = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      inRelevantGroup = value === "*" || value.toLowerCase() === "asystentgrantowy";
      if (value === "*") appliesToUs = true;
      continue;
    }
    if (key === "disallow" && inRelevantGroup && value) {
      disallow.push(value);
    }
  }

  if (!appliesToUs && disallow.length === 0) return { disallow: [] };
  return { disallow };
}

async function getRobotsRules(origin: string): Promise<RobotsRules> {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = (async () => {
      const result = await safeFetch(`${origin}/robots.txt`, 200_000);
      if (!result.ok) return { disallow: [] };
      const text = new TextDecoder().decode(result.body);
      return parseRobotsTxt(text);
    })();
    robotsCache.set(origin, cached);
  }
  return cached;
}

/**
 * Sprawdza robots.txt dla podstron odkrytych przez crawler (NIE dla adresu
 * podanego wprost przez użytkownika — patrz 06-scraping.md).
 */
export async function isAllowedByRobots(url: URL): Promise<boolean> {
  const rules = await getRobotsRules(url.origin);
  return !rules.disallow.some((pattern) => url.pathname.startsWith(pattern));
}
