/**
 * 1つの投稿から、同じ内容でいろいろな形の投稿を作る（2026-10-04 三上様指示・プロプラン以上）。
 * 指示文・型・返事の検証は shared/postVariations.ts。ここは通信と、自動の投稿と同じ検査をかける部分。
 *
 * 検査（自動の投稿と同じ考え方・ガードは緩めない）：
 *  - NGワード（登録された「使わない言葉」）を含む案は出さない
 *  - 健康系のお店は医療の言い方を言い換える（診断→チェック 等・shared/healthClaimGuard.ts）
 *  - 事実ガード（受賞・先着・満足度◯% など、裏付けの無い主張の文を外す・shared/factGuard.ts）
 *  - 作り話チェック（登録情報に無い出来事・気持ち・日付・数字・料金。外せなければその案は出さない）
 */
import { invokeLLM } from './_core/llm';
import {
  buildVariationsPrompt, parseVariations, pickPatterns, VARIATIONS_SCHEMA, type VariationDraft,
} from '../shared/postVariations';

export interface VariationsResult {
  drafts: VariationDraft[];
  /** 検査で出さなかった案の数（作り話・NGワード） */
  dropped: number;
}

export async function generatePostVariations(opts: {
  source: string;
  project: any;
  count: number;
  offset?: number;
}): Promise<VariationsResult> {
  const { project } = opts;
  const patterns = pickPatterns(opts.count, opts.offset ?? 0);
  const { parseNgWords, containsNgWord } = await import('../shared/ngwords');
  const ngWords = parseNgWords(project?.ngWords || null);
  let counseling: any = null;
  try { counseling = project?.counselingResult ? JSON.parse(project.counselingResult) : null; } catch { counseling = null; }
  const { factsText, checkFabrication } = await import('./fabricationCheck');
  const facts = factsText([
    ['元の投稿', opts.source],
    ['お店の名前', project?.storeName], ['業種', project?.businessType], ['地域', project?.area],
    ['地域の言葉', project?.localTerms], ['お客様像', project?.target], ['お悩み', project?.mainProblem],
    ['強み', project?.strength], ['実績', project?.proof], ['ほかとの違い', project?.usp],
    ['キャッチコピー', project?.catchphrase], ['案内先（リンク）', project?.links],
    ['実際のお客様の話', project?.n1Customer], ['考え方', project?.belief], ['お客様の言葉', project?.customerWords],
    ['はじめの設定の答え', counseling],
    ['本人が書いた文体のお手本', String(project?.styleSamples || '').slice(0, 2500)],
  ]);

  const res = await invokeLLM({
    temperature: 0.7,
    response_format: VARIATIONS_SCHEMA,
    messages: [{ role: 'user', content: buildVariationsPrompt({
      source: opts.source, facts, patterns, ngWords,
      voice: counseling?.brandVoice ?? null,
    }) }],
  });
  const raw = String(res.choices[0]?.message?.content ?? '');
  const parsed = parseVariations(raw, patterns, opts.source);

  const { isHealthBusiness, softenMedicalWords } = await import('../shared/healthClaimGuard');
  const health = isHealthBusiness(project?.businessType);
  const { scrubText, buildSupportedFacts } = await import('../shared/factGuard');
  const supported = buildSupportedFacts(
    opts.source, project?.businessType, project?.area, project?.localTerms, project?.strength, project?.proof,
    project?.usp, project?.n1Customer, project?.belief, project?.customerWords,
    counseling?.realProofs, counseling?.menu, counseling?.realEpisodes, counseling?.ctaAssets, counseling?.faq, counseling?.hoursInfo,
  );
  const { removeFabricatedSentences } = await import('../shared/fabricationCheck');

  let dropped = 0;
  const checked = await Promise.all(parsed.map(async (d) => {
    let text = health ? softenMedicalWords(d.text) : d.text;
    text = scrubText(text, supported, { allowEmpty: true }).text.trim();
    if (!text || containsNgWord(text, ngWords)) return null;
    const found = await checkFabrication(text, facts);
    if (found && found.length > 0) {
      const cleaned = removeFabricatedSentences(text, found);
      if (!cleaned) return null;
      const again = await checkFabrication(cleaned, facts);
      if (again && again.length > 0) return null;
      text = cleaned;
    }
    return { ...d, text };
  }));
  const drafts = checked.filter((x): x is VariationDraft => !!x);
  dropped = parsed.length - drafts.length + Math.max(0, patterns.length - parsed.length);
  return { drafts, dropped };
}
