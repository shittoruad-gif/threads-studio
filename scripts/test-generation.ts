/**
 * 生成品質チェックスクリプト（手動実行・コミット対象外想定）
 *
 *   npx tsx scripts/test-generation.ts
 *
 * 1) 多パターンでプロンプトを構築し、テンプレ崩れ/矛盾/空セクションを静的検査
 * 2) 実際に LLM を呼んで生成し、JSON妥当性・捏造・規制違反・不自然さを検査
 */
import 'dotenv/config';
import { generateThreadsPrompt } from '../shared/threadsPrompts';
import { invokeLLM } from '../server/_core/llm';

const JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'threads_post',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, mainPost: { type: 'string' },
        treePosts: { type: 'array', items: { type: 'string' } },
        cta: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } },
        goal: { type: 'string' }, improvement: { type: 'string' },
        expectedEffect: { type: 'string' }, timingCandidate: { type: 'string' },
        weeklyImprovementPoint: { type: 'string' }, hookType: { type: 'string' },
        cvGoal: { type: 'string' },
      },
      required: ['title','mainPost','treePosts','cta','hashtags','goal','improvement','expectedEffect','timingCandidate','weeklyImprovementPoint','hookType','cvGoal'],
      additionalProperties: false,
    },
  },
};

type Scenario = {
  name: string;
  input: any;
  // 生成結果に「絶対あってはいけない」語（業種規制 + 捏造チェック）
  forbidden: RegExp[];
};

