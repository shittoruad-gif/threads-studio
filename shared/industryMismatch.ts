/**
 * 「業種」と「はじめの設定の答え」のズレを見つける。
 *
 * 2026-09-06 に呉服店のお客様が、答えに困って整体向けの選択肢
 * （「美容・見た目を気にする女性」「冷え・むくみ」「自律神経・睡眠ケア」）を
 * そのまま押して登録してしまっていた。このまま投稿を作ると、呉服店の
 * アカウントに整体の投稿が出る。三上様指示で、こうしたズレは運営に通知する。
 *
 * 判定は機械的（AIは使わない）:
 *   1. 答えの中に「別の業種の選択肢」がそのまま入っている（＝押し間違い・迷って押した）
 *   2. 治療院以外の業種なのに、治療院の言葉（肩こり・骨盤矯正・施術 など）が複数の答えに出る
 *      ※ 昔の既定文が治療院向けだったため、これがいちばん多い混入
 */
import { COUNSELING_QUESTIONS } from './counseling';
import { INDUSTRY_PROFILES, detectIndustry } from './industryProfiles';

/** 見る項目（お店の情報の列名 → 何の答えか） */
export const MISMATCH_FIELDS: Record<string, string> = {
  targetRaw: 'お客さん像',
  mainProblemRaw: 'お悩み',
  strengthRaw: '強み',
  uspRaw: '選ぶ理由',
  menuRaw: 'メニュー',
  realEpisodesRaw: 'お客様の話',
  benefitsDailyRaw: '来店後の変化',
  faqRaw: 'よくある質問',
  industryMythsRaw: '業界の常識',
};

/** 「押し間違い」と断定しやすい、中心となる項目 */
const CORE_FIELDS = new Set(['targetRaw', 'mainProblemRaw', 'menuRaw']);

/** 治療院に固有の言葉（他の業種の答えに出たらおかしい） */
const BODYWORK_TERMS = ['骨盤矯正', '肩こり', '腰痛', '鍼灸', '自律神経', '五十肩', '膝の痛み', '整体', '施術', '猫背'];

/** 治療院の言葉が出ても不自然ではない業種（ジム・美容・クリニックは体の話をする） */
const BODYWORK_TERMS_OK_GROUPS = new Set(['bodywork', 'fitness', 'beauty', 'clinic', 'general']);

export interface MismatchHit {
  /** どの答えに */
  field: string;
  fieldLabel: string;
  /** 何が入っていたか */
  term: string;
  /** どの業種の言葉か */
  group: string;
  groupLabel: string;
}

export interface MismatchResult {
  mismatch: boolean;
  /** 答えた業種（Q1）から判定したくくり */
  declared: { key: string; label: string; raw: string };
  hits: MismatchHit[];
  /** 人が読む一文（通知・点検に使う） */
  summary: string;
}

/** 業種ごとの「その業種の選択肢」一覧（既定文＝治療院の選択肢も含める） */
function chipLexicon(): Map<string, { label: string; chips: Set<string> }> {
  const lex = new Map<string, { label: string; chips: Set<string> }>();
  for (const p of INDUSTRY_PROFILES) {
    if (p.key === 'general') continue; // 中立の候補は「別の業種」の根拠にしない
    const chips = new Set<string>();
    for (const o of Object.values(p.q ?? {})) for (const c of o.suggestions ?? []) chips.add(c);
    lex.set(p.key, { label: p.label, chips });
  }
  // 既定の質問文の候補は治療院向け
  const bw = lex.get('bodywork');
  if (bw) {
    for (const q of COUNSELING_QUESTIONS) {
      if (!(q.id in MISMATCH_FIELDS)) continue;
      for (const c of q.suggestions ?? []) bw.chips.add(c);
    }
  }
  return lex;
}

let _lex: ReturnType<typeof chipLexicon> | null = null;
const lexicon = () => (_lex ??= chipLexicon());

/** 答えを、選択肢と比べられる粒度に分ける */
function pieces(value: string): string[] {
  return String(value || '')
    .split(/\r?\n|、|／|\/|;|；/)
    .map((s) => s.trim().replace(/^[-・*•]+\s*/, ''))
    .filter((s) => s.length > 0);
}

