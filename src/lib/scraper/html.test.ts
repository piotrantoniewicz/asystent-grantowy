import { describe, expect, it } from "vitest";
import { extractHtml } from "./html";

describe("extractHtml", () => {
  it("strips nav/footer/script and keeps headings, lists and tables", () => {
    const html = `
      <html><head><title>Strona testowa</title></head>
      <body>
        <nav>Menu strony</nav>
        <h1>Nagłówek główny</h1>
        <p>Akapit z treścią.</p>
        <ul><li>Punkt pierwszy</li><li>Punkt drugi</li></ul>
        <table><tr><td>Kwota</td><td>1000 zł</td></tr></table>
        <footer>Stopka strony</footer>
        <script>alert('x')</script>
      </body></html>
    `;
    const result = extractHtml(html, "https://example.com/");

    expect(result.title).toBe("Strona testowa");
    expect(result.text).toContain("# Nagłówek główny");
    expect(result.text).toContain("Akapit z treścią.");
    expect(result.text).toContain("- Punkt pierwszy");
    expect(result.text).toContain("Kwota | 1000 zł");
    expect(result.text).not.toContain("Menu strony");
    expect(result.text).not.toContain("Stopka strony");
    expect(result.text).not.toContain("alert");
    // treść tabeli nie powinna się powtórzyć
    expect(result.text.match(/Kwota/g)?.length).toBe(1);
  });

  it("resolves relative links against the base URL", () => {
    const html = `<a href="/regulamin.pdf">Regulamin</a>`;
    const result = extractHtml(html, "https://example.com/konkurs/");
    expect(result.links).toEqual([
      { url: "https://example.com/regulamin.pdf", anchorText: "Regulamin" },
    ]);
  });
});
