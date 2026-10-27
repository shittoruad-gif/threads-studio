/**
 * マカセルから呼ばれる口（2026-10-28 index.ts から移した）。どちらも合言葉 MEDIA_INTAKE_SECRET（x-media-secret）が要る。
 *  - POST /api/media/intake      マカセルの動画を受け取る（マカセルがプランを確かめてから送る）
 *  - POST /api/media/link-check  マカセルの設定画面の「確かめる」。会員がいるか・プロ以上かの2つだけを返す
 * 中身の処理は mediaItems.ts。テストでは deps に差し替えを渡す（DBにつながない）。
 */
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";

export interface MediaApiDeps {
  secretOk: (given: unknown) => boolean;
  intakeVideo: (input: { email: string; videoUrl: string; title?: string; sourceRef: string }) => Promise<unknown>;
  linkCheck: (email: string) => Promise<{ ok: boolean; found: boolean; proOrAbove: boolean }>;
}

const defaultDeps = async (): Promise<MediaApiDeps> => {
  const mi = await import("./mediaItems");
  return { secretOk: mi.mediaSecretOk, intakeVideo: mi.intakeVideo, linkCheck: mi.linkCheck };
};

export function registerMediaApi(app: Express, deps?: MediaApiDeps): void {
  const get = async () => deps ?? (await defaultDeps());

  app.post("/api/media/intake", express.json(), async (req, res) => {
    const d = await get();
    if (!d.secretOk(req.headers["x-media-secret"])) return res.status(401).json({ ok: false });
    try {
      const b = req.body || {};
      const r = await d.intakeVideo({ email: String(b.email || ""), videoUrl: String(b.videoUrl || ""), title: b.title ? String(b.title) : undefined, sourceRef: String(b.sourceRef || "") });
      return res.json(r);
    } catch (e) {
      console.error("[Media] 動画の受け取りに失敗:", e);
      return res.status(500).json({ ok: false });
    }
  });

  // 「確かめる」は人が押す物なので回数は少ない。メールアドレスの当てずっぽうを防ぐため、15分で300回まで
  // （呼ぶのはマカセルのサーバー1台＝全お客様で同じIP。マカセル側でも1アカウント10分20回に絞っている）
  const linkCheckLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { ok: false } });
  app.post("/api/media/link-check", linkCheckLimiter, express.json(), async (req, res) => {
    const d = await get();
    if (!d.secretOk(req.headers["x-media-secret"])) return res.status(401).json({ ok: false });
    try {
      const r = await d.linkCheck(String(req.body?.email || ""));
      // 返すのは真偽の2つだけ（名前・番号・プラン名は返さない）
      return res.json({ ok: !!r.ok, found: !!r.found, proOrAbove: !!r.proOrAbove });
    } catch (e) {
      console.error("[Media] つながりの確認に失敗:", e);
      return res.status(500).json({ ok: false });
    }
  });
}