/**
 * 業種と答えのズレを判定する。
 * @param businessTypeRaw Q1の答え（お店の情報の businessType でもよい）
 * @param answers 各質問の答え（キーは MISMATCH_FIELDS のもの。無い項目は飛ばす）
 */
export function detectIndustryMismatch(
  businessTypeRaw: string | null | undefined,
  answers: Record<string, string | null | undefined>,
): MismatchResult {
  const det = detectIndustry(businessTypeRaw);
  const declaredKey = det.group.key;
  const declared = { key: declaredKey, label: det.label, raw: String(businessTypeRaw || '').trim() };
  const lex = lexicon();
  const own = lex.get(declaredKey)?.chips ?? new Set<string>();
  const entries = Array.from(lex.entries());
  const chipHits: MismatchHit[] = [];   // 別の業種の選択肢がそのまま入っている
  const termHits: MismatchHit[] = [];   // 治療院の言葉が入っている
  const seen = new Set<string>();

  for (const [field, fieldLabel] of Object.entries(MISMATCH_FIELDS)) {
    const value = answers[field];
    if (!value) continue;
    // 1. 別の業種の選択肢がそのまま入っている（＝押し間違い・迷って押した）
    for (const piece of pieces(value)) {
      if (own.has(piece)) continue;
      for (const [key, { label, chips }] of entries) {
        if (key === declaredKey || !chips.has(piece)) continue;
        if (seen.has(`${field}:${piece}`)) continue;
        seen.add(`${field}:${piece}`);
        chipHits.push({ field, fieldLabel, term: piece, group: key, groupLabel: label });
      }
    }
    // 2. 治療院の言葉（治療院・体を扱う業種以外に出たらおかしい）
    if (!BODYWORK_TERMS_OK_GROUPS.has(declaredKey)) {
      for (const t of BODYWORK_TERMS) {
        if (!String(value).includes(t) || seen.has(`${field}:kw:${t}`)) continue;
        seen.add(`${field}:kw:${t}`);
        termHits.push({ field, fieldLabel, term: t, group: 'bodywork', groupLabel: '治療院・整体' });
      }
    }
  }

  const hits = [...chipHits, ...termHits];
  const coreChipHits = chipHits.filter((h) => CORE_FIELDS.has(h.field));
  const fieldsWithHits = new Set(hits.map((h) => h.field));

  // 業種が分からない（その他）ときは、別の業種の選択肢が2つ以上あるときだけ
  const mismatch = declaredKey === 'general'
    ? chipHits.length >= 2
    : coreChipHits.length >= 1 || chipHits.length >= 2 || fieldsWithHits.size >= 2;

  const summary = mismatch
    ? `業種は「${declared.raw || declared.label}」（${det.label}）ですが、` +
      hits.slice(0, 4).map((h) => `${h.fieldLabel}に「${h.term}」（${h.groupLabel}の言葉）`).join('、') +
      (hits.length > 4 ? ` ほか${hits.length - 4}件` : '') + ' が入っています。'
    : '';

  return { mismatch, declared, hits, summary };
}

/**
 * お店の情報（projects の行）から答えを取り出して判定する。
 * counselingResult.rawAnswers があればそれを、無ければ列の値を使う。
 */
export function detectProjectIndustryMismatch(project: {
  businessType?: string | null;
  target?: string | null;
  mainProblem?: string | null;
  strength?: string | null;
  usp?: string | null;
  n1Customer?: string | null;
  counselingResult?: string | null;
}): MismatchResult {
  let raw: Record<string, string> = {};
  if (project.counselingResult) {
    try { raw = JSON.parse(project.counselingResult)?.rawAnswers ?? {}; } catch { raw = {}; }
  }
  const answers: Record<string, string | null | undefined> = {
    targetRaw: raw.targetRaw ?? project.target,
    mainProblemRaw: raw.mainProblemRaw ?? project.mainProblem,
    strengthRaw: raw.strengthRaw ?? project.strength,
    uspRaw: raw.uspRaw ?? project.usp,
    menuRaw: raw.menuRaw,
    realEpisodesRaw: raw.realEpisodesRaw ?? project.n1Customer,
    benefitsDailyRaw: raw.benefitsDailyRaw,
    faqRaw: raw.faqRaw,
    industryMythsRaw: raw.industryMythsRaw,
  };
  return detectIndustryMismatch(raw.businessTypeRaw ?? project.businessType, answers);
}
