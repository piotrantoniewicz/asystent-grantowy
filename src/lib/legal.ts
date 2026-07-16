import { readFile } from "fs/promises";
import path from "path";

const CONTENT_DIR = path.join(process.cwd(), "content", "prawne");

export async function readLegalContent(
  slug: "polityka-prywatnosci" | "regulamin" | "cookies",
): Promise<string> {
  return readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf-8");
}
