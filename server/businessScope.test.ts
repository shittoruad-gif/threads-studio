import { describe, it, expect } from "vitest";
import { isLocalCatchmentBusiness } from "../shared/businessScope";

describe("商圏型の判定", () => {
  it("実在の3プロジェクトを正しく分ける", () => {
    // Moveact玉島（ピラティス＋整体・美容鍼）→ 商圏型
    expect(isLocalCatchmentBusiness("マシンピラティススタジオ（整体・美容鍼併設）")).toBe(true);
    // Moveact金光（整体）→ 商圏型
    expect(isLocalCatchmentBusiness("整体")).toBe(true);
    // 株式会社しっとる → 非商圏型
    expect(isLocalCatchmentBusiness(
      "Web集客支援（Threads自動投稿アプリ・Instagram広告運用・LINE公式の構築と流入計測・LP制作）"
    )).toBe(false);
  });

  it("来店型の業種はすべて商圏型", () => {
    for (const b of ["鍼灸整骨院", "美容室", "ヘアサロン", "カフェ", "パーソナルジム", "歯科医院", "ネイルサロン"]) {
      expect(isLocalCatchmentBusiness(b)).toBe(true);
    }
  });

  it("来店を伴わない業種は非商圏型", () => {
    for (const b of ["ホームページ制作", "広告運用代行", "オンライン英会話", "ECサイト運営", "経営コンサル"]) {
      expect(isLocalCatchmentBusiness(b)).toBe(false);
    }
  });

  it("実店舗を示す語があれば非商圏語より優先する", () => {
    // 「オンライン予約もできる整体院」は実店舗
    expect(isLocalCatchmentBusiness("オンライン予約対応の整体院")).toBe(true);
  });

  it("未入力・不明は商圏型に倒す", () => {
    expect(isLocalCatchmentBusiness("")).toBe(true);
    expect(isLocalCatchmentBusiness(null)).toBe(true);
    expect(isLocalCatchmentBusiness("よくわからない業種")).toBe(true);
  });
});
