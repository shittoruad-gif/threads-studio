/**
 * 自然さ目視レビュー用：実生成のフルテキストをそのまま出力する。
 *   npx tsx scripts/review-naturalness.ts
 * 自動判定はせず、人間（レビュアー）が読んで不自然さを評価するためのもの。
 */
import 'dotenv/config';
import { generateThreadsPrompt } from '../shared/threadsPrompts';
import { invokeLLM } from '../server/_core/llm';

const JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'threads_post', strict: true,
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

const scenarios = [
  { name: '個人経営の整体院・共感型・ノウハウON', input: {
    businessType: '整体院', area: '横浜市青葉区', target: '在宅ワークの30代女性',
    mainProblem: '夕方になると肩と首が重くて頭痛もする', strength: '完全予約制で1人ずつ・着替え不要・女性スタッフ',
    postType: 'empathy', treeCount: 0, useThreadsKnowhow: true } },
  { name: '街のパン屋・地域型・リアルタイム実況・ノウハウON', input: {
    businessType: '小さなパン屋', area: '京都市左京区', target: '近所の家族連れと学生',
    mainProblem: '毎日食べても飽きない素朴なパンが近所にない', strength: '国産小麦と自家製酵母・添加物不使用・夕方は半額',
    postType: 'local', treeCount: 0, useThreadsKnowhow: true } },
  { name: '士業(社労士)・専門性型・ツリー2・ノウハウON', input: {
    businessType: '社会保険労務士事務所', area: '名古屋市', target: '従業員10人前後の中小企業の社長',
    mainProblem: '助成金や労務トラブルが不安だが何が使えるか分からない', strength: '初回相談無料・助成金申請に強い・顧問契約は月2万から',
    postType: 'expertise', treeCount: 2, useThreadsKnowhow: true } },
  { name: '美容室・自然スタイル(ノウハウOFF)・カウンセリングあり', input: {
    businessType: '個人美容室', area: '札幌市中央区', target: '40-50代の髪のボリュームと白髪に悩む女性',
    mainProblem: '年齢で髪がぺたんとして白髪も目立つ、でも派手にしたくない', strength: 'マンツーマン・髪と頭皮に優しい薬剤・落ち着いた大人の空間',
    postType: 'empathy', treeCount: 0, useThreadsKnowhow: false,
    counseling: { brandVoice: 'おだやかで上品。お客様を急かさない', realProofs: [], realEpisodes: [], ctaAssets: [], ngList: ['若返り等の誇張はしない'], useThreadsKnowhow: false } } },
  { name: 'カフェ・固定投稿(pinned)・ノウハウON', input: {
    businessType: '自家焙煎コーヒーのカフェ', area: '神戸市灘区', target: '一人時間を大切にする20-40代',
    mainProblem: '落ち着いて長居できるカフェが少ない', strength: '自家焙煎・電源とWi-Fiあり・静かな空間・モーニングあり',
    postType: 'pinned', treeCount: 0, useThreadsKnowhow: true } },
  { name: '学習塾・地域型・ノウハウON', input: {
    businessType: '個人指導の学習塾', area: 'さいたま市浦和区', target: '中学生の保護者',
    mainProblem: '集団塾で成績が伸びず本人も自信をなくしている', strength: '1対2まで・自習室常時開放・定期テスト対策に特化',
    postType: 'local', treeCount: 0, useThreadsKnowhow: true } },
];

(async () => {
  for (const s of scenarios) {
    const prompt = generateThreadsPrompt(s.input as any);
    let parsed: any = null;
    try {
      const res = await invokeLLM({ messages: [{ role: 'user', content: prompt }], response_format: JSON_SCHEMA });
      const c = res.choices?.[0]?.message?.content;
      parsed = typeof c === 'string' ? JSON.parse(c) : null;
    } catch (e: any) {
      console.log(`\n##### ${s.name}\n[ERROR] ${e?.message ?? e}`);
      continue;
    }
    console.log(`\n\n##### ${s.name}`);
    console.log(`業種:${s.input.businessType} / 地域:${s.input.area} / 型:${s.input.postType} / ノウハウ:${(s.input as any).useThreadsKnowhow}`);
    console.log('────────── 本文 ──────────');
    console.log(parsed?.mainPost ?? '(なし)');
    if (Array.isArray(parsed?.treePosts) && parsed.treePosts.length) {
      parsed.treePosts.forEach((t: string, i: number) => { console.log(`\n──── ツリー${i + 1} ────\n${t}`); });
    }
    console.log('\n────────── CTA ──────────');
    console.log(parsed?.cta ?? '(なし)');
    console.log(`\n[本文文字数] ${Array.from(String(parsed?.mainPost ?? '')).length}`);
    console.log(`[hookType] ${parsed?.hookType} / [cvGoal] ${parsed?.cvGoal}`);
  }
})();
