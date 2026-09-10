import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BANNED_TIC_PHRASES, CRUTCH_WORDS } from "../shared/jpQualityGuard";

/**
 * プロンプトの自己矛盾を検出する回帰テスト。
 *
 * 2026-08-26の劣化事故も、2026-09-10の週次リサーチで見つけた
 * 「正直、」10本／「思っていませんか」1本の流出も、原因は同じ型だった:
 * **プロンプトが禁止語を「お手本・例」として自分で書いていた**。
 * ガードはリライト後しか強制できず、生成本文に最初から入っていると
 * 差し戻し先も汚染されているため公開まで通ってしまう。
 *
 * そこで「禁止語がプロンプトに出てよいのは、それを禁じている行だけ」を機械で守る。
 * 新しいお手本を書くときにうっかり禁止語を例示したら、このテストが落ちる。
 */

const ROOT = path.resolve(__dirname, "..");

/** 生成・リライトのプロンプトを持つファイル（ここに例示が混ざると事故になる） */
const PROMPT_FILES = [
  "shared/threadsPrompts.ts",
  "server/autoPostScheduler.ts",
];

/**
 * 「その語を禁じている／避けさせている」ことを示す言葉。
 * この語を含む行でだけ、禁止語をそのまま書いてよい（読み手に何がダメか示すため）。
 */
const PROHIBITION_MARKERS = [
  "禁止", "使わず", "避け", "ダメ", "NG", "不可", "混入", "常套句", "負け筋",
];

/**
 * 「〜ない」で終わる否定の指示（使わない・書かない・締めない・始めない…）を
 * 語尾の形でまとめて拾う。「〜ません」は丁寧形の平文にも出るので含めない。
 */
const NEGATIVE_INSTRUCTION = /[ぁ-んァ-ヶ一-龥](ない|ず)(\*\*|。|、|（|\)|）|$|で|に|よう|こと)/;

function isProhibitionLine(line: string): boolean {
  return PROHIBITION_MARKERS.some((m) => line.includes(m)) || NEGATIVE_INSTRUCTION.test(line);
}

/** 見出し行（【…】/ ■ / 1) …）か */
function isHeading(line: string): boolean {
  return /^\s*(【|■|#{1,3}\s|\d+\)\s)/.test(line);
}

/** 「書いてはいけないもの」系の見出しか（その配下は全部が禁止事項） */
function isProhibitionHeading(line: string): boolean {
  return /(禁止|書いてはいけない|してはいけない|使ってはいけない|NG|避ける|不合格)/.test(line);
}

/** コメント行（// や * で始まる説明）は生成に渡らないので対象外 */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

describe("プロンプトが禁止語を自分でお手本にしていないか", () => {
  for (const rel of PROMPT_FILES) {
    it(`${rel}: 決まり文句が「禁止と書いていない行」に現れない`, () => {
      const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
      const offenders: string[] = [];
      let underProhibitionHeading = false;
      lines.forEach((line, i) => {
        if (isHeading(line)) underProhibitionHeading = isProhibitionHeading(line);
        if (isCommentLine(line) || underProhibitionHeading || isProhibitionLine(line)) return;
        for (const p of BANNED_TIC_PHRASES) {
          if (line.includes(p)) offenders.push(`${rel}:${i + 1} 「${p}」 → ${line.trim()}`);
        }
      });
      expect(offenders, `禁止語をお手本として書いている行:\n${offenders.join("\n")}`).toEqual([]);
    });
  }

  it("リライトプロンプトが『足してはいけない言葉』を自分で推奨していない", () => {
    // CRUTCH_WORDS（実は・正直・ぶっちゃけ・ちなみに）は
    // 「元の文に無いのに足す」ことが禁止されている。
    // リライトプロンプトの【人のぬくもり】が「正直」を例示していたのが
    // 2026-09-10に見つかった最大の流出源（10/186本）。
    const src = fs.readFileSync(path.join(ROOT, "server/autoPostScheduler.ts"), "utf8");
    const warmth = src.split("【人のぬくもり")[1]?.split("【")[0] ?? "";
    expect(warmth.length).toBeGreaterThan(0);
    for (const w of CRUTCH_WORDS) {
      if (!warmth.includes(w)) continue;
      // 出てよいのは「使わない」と書いている行だけ
      const bad = warmth.split("\n").filter((l) => l.includes(w) && !isProhibitionLine(l));
      expect(bad, `【人のぬくもり】が「${w}」を推奨している: ${bad.join(" / ")}`).toEqual([]);
    }
  });

  it("お手本の例文そのものに決まり文句・常套句が入っていない", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/autoPostScheduler.ts"), "utf8");
    const sample = src.split("【お手本の形")[1]?.split("`;")[0] ?? "";
    expect(sample.length).toBeGreaterThan(0);
    for (const p of [...BANNED_TIC_PHRASES, "正直、", "実は"]) {
      expect(sample.includes(p), `お手本の例文に「${p}」が入っている（そのままコピーされる）`).toBe(false);
    }
  });
});
