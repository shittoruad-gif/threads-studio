#!/usr/bin/env node
/**
 * 日本語文体の定点観測アナライザ。
 *
 *   node scripts/jp-research/analyze.mjs <コーパス.txt ...>
 *
 * コーパス形式: 投稿を「---」区切りで並べたテキスト。
 * 投稿の末尾行が「数字 数字」（いいね コメント）ならエンゲージメントとして解釈し、
 * いいね20以上/未満で高反応・低反応にも分けて集計する。
 *
 * 自社生成の投稿は次で取得して同形式に落とすこと:
 *   ssh root@163.44.103.9 '...' （手順は docs/research/README.md）
 *
 * 指標の根拠は shared/jpQualityGuard.ts 冒頭コメント（2026-08-27/28リサーチ）。
 */
import fs from 'node:fs';

const NDESU = /(んです|なんです|んですよ|んですよね|んですけど)/g;
const EMOJI = /(?:[☀-➿✨❗⁉‼]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDEFF]|\uD83E[\uDD00-\uDFFF])️?/g;

function hiraganaRatio(t) {
  let hira = 0, jp = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0);
    const isH = c >= 0x3041 && c <= 0x3096;
    const isK = c >= 0x30a1 && c <= 0x30fa;
    const isKj = (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
    if (isH || isK || isKj) jp++;
    if (isH) hira++;
  }
  return jp ? hira / jp : 0;
}

function parseCorpus(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return raw.split(/^---$/m).map((s) => s.trim()).filter(Boolean).map((block) => {
    const lines = block.split('\n');
    let likes = null;
    const m = lines[lines.length - 1].trim().match(/^(\d+)(?:\s+\d+)?$/);
    if (m) { likes = parseInt(m[1], 10); lines.pop(); }
    return { text: lines.join('\n').trim(), likes };
  }).filter((p) => p.text.length > 0);
}

function stats(posts, label) {
  const n = posts.length;
  if (!n) return console.log(`${label}: 0本`);
  const avg = (f) => posts.reduce((a, p) => a + f(p.text), 0) / n;
  const has = (w) => posts.filter((p) => p.text.includes(w)).length;
  console.log(
    `${label.padEnd(24)} n=${String(n).padEnd(4)}` +
    ` 字数${avg((t) => [...t].length).toFixed(0).padStart(4)}` +
    ` んです/本${avg((t) => (t.match(NDESU) ?? []).length).toFixed(2).padStart(5)}` +
    ` 実は${String(has('実は')).padStart(3)}` +
    ` 正直${String(has('正直')).padStart(3)}` +
    ` ですよね${String(has('ですよね')).padStart(3)}` +
    ` いませんか${String(has('いませんか')).padStart(3)}` +
    ` ✨💦${String(posts.filter((p) => p.text.includes('✨') || p.text.includes('💦')).length).padStart(3)}` +
    ` ！/本${avg((t) => (t.match(/[！!]/g) ?? []).length).toFixed(2).padStart(5)}` +
    ` ひらがな${(avg(hiraganaRatio) * 100).toFixed(0)}%`,
  );
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/jp-research/analyze.mjs <corpus.txt ...>');
  process.exit(1);
}
for (const f of files) {
  const posts = parseCorpus(f);
  stats(posts, f.split('/').pop());
  const withLikes = posts.filter((p) => p.likes != null);
  if (withLikes.length >= 6) {
    stats(withLikes.filter((p) => p.likes >= 20), '  └ 高反応(いいね20+)');
    stats(withLikes.filter((p) => p.likes < 20), '  └ 低反応(<20)');
  }
}
