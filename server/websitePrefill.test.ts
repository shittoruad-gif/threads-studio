import { describe, it, expect } from "vitest";
import { extractUrl, htmlToText, isSafePublicUrl } from "./websitePrefill";

describe("ホームページのURLから先読み（2026-09-10）", () => {
  it("文章の中からURLを拾う（前後に日本語や句点があってもよい）", () => {
    expect(extractUrl("うちのHPです https://example.com/about。")).toBe("https://example.com/about");
    expect(extractUrl("https://beauty.hotpepper.jp/slnH000123456/")).toBe("https://beauty.hotpepper.jp/slnH000123456/");
    expect(extractUrl("www.example.jp/shop です")).toBe("https://www.example.jp/shop");
    expect(extractUrl("なし")).toBeNull();
    expect(extractUrl("整体院です")).toBeNull();
  });
  it("HTMLから本文・タイトル・説明文だけを取り出す（script/style/nav/footerは捨てる）", () => {
    const html = `<html><head><title>はいさい整骨院｜八千代市勝田台</title>
      <meta name="description" content="八千代市勝田台の整骨院。開業11年。"><style>.a{}</style></head>
      <body><nav>ホーム メニュー</nav><script>var x=1;</script>
      <h1>はいさい整骨院</h1><p>業界歴20年。&amp;一人ひとりに合わせた施術。</p><ul><li>交通事故治療</li><li>骨盤矯正</li></ul>
      <footer>Copyright</footer></body></html>`;
    const r = htmlToText(html);
    expect(r.title).toBe("はいさい整骨院｜八千代市勝田台");
    expect(r.description).toBe("八千代市勝田台の整骨院。開業11年。");
    expect(r.text).toContain("業界歴20年。&一人ひとりに合わせた施術。");
    expect(r.text).toContain("交通事故治療\n骨盤矯正");
    expect(r.text).not.toContain("var x=1");
    expect(r.text).not.toContain("ホーム メニュー");
    expect(r.text).not.toContain("Copyright");
  });
  it("社内・ローカル向けのURLは読みに行かない", async () => {
    expect(await isSafePublicUrl(new URL("http://localhost:3000/"))).toBe(false);
    expect(await isSafePublicUrl(new URL("http://127.0.0.1/"))).toBe(false);
    expect(await isSafePublicUrl(new URL("http://10.0.1.7:3306/"))).toBe(false);
    expect(await isSafePublicUrl(new URL("http://169.254.169.254/latest/meta-data"))).toBe(false);
    expect(await isSafePublicUrl(new URL("ftp://example.com/"))).toBe(false);
    expect(await isSafePublicUrl(new URL("http://intranet/"))).toBe(false);
  });
});
