import { describe, it, expect } from "vitest";
import { applyPersonalOverrides, PERSONAL_EXCLUDED_ANGLE_IDS, personalModePromptOverride, isPersonalMode } from "../shared/personalBrand";
import { COUNSELING_QUESTIONS } from "../shared/counseling";
import { activeAngles, pickAngle, getAngle, PERSONAL_EXTRA_ANGLES, POST_ANGLES } from "../shared/postAngles";
import { buildCtaText } from "../shared/autoPostCta";

describe("個人ブランディングモード: カウンセリング", () => {
  it("質問数と保存先IDは店舗モードと完全に同じ（保存スキーマ互換）", () => {
    const personal = applyPersonalOverrides(COUNSELING_QUESTIONS);
    expect(personal.map(q => q.id)).toEqual(COUNSELING_QUESTIONS.map(q => q.id));
  });

  it("主要質問が個人向けに言い換えられる", () => {
    const personal = applyPersonalOverrides(COUNSELING_QUESTIONS);
    const bt = personal.find(q => q.id === 'businessTypeRaw')!;
    expect(bt.prompt).toContain('どんな仕事・活動');
    expect(bt.suggestions).toContain('コーチ');
    const target = personal.find(q => q.id === 'targetRaw')!;
    expect(target.prompt).toContain('ファンになってほしい');
  });

  it("個人モードでは地域が必須でなくなる（オンライン活動を想定）", () => {
    const personal = applyPersonalOverrides(COUNSELING_QUESTIONS);
    expect(personal.find(q => q.id === 'areaRaw')!.required).toBe(false);
    // 店舗モードは必須のまま（回帰確認）
    expect(COUNSELING_QUESTIONS.find(q => q.id === 'areaRaw')!.required).toBe(true);
  });
});

describe("個人ブランディングモード: 切り口", () => {
  it("個人プールは来店・商圏の切り口を含まず、持論・失敗談・過程を含む", () => {
    const ids = activeAngles(Date.now(), 'personal').map(a => a.id);
    for (const ex of PERSONAL_EXCLUDED_ANGLE_IDS) expect(ids).not.toContain(ex);
    expect(ids).toContain('opinion');
    expect(ids).toContain('failure_story');
    expect(ids).toContain('journey');
  });

  it("店舗モードのプールは従来どおり（個人用の切り口が混ざらない）", () => {
    // 集中検証期間外の時刻で全プールを確認
    const after = Date.parse('2026-09-12T12:00:00+09:00');
    const ids = activeAngles(after, 'store').map(a => a.id);
    expect(ids).toEqual(POST_ANGLES.map(a => a.id));
    for (const extra of PERSONAL_EXTRA_ANGLES) expect(ids).not.toContain(extra.id);
  });

  it("pickAngleは個人モードで除外切り口を絶対に返さない", () => {
    for (let i = 0; i < 200; i++) {
      const a = pickAngle({}, Math.random, undefined, Date.now(), 'personal');
      expect(PERSONAL_EXCLUDED_ANGLE_IDS).not.toContain(a.id);
    }
  });

  it("getAngleが個人用切り口も解決する（履歴表示用）", () => {
    expect(getAngle('opinion')?.label).toBe('持論・スタンス');
    expect(getAngle('aruaru')?.label).toBe('あるある');
  });
});

describe("個人ブランディングモード: CTA", () => {
  const lineLinks = JSON.stringify([{ id: 'l1', type: 'line', label: '公式LINE', url: 'https://line.me/x' }]);

  it("LINEありの個人モードは、予約・来店の言葉を使わない", () => {
    const cta = buildCtaText({ links: lineLinks, businessType: 'コーチ', mode: 'personal' })!;
    expect(cta).not.toContain('ご予約');
    expect(cta).not.toContain('ご来店');
    expect(cta).toContain('公式LINE');
  });

  it("個人モードでは予約リンクがあっても「ご予約」と言わない（汎用の案内に落ちる）", () => {
    const rsv = JSON.stringify([{ id: 'r1', type: 'reservation', label: '予約', url: 'https://rsv.example' }]);
    const cta = buildCtaText({ links: rsv, businessType: 'コーチ', mode: 'personal' })!;
    expect(cta).not.toContain('ご予約');
    expect(cta).toContain('プロフィールのリンク');
  });

  it("店舗モードのCTAは従来どおり（回帰確認）", () => {
    const cta = buildCtaText({ links: lineLinks, businessType: '整体院', mode: 'store' })!;
    expect(cta).toContain('ご相談・ご予約');
  });
});

describe("個人ブランディングモード: プロンプト上書き", () => {
  it("店舗表現の禁止とファンづくりのゴールが明記される", () => {
    const o = personalModePromptOverride();
    expect(o).toContain('ご来店');
    expect(o).toContain('ファン');
    expect(o).toContain('最優先');
  });

  it("isPersonalModeの判定", () => {
    expect(isPersonalMode('personal')).toBe(true);
    expect(isPersonalMode('store')).toBe(false);
    expect(isPersonalMode(null)).toBe(false);
    expect(isPersonalMode(undefined)).toBe(false);
  });
});
