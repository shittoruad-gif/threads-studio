/**
 * 規約類のバージョン（同意記録用の単一の情報源）。
 * 利用規約・プライバシーポリシー・特定商取引法に基づく表記のいずれかを
 * 実質的に改定したら、必ずこの値を上げること。
 * 登録時にこの値をユーザーごとに保存し、「どの版に同意したか」を示せるようにする。
 */
export const LEGAL_VERSION = "2026-09-01";

/** 同意の対象（画面の表示と登録記録で同じ文言を使う） */
export const LEGAL_DOCS = [
  { key: "terms", label: "利用規約", path: "/terms" },
  { key: "privacy", label: "プライバシーポリシー", path: "/privacy" },
  { key: "commercial", label: "特定商取引法に基づく表記", path: "/commercial-transaction" },
] as const;
