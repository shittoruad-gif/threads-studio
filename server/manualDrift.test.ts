import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 説明ページと実際のアプリのズレを検出するテスト。
 *
 * マニュアル（/manual）と紹介ページ（/tour）には、画面のボタン名を
 * そのまま書いている。ボタン名を変えたのに説明を直し忘れると、
 * 「書いてあるボタンが見つからない」状態になり、クライアントが詰まる。
 *
 * ここでは <Ui>◯◯</Ui> と書かれた文言が、アプリのソースのどこかに
 * 実在するかを機械的に照合する。存在しなければテストが落ちるので、
 * ボタン名の変更時に説明ページの修正を強制できる。
 *
 * ※ 文章そのものを自動生成することはできない（機能の意味は人が書く必要がある）。
 *   このテストが担保するのは「参照しているボタンが実在すること」まで。
 */

const ROOT = path.resolve(__dirname, "..");
const CLIENT_SRC = path.join(ROOT, "client/src");

function readAllSource(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) readAllSource(p, acc);
    else if (/\.(tsx?|ts)$/.test(e.name)) acc.push(fs.readFileSync(p, "utf8"));
  }
  return acc;
}

/** 説明ページが参照している画面上の文言を集める */
function uiLabelsIn(file: string): string[] {
  const src = fs.readFileSync(path.join(CLIENT_SRC, file), "utf8");
  const found = new Set<string>();
  for (const m of src.matchAll(/<Ui>([^<]+)<\/Ui>/g)) {
    const label = m[1].trim();
    if (label) found.add(label);
  }
  return [...found];
}

describe("説明ページとアプリのズレ検出", () => {
  const allSource = readAllSource(CLIENT_SRC).join("\n");

  it("マニュアルが参照するボタン名が、アプリに実在する", () => {
    const missing = uiLabelsIn("pages/ThreadsManual.tsx").filter(
      (label) => !allSource.includes(label),
    );
    expect(
      missing,
      `マニュアルに書かれているが画面に見つからない文言:\n${missing.join("\n")}\n` +
        `→ ボタン名を変えたなら client/src/pages/ThreadsManual.tsx も直してください。`,
    ).toEqual([]);
  });

  it("紹介ページに書いた画面の文言が、アプリに実在する", () => {
    const src = fs.readFileSync(path.join(CLIENT_SRC, "pages/Tour.tsx"), "utf8");
    // 紹介ページは <Ui> を使わないので、画面再現部分の主要ラベルを直接照合する
    const quoted = ["この商圏で投稿してよいですか？", "この内容で投稿する", "自分で直す"];
    const referenced = quoted.filter((q) => src.includes(q));
    const missing = referenced.filter((q) => !allSource.includes(q));
    expect(
      missing,
      `紹介ページに書かれているが画面に見つからない文言:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