const scenarios: Scenario[] = [
  {
    name: '整体院・local型・カウンセリングなし・ノウハウON',
    input: {
      businessType: '整体院', area: '横浜市港北区',
      target: 'デスクワークの30-40代女性', mainProblem: '慢性の肩こり腰痛',
      strength: '国家資格・完全予約制', postType: 'local', treeCount: 0,
      useThreadsKnowhow: true,
    },
    forbidden: [/治る/, /治療/, /完治/, /必ず[治改]/],
  },
  {
    name: '整体院・proof型・カウンセリング(実績なし)・捏造抑制確認',
    input: {
      businessType: '整体院', area: '横浜市', target: '腰痛の方',
      mainProblem: '腰痛', strength: '丁寧な施術', postType: 'proof', treeCount: 0,
      useThreadsKnowhow: true,
      counseling: { realProofs: [], realEpisodes: [], ctaAssets: [], ngList: ['「治る」は使わない'], useThreadsKnowhow: true },
    },
    // 実績ゼロ宣言なのに数字を捏造したら検出（年/名/%等の社会的証明）
    forbidden: [/治る/, /\d+\s*年営業/, /のべ\d+/, /\d+名以上/, /満足度\d+%/],
  },
  {
    name: '美容エステ・empathy型・ノウハウOFF(自然スタイル)',
    input: {
      businessType: '美容エステサロン', area: '大阪市北区',
      target: '40代女性', mainProblem: '肌のたるみ・くすみ',
      strength: '完全個室・オーダーメイド', postType: 'empathy', treeCount: 0,
      useThreadsKnowhow: false,
    },
    forbidden: [/シミが消える/, /若返/, /アンチエイジング/, /必ず/, /#/],
  },
  {
    name: '飲食店・local型・リアルタイム実況狙い・ノウハウON',
    input: {
      businessType: 'ベーカリーカフェ', area: '福岡市中央区',
      target: '近隣の20-40代', mainProblem: '休日に行ける美味しいパン屋を探している',
      strength: '国産小麦・毎朝焼きたて', postType: 'local', treeCount: 0,
      useThreadsKnowhow: true,
    },
    forbidden: [/日本一/, /No\.?1/, /#/],
  },
  {
    name: '税理士・story型・ツリー3つ・ノウハウON',
    input: {
      businessType: '税理士事務所', area: '東京都千代田区',
      target: '個人事業主', mainProblem: '確定申告・節税が不安',
      strength: '初回相談無料・オンライン対応', postType: 'story', treeCount: 3,
      useThreadsKnowhow: true,
    },
    forbidden: [/必ず節税/, /100%/, /絶対/, /#/],
  },
  {
    name: 'パーソナルジム・offer型・スタイル校正あり・ノウハウON',
    input: {
      businessType: 'パーソナルトレーニングジム', area: '名古屋市中区',
      target: '運動不足の30代', mainProblem: '体型が気になる',
      strength: '完全マンツーマン', postType: 'offer', treeCount: 0,
      useThreadsKnowhow: true,
      stylePreference: { tone: 'gentle', length: 'short', emojiUsage: 'minimal', summary: 'やわらかく寄り添う' },
    },
    forbidden: [/必ず痩せる/, /\d+kg(減|痩)/, /医療レベル/, /#/],
  },
];

// ── 静的検査 ───────────────────────────────────────────────
function staticChecks(name: string, prompt: string): string[] {
  const issues: string[] = [];
  // 未解決テンプレ
  if (/\$\{[^}]*\}/.test(prompt)) issues.push('未解決の ${...} が残存');
  if (/undefined|null|NaN|\[object Object\]/.test(prompt)) issues.push('undefined/null/[object Object] 混入');
  // 必須セクション
  if (!/出力形式|必須JSON|"mainPost"/.test(prompt)) issues.push('出力JSON形式の指示が無い');
  if (!/事実ベース/.test(prompt)) issues.push('事実ベースルールが無い');
  if (!/ハッシュタグ|#/.test(prompt)) issues.push('ハッシュタグ禁止の指示が無い');
  if (!/2026年Threads(アルゴリズム最新傾向|店舗集客の最新傾向)/.test(prompt)) issues.push('2026年傾向ブロックが無い');
  if (!/広告規制|薬機法|景品表示法/.test(prompt)) issues.push('広告規制セクションが無い');
  // 連続空行・極端な長さ
  if (/\n{5,}/.test(prompt)) issues.push('過剰な空行（5連以上）');
  if (prompt.length < 500) issues.push('プロンプトが異常に短い');
  return issues;
}

// ── 生成結果検査 ────────────────────────────────────────────
function outputChecks(s: Scenario, raw: string): { ok: boolean; notes: string[]; parsed?: any } {
  const notes: string[] = [];
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, notes: ['JSON parse 失敗'], }; }

  const main = String(parsed.mainPost ?? '');
  const cta = String(parsed.cta ?? '');
  const tree: string[] = Array.isArray(parsed.treePosts) ? parsed.treePosts : [];
  const full = [main, ...tree, cta].join('\n');

  // 必須キー
  for (const k of ['title','mainPost','treePosts','cta','hashtags','goal','improvement','expectedEffect','timingCandidate','weeklyImprovementPoint','hookType','cvGoal']) {
    if (!(k in parsed)) notes.push(`キー欠落: ${k}`);
  }
  // hashtags 空
  if (Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0) notes.push(`hashtags が空でない: ${JSON.stringify(parsed.hashtags)}`);
  if (full.includes('#')) notes.push('本文/CTAに # が混入');
  // treeCount 整合
  const expectTree = s.input.treeCount ?? 3;
  if (s.input.treeCount === 0 && tree.length !== 0) notes.push(`treeCount=0 なのに treePosts ${tree.length}件`);
  if (s.input.treeCount > 0 && tree.length !== expectTree) notes.push(`treePosts 数不一致 期待${expectTree} 実${tree.length}`);
  // 禁止語（規制・捏造）
  for (const re of s.forbidden) {
    if (re.test(full)) notes.push(`禁止パターン検出 ${re}: 該当あり`);
  }
  // AI臭い定型
  if (/(いかがでしたか|お伝えします|解説します|まとめると|この記事では|続きはツリー)/.test(full)) {
    notes.push('AI臭い定型表現');
  }
  // 1行目に絵文字/URL
  const firstLine = main.split('\n')[0] ?? '';
  if (/https?:\/\//.test(firstLine)) notes.push('1行目にURL');
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(firstLine)) notes.push('1行目に絵文字');
  // 文字数（本文のみモードは長すぎ注意）
  const len = Array.from(main).length;
  if (s.input.treeCount === 0 && len > 480) notes.push(`本文が長い ${len}字`);
  if (len < 30) notes.push(`本文が短すぎ ${len}字`);
  // 生テンプレ混入
  if (/\$\{|undefined|\[object/.test(full)) notes.push('生成文に未解決テンプレ/undefined');

  return { ok: notes.length === 0, notes, parsed };
}

(async () => {
  let staticFail = 0, genFail = 0;
  for (const s of scenarios) {
    const prompt = generateThreadsPrompt(s.input);
    const si = staticChecks(s.name, prompt);
    console.log(`\n══ ${s.name} ══`);
    console.log(`  [静的] プロンプト${prompt.length}字 ${si.length ? '❌ ' + si.join(' / ') : '✅ 問題なし'}`);
    if (si.length) staticFail++;

    try {
      const res = await invokeLLM({ messages: [{ role: 'user', content: prompt }], response_format: JSON_SCHEMA });
      const content = res.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        console.log('  [生成] ❌ LLM応答が空');
        genFail++;
        continue;
      }
      const r = outputChecks(s, content);
      console.log(`  [生成] ${r.ok ? '✅ 問題なし' : '❌ ' + r.notes.join(' / ')}`);
      if (r.parsed) {
        const m = String(r.parsed.mainPost ?? '').replace(/\n/g, ' / ');
        console.log(`  └ 1行目: ${(String(r.parsed.mainPost ?? '').split('\n')[0] || '').slice(0, 60)}`);
        console.log(`  └ 本文: ${m.slice(0, 140)}${m.length > 140 ? '…' : ''}`);
        console.log(`  └ CTA : ${String(r.parsed.cta ?? '').slice(0, 80)}`);
      }
      if (!r.ok) genFail++;
    } catch (e: any) {
      console.log(`  [生成] ❌ 例外: ${e?.message ?? e}`);
      genFail++;
    }
  }
  console.log(`\n========\n静的NG: ${staticFail}/${scenarios.length}  生成NG: ${genFail}/${scenarios.length}`);
  process.exit(staticFail + genFail > 0 ? 1 : 0);
})();
