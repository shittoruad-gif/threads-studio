import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Meta/Threads の signed_request を検証してペイロードを返す（不正なら null）。
 * 署名 = HMAC-SHA256(payload, appSecret)。検証なしだと偽造リクエストで
 * 任意ユーザーのデータ削除/解除ができてしまうため必須。
 */
function parseSignedRequest(signed: any, appSecret: string): any | null {
  if (!signed || typeof signed !== "string" || !signed.includes(".")) return null;
  if (!appSecret) { console.error("[SignedRequest] THREADS_APP_SECRET 未設定のため検証不可"); return null; }
  const [encSig, encPayload] = signed.split(".");
  const toStd = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/");
  let sig: Buffer, payloadJson: string;
  try {
    sig = Buffer.from(toStd(encSig), "base64");
    payloadJson = Buffer.from(toStd(encPayload), "base64").toString("utf8");
  } catch { return null; }
  const expected = createHmac("sha256", appSecret).update(encPayload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try { return JSON.parse(payloadJson); } catch { return null; }
}

declare global {
  // Univapay Webhook の重複イベント排除用（生ボディのハッシュを一定時間記憶）
  var __univapayWebhookSeen: { h: string; ts: number }[] | undefined;
}
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import * as db from "../db";
import { createApprovalToken, verifyApprovalToken } from "../approvalToken";
import { initTrialReminderScheduler } from "../trialReminder";
import { initPaymentFollowUpScheduler } from "../paymentFollowUp";
import { startTokenRefreshJob } from "../tokenRefreshJob";

/**
 * Univapay Webhookでプランを特定できず手続きが宙に浮いたとき、ユーザーへ案内する。
 * これがないと、ユーザーは「登録したのに有料機能が使えない」状態に無音で放置される（欠点#1）。
 * ベストエフォート（送信失敗は握りつぶす）。
 */
async function notifyPlanResolutionIssueToUser(email: string | null | undefined): Promise<void> {
  try {
    if (!email) return;
    const base = process.env.APP_BASE_URL || 'https://threads-studio.com';
    const { sendEmail } = await import('./notification');
    await sendEmail({
      to: email,
      subject: '【Threads Studio】ご登録手続きの確認のお願い',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>ご登録手続きの確認のお願い</h2>
        <p>お支払い手続きは受け付けましたが、プランの自動判定に問題が発生しました。</p>
        <p>恐れ入りますが、ダッシュボードからプランのご状態をご確認いただくか、サポートまでご連絡ください。担当者が確認し、すぐに有料機能を有効化いたします。</p>
        <a href="${base}/dashboard" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">ダッシュボードを開く</a>
      </div>`,
    });
  } catch (e) {
    console.error('[Univapay Webhook] notifyPlanResolutionIssueToUser error:', e);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Validate environment variables
  const { validateEnv } = await import("./env");
  validateEnv();

  // Initialize Sentry error tracking
  const { initSentry } = await import("../sentry");
  initSentry();

  // プロセス全体の保険：未処理の例外/Promise拒否でプロセスが落ちないようにする。
  // 自動投稿cronなどバックグラウンド処理の想定外エラーでサーバが停止すると、
  // 全ユーザーの投稿・ログインが止まるため、ログ＋オーナー通知して継続する。
  // （多重登録を避けるためフラグでガード）
  if (!(globalThis as any).__processGuardsInstalled) {
    (globalThis as any).__processGuardsInstalled = true;
    const reportFatal = async (label: string, err: unknown) => {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      console.error(`[Process] ${label}:`, msg);
      try {
        const { notifyOwner } = await import("./notification");
        await notifyOwner({ title: `サーバ未処理エラー: ${label}`, content: msg.slice(0, 1500) });
      } catch (e) {
        console.error('[Process] failed to notify owner about fatal:', e);
      }
    };
    process.on('unhandledRejection', (reason) => { void reportFatal('unhandledRejection', reason); });
    process.on('uncaughtException', (err) => { void reportFatal('uncaughtException', err); });
  }

  const app = express();

  // ── 5xxバースト検知（サイレント障害の運営通報）─────────────────────
  //   直近10分間の5xx応答が閾値を超えたら運営へメール＋LINE通報（1時間に1回まで）。
  //   個別のエラー処理は各ハンドラに任せ、ここは「気づく」ことだけを担う。
  const FIVEXX_WINDOW_MS = 10 * 60 * 1000;
  const FIVEXX_THRESHOLD = 5;
  const FIVEXX_NOTIFY_INTERVAL_MS = 60 * 60 * 1000;
  let fivexxTimestamps: number[] = [];
  let fivexxLastNotifiedAt = 0;
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 500) return;
      const now = Date.now();
      fivexxTimestamps = fivexxTimestamps.filter((t) => now - t < FIVEXX_WINDOW_MS);
      fivexxTimestamps.push(now);
      if (
        fivexxTimestamps.length >= FIVEXX_THRESHOLD &&
        now - fivexxLastNotifiedAt > FIVEXX_NOTIFY_INTERVAL_MS
      ) {
        fivexxLastNotifiedAt = now;
        const count = fivexxTimestamps.length;
        import('./notification')
          .then(({ notifyOwner }) =>
            notifyOwner({
              title: `🚨 サーバエラー多発: 10分間に5xxが${count}件`,
              content:
                `直近10分間で ${count} 件の5xx応答が発生しています。\n` +
                `直近の例: ${req.method} ${req.originalUrl} → ${res.statusCode}\n` +
                `サーバログの確認をおすすめします（通報は1時間に1回まで）。`,
            }),
          )
          .catch((e) => console.error('[5xxAlert] 通報失敗:', e));
      }
    });
    next();
  });
  app.set('trust proxy', 1);
  const server = createServer(app);


  // ── LINE通知連携 webhook ──────────────────────────────────────────
  // Threads Studio専用の公式LINEからの受信。express.json() より前に登録
  // （署名検証に生ボディが必要）。友だち追加の挨拶・6桁コードでの連携・
  // 「解除」での連携解除だけを扱う。未設定環境では404相当で無害。
  app.post('/api/line-notify/webhook',
    express.raw({ type: '*/*' }),
    async (req, res) => {
      try {
        const { lineNotifyEnabled, verifyLineSignature, replyMessage, LINE_TEXTS } = await import('../lineNotify');
        if (!lineNotifyEnabled()) return res.status(200).json({ ok: true, disabled: true });
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));
        if (!verifyLineSignature(raw, req.headers['x-line-signature'] as string)) {
          return res.status(400).json({ error: 'invalid signature' });
        }
        const payload = JSON.parse(raw.toString('utf8'));
        const db = await import('../db');
        for (const ev of payload.events ?? []) {
          const lineUserId: string | undefined = ev?.source?.userId;
          if (!lineUserId) continue;
          if (ev.type === 'follow') {
            // ★アプリ登録より先にLINEを追加した方は、users にも行が無く追いかけられない。
            //   友だち追加を控えておき、連携が無いままなら後日このトークでご案内する。
            try { await db.recordLineFollow(lineUserId); } catch (e) { console.error('[LineChat] 友だち追加の記録に失敗:', e); }
            // ★公式LINEから先に登録した方が迷わないよう、あいさつに連携ボタンを付ける
            const { replyMessages } = await import('../lineNotify');
            const { textWithQuick } = await import('../lineChat');
            await replyMessages(ev.replyToken, [
              // ★会員登録が起点。はじめての方が最初に押すものを先頭に置く。
              textWithQuick(LINE_TEXTS.greeting, [
                { label: '会員登録する', data: 'm=signup' },
                { label: '登録済みの方はこちら', data: 'm=link' },
                { label: '紹介コードをお持ちの方', data: 'm=refcode' },
              ]),
            ]);
            continue;
          }
          // ★リッチメニュー・カードのボタン（postback）。トーク内で完結する操作。
          if (ev.type === 'postback') {
            try {
              const { handlePostback } = await import('../lineChatHandler');
              const { replyMessages } = await import('../lineNotify');
              const msgs = await handlePostback(lineUserId, ev.postback?.data || '');
              await replyMessages(ev.replyToken, msgs);
            } catch (e) {
              console.error('[LineChat] postback error:', e);
              await replyMessage(ev.replyToken, '処理中にエラーが起きました。もう一度お試しください。');
            }
            continue;
          }
          if (ev.type === 'unfollow') {
            // ブロックされたら紐づけを外す（送っても届かないため）
            await db.unlinkLineByLineUserId(lineUserId);
            try { await db.removeLineFollower(lineUserId); } catch { /* 記録の削除は失敗しても続行 */ }
            continue;
          }
          if (ev.type === 'message' && ev.message?.type === 'text') {
            const text = String(ev.message.text || '').trim();
            if (text === '解除') {
              // ★以前は「解除」の一言で即座に連携が切れていた。
              //   誤って送ると通知も操作もすべて止まり、しかもご本人は
              //   何が起きたか分からない。一度だけ確認する。
              const { replyMessages } = await import('../lineNotify');
              const { textWithQuick } = await import('../lineChat');
              await replyMessages(ev.replyToken, [
                textWithQuick(
                  'アカウントとの連携を解除しますか？\n' +
                  '解除すると、投稿のお知らせや設定の変更がこのトークからできなくなります。\n' +
                  '（もう一度つなぎ直すことはできます）',
                  [
                    { label: '解除する', data: 'm=unlink' },
                    { label: 'やめる', data: 'm=menu' },
                  ],
                ),
              ]);
              continue;
            }
            // ★ここで「数字を抜き出して6桁なら連携コード」と決めつけてはいけない。
            //   連携の最初の手順ではメールアドレスを送っていただくが、
            //   アドレスに数字がちょうど6つ含まれていると（例: name.201462@example.com）
            //   それをコードとして扱ってしまい、「コードが違います」となって
            //   永久に連携できなくなる。実際にお客様1名がこの状態で止まっていた。
            //   入力待ちの状態があるときは、必ずそちら（handleFreeText）に渡す。
            let awaitingInput = false;
            try {
              const st = await db.getLineChatState(lineUserId);
              awaitingInput = Boolean(st?.state);
            } catch { awaitingInput = false; }

            // ★すでに連携済みの方は、コードを送る場面がない。
            //   ここでコード扱いすると「2026年9月2日」のような
            //   ふつうの文章（数字がちょうど6つ）まで
            //   「コードが違います」と返してしまい、会話が壊れる。
            //   連携し直したい場合は「解除」してからになる。
            let alreadyLinked = false;
            try {
              alreadyLinked = Boolean(await db.getUserByLineUserId(lineUserId));
            } catch { alreadyLinked = false; }

            // 全角で送られても拾えるようにする（日本語キーボードでは起こりやすい）
            const { extractDigits, toHalfWidth } = await import('@shared/inputNormalize');
            const code = extractDigits(text);
            const looksLikeEmail = toHalfWidth(text).includes('@');
            if (!alreadyLinked && !awaitingInput && !looksLikeEmail && code.length === 6) {
              // 表示名は設定画面の連携一覧用（取れなくても連携は成立させる）
              const { fetchLineDisplayName } = await import('../lineNotify');
              const displayName = await fetchLineDisplayName(lineUserId);
              const result = await db.linkLineByCode(code, lineUserId, displayName);
              const user0 = await db.getUserByLineUserId(lineUserId);
              if (result === 'linked') {
                const { switchToMainRichMenu } = await import('../lineNotify');
                await switchToMainRichMenu(lineUserId);
              }
              if (result === 'linked') {
                // ★連携直後は「次に何をするか」を必ず1タップで出す。
                //   リッチメニューには「はじめの設定」が無いため、ここが初期設定の入口になる。
                const { replyMessages } = await import('../lineNotify');
                const { textWithQuick } = await import('../lineChat');
                const hasProject = await db.getProjectsByUserId(user0?.id ?? 0).then(
                  (ps: any[]) => Array.isArray(ps) && ps.length > 0,
                ).catch(() => false);
                await replyMessages(ev.replyToken, [
                  textWithQuick(
                    LINE_TEXTS.linked + (hasProject ? '' : '\n\n続けて、はじめの設定（全20問・10〜15分）に進みましょう。'),
                    hasProject
                      ? [{ label: '今日の投稿', data: 'm=posts' }, { label: '設定', data: 'm=settings' }]
                      : [{ label: 'はじめの設定を始める', data: 'm=setup' }, { label: 'あとで', data: 'm=menu' }],
                  ),
                ]);
              } else {
                await replyMessage(
                  ev.replyToken,
                  result === 'limit' ? LINE_TEXTS.linkLimit : LINE_TEXTS.linkFailed,
                );
              }
              continue;
            }
            // ★連携済みなら、トーク内で完結するチャット操作として扱う
            try {
              const { handleFreeText } = await import('../lineChatHandler');
              const { replyMessages } = await import('../lineNotify');
              const msgs = await handleFreeText(lineUserId, text);
              if (msgs) {
                await replyMessages(ev.replyToken, msgs);
                continue;
              }
            } catch (e) {
              console.error('[LineChat] text error:', e);
            }
            // ここに来るのは handleFreeText が例外になった場合のみ
            await replyMessage(
              ev.replyToken,
              'メッセージありがとうございます。うまく処理できませんでした。下のメニューからお試しください。',
            );
          }
        }
        return res.status(200).json({ ok: true });
      } catch (e) {
        console.error('[LineNotify Webhook] エラー:', e);
        // LINE側のリトライ嵐を防ぐため200で返す
        return res.status(200).json({ ok: false });
      }
    });

  // ── Univapay webhook endpoint ──────────────────────────────────────
  // 決済完了/失敗/解約の通知を受けてサブスクを有効化/更新する。
  // express.json() より前に登録（署名検証に生ボディが必要）。
  // 設計: リンクフォーム方式（プラン共通の固定リンク）のため、
  //   - ユーザ特定: 決済時メールアドレス ⇄ アプリ登録メールで照合
  //   - プラン特定: 金額 ⇄ PLANS.priceMonthly で照合
  // Univapayの実イベント構造は環境で差があるため、生ペイロードを必ずログし、
  // 主要フィールドは複数経路で防御的に読む。未知イベントでも200で返し
  // Univapay側のリトライ嵐を防ぐ（署名NG時のみ400）。
  app.post('/api/univapay/webhook',
    express.raw({ type: '*/*' }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
      try {
        const { ENV } = await import('./env');
        const secret = ENV.univapayWebhookSecret;
        // Univapay の署名ヘッダ名は環境により差があるため複数候補を見る
        const sig =
          (req.headers['x-univapay-signature'] as string) ||
          (req.headers['x-univapay-webhook-signature'] as string) ||
          (req.headers['univapay-signature'] as string) ||
          '';
        // ★UnivaPayの実方式: Webhook登録時のauth_tokenがAuthorizationヘッダで届く
        //   （HMAC署名は送られない。storeのwebhook設定実物で確認済み 2026-08-14）。
        const authHeader = (req.headers['authorization'] as string) || '';

        // 署名シークレットが設定されている場合のみ厳格検証。
        // auth_token一致（実方式）または HMAC一致（将来の保険）のどちらかで通す。
        // 未設定（テスト導入初期）は警告して通す（実ペイロード収集のため）。
        if (secret) {
          const { verifyWebhookSignature, verifyWebhookAuthToken } = await import('../univapay');
          const ok =
            verifyWebhookAuthToken(authHeader, secret) ||
            verifyWebhookAuthToken(sig, secret) ||
            verifyWebhookSignature(rawBody, sig, secret);
          if (!ok) {
            console.warn('[Univapay Webhook] 認証検証失敗。リクエストを拒否');
            return res.status(400).json({ error: 'invalid signature' });
          }
        } else {
          console.warn('[Univapay Webhook] UNIVAPAY_WEBHOOK_SECRET未設定。署名検証スキップ（テスト導入中）');
        }

        let event: any = {};
        try { event = JSON.parse(rawBody || '{}'); } catch { event = {}; }

        // 実イベント構造の調査用に必ず生ログを残す（本番投入後ここで実構造を確認）
        console.log('[Univapay Webhook] received:', JSON.stringify(event).slice(0, 2000));

        // ── 冪等性チェック（重複イベント排除）──────────────────────
        // Univapayが同じ通知を再送しても二重処理しないよう、生ボディのハッシュを
        // 10分ウィンドウで記憶。実課金イベントは charge.id 等が毎回異なるため、
        // 正当な月次課金まで誤って弾くことはない（完全一致の再送のみ排除）。
        const bodyHash = createHash('sha256').update(rawBody || '').digest('hex');
        if (!globalThis.__univapayWebhookSeen) globalThis.__univapayWebhookSeen = [];
        const seen = globalThis.__univapayWebhookSeen;
        const nowMs = Date.now();
        const TEN_MIN = 10 * 60 * 1000;
        while (seen.length > 0 && nowMs - seen[0].ts > TEN_MIN) seen.shift();
        if (rawBody && seen.some((s) => s.h === bodyHash)) {
          console.log('[Univapay Webhook] 重複イベントを無視:', bodyHash.slice(0, 12));
          return res.json({ received: true, duplicate: true });
        }
        if (rawBody) {
          seen.push({ h: bodyHash, ts: nowMs });
          if (seen.length > 5000) seen.splice(0, seen.length - 5000);
        }

        // ── 主要フィールドを防御的に抽出 ──────────────────────────
        const data = event?.data ?? event ?? {};
        const eventType: string =
          String(event?.event ?? event?.type ?? event?.event_type ?? data?.event ?? '').toLowerCase();
        const status: string = String(data?.status ?? event?.status ?? '').toLowerCase();

        // メールアドレスをペイロード内から再帰的に探す
        const findEmail = (o: any, depth = 0): string | null => {
          if (!o || depth > 6) return null;
          if (typeof o === 'string') {
            const m = o.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
            return m ? m[0] : null;
          }
          if (typeof o !== 'object') return null;
          for (const k of Object.keys(o)) {
            if (/email/i.test(k) && typeof o[k] === 'string' && o[k].includes('@')) return o[k];
          }
          for (const k of Object.keys(o)) {
            const r = findEmail(o[k], depth + 1);
            if (r) return r;
          }
          return null;
        };
        let email = findEmail(event);

        // ★メールがペイロードに無い場合のフォールバック。
        //   リンクフォーム決済の実ペイロードはmetadataに氏名・電話しか入らず、
        //   メールはtransaction_tokenの中にしかない（滝本さんの実決済で確認）。
        //   transaction_token_id からトークンを引いてメールを特定する。
        if (!email) {
          const tokenId: string | null =
            data?.transaction_token_id ??
            data?.subscription?.transaction_token_id ??
            data?.charge?.transaction_token_id ??
            null;
          if (tokenId) {
            try {
              const { getTransactionToken } = await import('../univapay');
              const token = await getTransactionToken(tokenId);
              if (token?.email && String(token.email).includes('@')) {
                email = String(token.email);
                console.log(`[Univapay Webhook] メールをトークンから特定: ${email}`);
              }
            } catch (e) {
              console.error('[Univapay Webhook] トークン照会失敗:', e);
            }
          }
        }

        // ── 金額抽出 ──────────────────────────────────────────────
        // 7日トライアル設定では「初回=カード登録(課金¥0)」「8日目以降=プラン額」。
        // ・課金金額(chargeAmount): 実際に課金された額（初回は0、以降はプラン額）
        // ・継続金額(subscriptionAmount): サブスク自体の月額（初回¥0でもプラン額が入る）
        // プラン特定には継続金額を最優先で使う（¥0でもプランを特定できるように）。
        const toNum = (v: any) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
        const subscriptionAmount =
          toNum(data?.subscription?.amount) ??
          toNum(data?.subscription?.money?.amount) ??
          (/subscription/.test(eventType) ? toNum(data?.amount) : null);
        const chargeAmount =
          toNum(data?.charge?.amount) ??
          // ★実ペイロード（charge_finishedイベント）は charged_amount / requested_amount で届く
          //   （2026-08-14 滝本さんの実課金9,800円が「未分類イベント」に落ちたのを修正）
          toNum(data?.charged_amount) ??
          toNum(data?.requested_amount) ??
          (/charge/.test(eventType) ? toNum(data?.amount) : null) ??
          toNum(data?.money?.amount);
        const anyAmount = toNum(data?.amount) ?? toNum(event?.amount);
        // ログ・メール表示用（実課金額を優先）
        const amount = chargeAmount ?? anyAmount;
        // プラン特定用（継続額を最優先）
        const planAmount = subscriptionAmount ?? chargeAmount ?? anyAmount;

        const univapaySubId: string | null =
          data?.subscription_id ?? data?.subscription?.id ?? data?.id ?? event?.id ?? null;

        // 課金イベントの一意ID（Webhook再送の二重カウント防止に使う）
        const chargeEventId: string | null =
          data?.charge?.id ?? data?.charge_id ?? (/charge/.test(eventType) ? (data?.id ?? event?.id) : null) ?? null;

        // ── プラン特定（金額 ⇄ PLANS.priceMonthly）──────────────
        const { PLANS, TRIAL_DAYS, getPlan } = await import('../../shared/plans');
        let matchedPlanId: string | null = null;
        if (planAmount != null) {
          for (const [pid, p] of Object.entries(PLANS)) {
            if (p.priceMonthly > 0 && p.priceMonthly === planAmount) { matchedPlanId = pid; break; }
          }
        }

        const db = await import('../db');

        // ── イベント分類 ──────────────────────────────────────────
        const blob = eventType + ' ' + status;
        const isCanceled =
          /(cancel|canceled|cancelled|unsubscrib|suspend|refund)/.test(blob);
        const isFailed =
          /(fail|failed|error|declined|past_due|unpaid|chargeback)/.test(blob);
        // 実際にお金が動いた課金成功（金額 > 0）。トライアル後の初回課金や継続課金。
        const isPaidCharge =
          /charge|payment/.test(eventType) &&
          /(finish|finished|success|successful|paid|completed|captured|authorized|current)/.test(blob) &&
          (chargeAmount ?? 0) > 0;
        // カード登録・サブスク開始（初回課金¥0 = トライアル開始）。誤って課金成功扱いしない。
        const isSubscriptionStart =
          !isCanceled && !isFailed && !isPaidCharge &&
          (/subscription|token|card|registration/.test(eventType) ||
            (chargeAmount === 0 && /charge/.test(eventType)));

        if (!email) {
          console.warn('[Univapay Webhook] メール特定不可。手動確認が必要（生ログ参照）');
          // 200で返す（Univapayのリトライ嵐回避）。
          // ★共用ストアのため、Threads Studioのプラン金額に一致する決済のみ通知。
          if (matchedPlanId) {
            try {
              const { notifyOwner } = await import('./notification');
              await notifyOwner({
                title: 'Univapay webhook: ユーザ特定不可',
                content: `event=${eventType} status=${status} amount=${amount}\n生: ${JSON.stringify(event).slice(0, 1500)}`,
              });
            } catch {}
          }
          return res.json({ received: true, note: 'email not found' });
        }

        let user = await db.getUserByEmail(email);
        // ★決済フォームのメールがアプリ登録と違うことがある（別のメールを入力される）。
        //   その場合でも、契約IDが既にアプリに紐づいていればそこから持ち主を辿る。
        //   （2026-09-03: 6,980円お支払い済みなのに「未登録メール」で弾かれ、
        //     プランがフリーのまま放置される事故が起きた）
        if (!user && univapaySubId) {
          user = await db.getUserByUnivapaySubscriptionId(univapaySubId).catch(() => null) as any;
          if (user) {
            console.log(`[Univapay Webhook] メール不一致だが契約IDで特定: sub=${univapaySubId} user=${user.id}（決済メール=${email} / 登録メール=${user.email}）`);
          }
        }
        if (!user) {
          // ★UnivaPayストアは他事業（交通事故コンサル・LP制作・Keiro等）と共用。
          //   Threads Studioのプラン金額に一致しない決済は他事業のもの＝記録だけして終わる。
          //   （2026-09-04: 交通事故対応ルームの支払いを「未登録メール」と誤って追いかけた）
          if (!matchedPlanId) {
            console.log(`[Univapay Webhook] 他事業の決済のため無視: email=${email} amount=${amount} link=${data?.metadata?.['univapay-link-id'] ?? '-'}`);
            return res.json({ received: true, note: 'not a threads-studio plan' });
          }
          console.warn(`[Univapay Webhook] 未登録メール: ${email}（決済したがアプリ未登録の可能性）`);
          // ★UnivaPayストアは他事業（LP制作・Keiro等）と共用のため、Threads Studioの
          //   プラン金額に一致しない決済は他事業のもの＝通知しない（ノイズ防止）。
          if (matchedPlanId) {
            try {
              const { notifyOwner } = await import('./notification');
              await notifyOwner({
                title: 'Univapay webhook: 決済メールがアプリ未登録',
                content: `email=${email} event=${eventType} amount=${amount}\nアプリ登録メールと一致しません。手動対応が必要かもしれません。`,
              });
            } catch {}
          }
          return res.json({ received: true, note: 'user not found for email' });
        }

        const existing = await db.getSubscriptionByUserId(user.id);

        if (isCanceled) {
          // ★同一メールで複数サブスクがあり得る（二重契約の整理・旧契約の解約等）。
          //   イベントのサブスクIDがアプリに記録されたIDと食い違う場合、それは
          //   「別契約」の解約通知なので、アプリの契約は触らない
          //   （2026-08-14 滝本さんの旧契約解約で新契約まで解約扱いになった事故の再発防止）。
          if (existing?.univapaySubscriptionId && univapaySubId &&
              existing.univapaySubscriptionId !== univapaySubId) {
            console.log(`[Univapay Webhook] 別契約の解約通知を無視: user=${user.id} event.sub=${univapaySubId} app.sub=${existing.univapaySubscriptionId}`);
            return res.json({ received: true, note: 'canceled event for a different subscription' });
          }
          if (existing) {
            await db.updateSubscription(existing.id, { status: 'canceled' });
          }
          // ★代理店プランの解約: 配下クライアントは即停止せず「引き継ぎ猶予」に入れる。
          //   運営が同じ金額での直接契約を案内して引き継げるようにする
          //   （shared/takeover.ts に流れの説明。猶予切れは日次ジョブが停止する）。
          if ((existing?.planId ?? matchedPlanId) === 'agency') {
            try {
              const marked = await db.markAgencyClientsForTakeover(user.id);
              if (marked.length > 0) {
                console.log(`[Univapay Webhook] 代理店解約→クライアント${marked.length}件を引き継ぎ猶予へ: agency=${user.id}`);
                const { TAKEOVER_GRACE_DAYS } = await import('../../shared/takeover');
                const { notifyOwner } = await import('./notification');
                const base = process.env.APP_BASE_URL || 'https://threads-studio.com';
                const lines = marked.map((c) =>
                  `・${c.storeName || c.name || '(店舗名なし)'} <${c.email}>`).join('\n');
                await notifyOwner({
                  title: `代理店解約: クライアント${marked.length}件が引き継ぎ待ち`,
                  content:
                    `代理店 ${user.email}（userId=${user.id}）が解約されました。\n` +
                    `配下のクライアントは停止せず、${TAKEOVER_GRACE_DAYS}日間の引き継ぎ猶予に入っています。\n\n` +
                    lines + '\n\n' +
                    `管理画面から引き継ぎ案内の送信・切替・停止ができます:\n${base}/admin/billing`,
                });
              }
            } catch (e) {
              console.error('[Univapay Webhook] agency takeover mark error:', e);
            }
          }
          // キャンペーンプランの3回課金完了による自動終了か、通常解約かを判定。
          // どちらも canceled=フリーに戻る挙動だが、キャンペーン終了時は
          // 「継続するには通常プラン登録を」と案内メールを送る（Q2=A方針）。
          const endedPlan = getPlan(existing?.planId ?? matchedPlanId ?? '');
          if (endedPlan?.isCampaign) {
            console.log(`[Univapay Webhook] キャンペーン終了→フリーへ: user=${user.id} plan=${endedPlan.id}`);
            try {
              const normal = endedPlan.normalCounterpartId ? getPlan(endedPlan.normalCounterpartId) : undefined;
              const base = process.env.APP_BASE_URL || 'https://threads-studio.com';
              const { sendEmail } = await import('./notification');
              if (user.email) {
                await sendEmail({
                  to: user.email,
                  subject: '【Threads Studio】キャンペーン期間が終了しました',
                  html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                    <h2>キャンペーン期間（${endedPlan.campaignCharges ?? 3}回分）が終了しました</h2>
                    <p>${endedPlan.name} のキャンペーン課金が完了し、現在フリープランに戻っています。</p>
                    <p>引き続き有料機能（自動投稿・無制限AI生成など）をご利用になる場合は、
                    ${normal ? `「${normal.name}（月¥${normal.priceMonthly.toLocaleString()}）」` : '通常プラン'}
                    へのご登録をお願いいたします。</p>
                    <a href="${base}/pricing" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">通常プランを見る</a>
                  </div>`,
                });
              }
            } catch (e) { console.error('[Univapay Webhook] campaign-end mail error:', e); }
          } else {
            console.log(`[Univapay Webhook] サブスク解約: user=${user.id}`);
          }
        } else if (isFailed) {
          // ★別契約（サブスクID不一致）の失敗通知は無視。
          //   同一メールで他サービス・旧契約の決済失敗が来ても、アプリの契約を
          //   past_dueにしたり督促メールを送ったりしない。
          if (existing?.univapaySubscriptionId && univapaySubId &&
              existing.univapaySubscriptionId !== univapaySubId) {
            console.log(`[Univapay Webhook] 別契約の決済失敗通知を無視: user=${user.id} event.sub=${univapaySubId} app.sub=${existing.univapaySubscriptionId}`);
            return res.json({ received: true, note: 'failed event for a different subscription' });
          }
          // ── 決済失敗フォローアップ（dunning）──────────────────────
          // 失敗回数を加算し、初回失敗日時（猶予期間の起点）を記録する。
          // Webhook再送による二重カウントは課金イベントIDで防ぐ。
          const isDupFail = !!chargeEventId && existing?.lastChargeEventId === chargeEventId;
          const newFailCount = isDupFail
            ? (existing?.failedPaymentCount ?? 1)
            : (existing?.failedPaymentCount ?? 0) + 1;
          const contractPlan = getPlan(existing?.planId ?? matchedPlanId ?? 'light');
          const reRegisterUrl = contractPlan?.univapayLinkUrl ?? null;
          if (existing) {
            await db.updateSubscription(existing.id, {
              status: 'past_due',
              failedPaymentCount: newFailCount,
              firstFailedPaymentAt: existing.firstFailedPaymentAt ?? new Date(),
              lastFailedPaymentAt: new Date(),
              lastChargeEventId: chargeEventId ?? existing.lastChargeEventId ?? undefined,
            });
          }
          console.log(`[Univapay Webhook] 決済失敗: user=${user.id} 失敗${newFailCount}回目${isDupFail ? '（再送・据え置き）' : ''}`);
          try {
            const { sendPaymentFailedEmail, notifyOwner } = await import('./notification');
            const pn = contractPlan?.name ?? 'プラン';
            // ★顧客へ段階的フォローメール（回数でトーン変化＋カード再登録リンク）
            if (user.email) await sendPaymentFailedEmail(user.email, pn, amount, newFailCount, null, reRegisterUrl);
            // ★スタッフ（運営）へ通知：人が電話/LINEでフォローできるよう詳細を添える
            await notifyOwner({
              title: `⚠️ カード決済失敗（${newFailCount}回目）: ${user.name ?? user.email}`,
              content:
                `顧客: ${user.name ?? '(名前未設定)'} <${email}>\n` +
                `プラン: ${pn}（${contractPlan?.id ?? '不明'}）\n` +
                `請求額: ${amount != null ? '¥' + amount.toLocaleString('ja-JP') : '不明'}\n` +
                `連続失敗回数: ${newFailCount}回\n` +
                `初回失敗日: ${(existing?.firstFailedPaymentAt ?? new Date()).toLocaleString('ja-JP')}\n` +
                `→ 顧客にはカード再登録メールを自動送信済み。電話/LINEでのフォローをご検討ください。`,
            });
          } catch (e) { console.error('[Univapay Webhook] 決済失敗フォロー処理エラー:', e); }
        } else if (isPaidCharge) {
          // ★アプリの契約が正常稼働中（active）で、イベントのサブスクIDが別物の場合は
          //   並行契約（二重契約・他サービス）の課金。上書きせず運用者に通知だけする。
          //   （アプリ側が canceled/past_due 等なら「新契約への切替」とみなして通常処理へ）
          if (existing?.univapaySubscriptionId && univapaySubId &&
              existing.univapaySubscriptionId !== univapaySubId &&
              existing.status === 'active') {
            console.warn(`[Univapay Webhook] 別契約の課金を検知（二重契約の可能性）: user=${user.id} event.sub=${univapaySubId} app.sub=${existing.univapaySubscriptionId} amount=${amount}`);
            try {
              const { notifyOwner } = await import('./notification');
              await notifyOwner({
                title: '⚠️ Univapay: 同一メールで別サブスクの課金（二重契約の可能性）',
                content: `顧客: ${user.name ?? user.email} <${email}>\n課金額: ${amount != null ? '¥' + amount.toLocaleString('ja-JP') : '不明'}\nイベントのサブスクID: ${univapaySubId}\nアプリ記録のサブスクID: ${existing.univapaySubscriptionId}\nUnivaPay管理画面で契約状況の確認をおすすめします。`,
              });
            } catch {}
            return res.json({ received: true, note: 'paid charge for a different subscription (parallel contract)' });
          }
          // ── 実課金成功（金額>0）→ active 化 ──
          // プランは「金額一致 → 既存プラン維持」の順。どちらも不明なら誤付与を避けて保留通知。
          const planId = matchedPlanId ?? existing?.planId ?? null;
          if (!planId) {
            console.warn(`[Univapay Webhook] 課金成功だがプラン特定不可: user=${user.id} amount=${amount}`);
            try {
              const { notifyOwner } = await import('./notification');
              await notifyOwner({
                title: 'Univapay webhook: 課金成功だがプラン特定不可',
                content: `email=${email} chargeAmount=${chargeAmount} subAmount=${subscriptionAmount}\n手動でプラン割当が必要。生: ${JSON.stringify(event).slice(0, 1200)}`,
              });
              // ★#1 ユーザーも放置しない：手続きに問題が起きたことを案内
              await notifyPlanResolutionIssueToUser(user.email);
            } catch {}
          } else {
            // 次回課金日はUnivapayのペイロードにあればそれを使う（月末ズレの累積防止）。
            // 見つからなければ従来どおり +31日 にフォールバック。
            const nextPaymentRaw =
              data?.subscription?.next_payment?.due_date ??
              data?.subscription?.next_payment?.date ??
              data?.next_payment?.due_date ??
              data?.next_payment?.date ??
              null;
            const parsedNext = nextPaymentRaw ? new Date(nextPaymentRaw) : null;
            const currentPeriodEnd =
              parsedNext && !isNaN(parsedNext.getTime()) && parsedNext.getTime() > Date.now()
                ? parsedNext
                : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
            // ★#2 キャンペーンプランの課金回数を数える（規定回数で自動解約）。
            //   ★Webhook再送対策：同じ課金イベントIDなら回数を増やさない（二重カウント防止）。
            const chargedPlan = getPlan(planId);
            const isDuplicateCharge = !!chargeEventId && existing?.lastChargeEventId === chargeEventId;
            const newChargeCount = (chargedPlan?.isCampaign && !isDuplicateCharge)
              ? (existing?.campaignChargeCount ?? 0) + 1
              : (existing?.campaignChargeCount ?? 0);
            if (existing) {
              await db.updateSubscription(existing.id, {
                planId,
                status: 'active',
                trialEndsAt: null,
                univapaySubscriptionId: univapaySubId ?? existing.univapaySubscriptionId ?? undefined,
                currentPeriodEnd,
                cancelAtPeriodEnd: false,
                campaignChargeCount: newChargeCount,
                lastChargeEventId: chargeEventId ?? existing.lastChargeEventId ?? undefined,
                // 課金成功 → 決済失敗フォローの状態をリセット（past_due解消）。
                failedPaymentCount: 0,
                firstFailedPaymentAt: null,
                lastFailedPaymentAt: null,
                lastDunningReminderAt: null,
              });
              console.log(`[Univapay Webhook] サブスク更新→active: user=${user.id} plan=${planId}${isDuplicateCharge ? '（再送イベント・回数据え置き）' : ''}`);
              // 上位プランに変わったら、自動投稿の回数を新しい上限まで引き上げる。
              // （フリーのまま初期値1回で有料化して、1日1回しか投稿されない事故の防止）
              try {
                const { raiseAutoPostFrequencyOnUpgrade } = await import('../planUpgrade');
                await raiseAutoPostFrequencyOnUpgrade(user.id, existing.planId, planId);
              } catch (e) { console.error('[Univapay Webhook] 自動投稿回数の引き上げに失敗:', e); }
            } else {
              await db.createSubscription({
                userId: user.id,
                planId,
                univapaySubscriptionId: univapaySubId ?? undefined,
                status: 'active',
                trialEndsAt: null,
                currentPeriodEnd,
                campaignChargeCount: newChargeCount,
                lastChargeEventId: chargeEventId ?? undefined,
              } as any);
              console.log(`[Univapay Webhook] サブスク新規作成→active: user=${user.id} plan=${planId}`);
              // 初めての有料化。フリー（上限0）からの引き上げとして扱う。
              try {
                const { raiseAutoPostFrequencyOnUpgrade } = await import('../planUpgrade');
                await raiseAutoPostFrequencyOnUpgrade(user.id, 'free', planId);
              } catch (e) { console.error('[Univapay Webhook] 自動投稿回数の引き上げに失敗:', e); }
            }

            // 決済が通った瞬間に、今日の分の投稿を作る（夜のお申し込みでも当日から投稿）。
            // Threads未連携・お店の情報が未登録なら中で何もしない。Webhookの応答は待たせない。
            import('../autoPostScheduler')
              .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(user.id, '決済完了'))
              .catch(() => {});

            // ★#2 キャンペーン規定回数に達したときの処理。
            //   再送イベントでは発火させない（!isDuplicateCharge）。
            //   ・既定: アプリ側から自動解約（過剰課金防止／従来動作）。
            //   ・CAMPAIGN_AUTO_REVERT_ENABLED=true: 解約せず「通常価格へ自動切替」。
            //     ※有効化の前提（Univapay側）: キャンペーン契約が「回数無制限」かつ
            //       「課金金額上限≧通常価格」で作成されていること。テスト環境で検証必須。
            if (chargedPlan?.isCampaign && chargedPlan.campaignCharges && !isDuplicateCharge
                && newChargeCount >= chargedPlan.campaignCharges) {
              const subId = univapaySubId ?? existing?.univapaySubscriptionId;
              const autoRevert = process.env.CAMPAIGN_AUTO_REVERT_ENABLED === 'true';
              const regularPlan = chargedPlan.normalCounterpartId ? getPlan(chargedPlan.normalCounterpartId) : null;

              if (autoRevert && regularPlan && regularPlan.priceMonthly > 0) {
                // ── 通常価格へ自動切替（解約しない）──
                console.log(`[Univapay Webhook] キャンペーン規定回数到達(${newChargeCount}/${chargedPlan.campaignCharges})→通常価格へ切替: user=${user.id} ${chargedPlan.id}→${regularPlan.id} ¥${regularPlan.priceMonthly}`);
                try {
                  if (subId) {
                    const univapay = await import('../univapay');
                    await univapay.updateSubscriptionNextAmount(subId, regularPlan.priceMonthly);
                  }
                  // アプリ側のプラン記録も通常プランへ。再発火しないよう回数はリセット。
                  if (existing) {
                    await db.updateSubscription(existing.id, {
                      planId: regularPlan.id,
                      campaignChargeCount: 0,
                    });
                  }
                  // ユーザーへ通常価格移行を通知（事前告知の念押し）。
                  try {
                    const { sendEmail } = await import('./notification');
                    if (user.email) {
                      await sendEmail({
                        to: user.email,
                        subject: '【ThreadsStudio】キャンペーン価格期間が終了しました',
                        html: `<p>いつもご利用ありがとうございます。</p><p>お申し込み時にご案内のとおり、キャンペーン価格（${chargedPlan.campaignCharges}回分）の期間が終了し、次回ご請求分から<strong>通常価格 月額¥${regularPlan.priceMonthly.toLocaleString()}（${regularPlan.name}）</strong>に切り替わります。</p><p>プランの機能はこれまでと変わらずご利用いただけます。停止をご希望の場合は次回請求日までに解約手続きをお願いします。</p>`,
                      });
                    }
                  } catch (e) { console.error('[Univapay Webhook] revert mail error:', e); }
                } catch (e) {
                  console.error('[Univapay Webhook] campaign auto-revert error:', e);
                  // 失敗時は過剰課金を防ぐため安全側＝解約にフォールバック。
                  try {
                    if (subId) {
                      const univapay = await import('../univapay');
                      await univapay.cancelSubscription(subId);
                    }
                    const { notifyOwner } = await import('./notification');
                    await notifyOwner({
                      title: 'Univapay: 通常価格への自動切替に失敗（解約にフォールバック）',
                      content: `user=${user.id} subId=${subId} ${chargedPlan.id}→${regularPlan.id}。手動確認が必要です。`,
                    });
                  } catch {}
                }
              } else {
                // ── 従来動作: 自動解約（過剰課金防止）──
                console.log(`[Univapay Webhook] キャンペーン規定回数到達(${newChargeCount}/${chargedPlan.campaignCharges})→自動解約: user=${user.id}`);
                try {
                  if (subId) {
                    const univapay = await import('../univapay');
                    await univapay.cancelSubscription(subId);
                  }
                } catch (e) {
                  console.error('[Univapay Webhook] campaign auto-cancel error:', e);
                  try {
                    const { notifyOwner } = await import('./notification');
                    await notifyOwner({
                      title: 'Univapay: キャンペーン自動解約に失敗',
                      content: `user=${user.id} subId=${subId} 手動での解約確認が必要です。`,
                    });
                  } catch {}
                }
              }
            }
          }
        } else if (isSubscriptionStart) {
          // ── カード登録(¥0) = 7日間トライアル開始 → trialing で即時に有料機能を開放 ──
          // プラン特定できない場合は誤付与を避けて保留通知（'light'等への暗黙フォールバックはしない）。
          const planId = matchedPlanId ?? existing?.planId ?? null;
          if (!planId) {
            console.warn(`[Univapay Webhook] トライアル開始だがプラン特定不可: user=${user.id}`);
            try {
              const { notifyOwner } = await import('./notification');
              await notifyOwner({
                title: 'Univapay webhook: トライアル開始だがプラン特定不可',
                content: `email=${email} subAmount=${subscriptionAmount} chargeAmount=${chargeAmount}\n手動対応が必要。生: ${JSON.stringify(event).slice(0, 1200)}`,
              });
              // ★#1 ユーザーも放置しない：手続きに問題が起きたことを案内
              await notifyPlanResolutionIssueToUser(user.email);
            } catch {}
          } else if (existing && existing.status === 'active') {
            // 既に課金済み(active)のユーザーには何もしない（トライアルへ巻き戻さない）
            console.log(`[Univapay Webhook] サブスク開始イベントだが既にactive: user=${user.id}（無視）`);
          } else {
            // ★紹介コードによるキャンペーン価格は「無料トライアルなし・お申し込み時に初回のお支払い」。
            //   ここを一律トライアル扱いにすると、即時課金の方に
            //   「7日間無料です」とお伝えしてしまい、特商法の記載とも食い違う。
            const planCfg = getPlan(planId);
            const isCampaignPlan = Boolean(planCfg?.isCampaign);
            const trialEndsAt = isCampaignPlan
              ? null
              : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
            const status = isCampaignPlan ? 'active' : 'trialing';
            if (existing) {
              await db.updateSubscription(existing.id, {
                planId,
                status,
                trialEndsAt,
                univapaySubscriptionId: univapaySubId ?? existing.univapaySubscriptionId ?? undefined,
                currentPeriodEnd: trialEndsAt,
                cancelAtPeriodEnd: false,
              });
            } else {
              await db.createSubscription({
                userId: user.id,
                planId,
                univapaySubscriptionId: univapaySubId ?? undefined,
                status,
                trialEndsAt,
                currentPeriodEnd: trialEndsAt,
              } as any);
            }
            console.log(
              `[Univapay Webhook] お申し込み→${status}: user=${user.id} plan=${planId} ` +
              (trialEndsAt ? `トライアル終了=${trialEndsAt.toISOString()}` : 'トライアルなし（キャンペーン価格）'),
            );
            // ★お申し込みの時点で、自動投稿の回数をそのプランの上限まで引き上げる。
            //   セミナー価格・紹介コードのお客様はこの経路だけを通るので、
            //   ここが抜けていると「プロなのに1日1回」のまま始まってしまう。
            //   トライアル中もプランの機能は使えるため、同じ扱いにする。
            try {
              const { raiseAutoPostFrequencyOnUpgrade } = await import('../planUpgrade');
              await raiseAutoPostFrequencyOnUpgrade(user.id, existing?.planId ?? 'free', planId);
            } catch (e) { console.error('[Univapay Webhook] 自動投稿回数の引き上げに失敗:', e); }
            // お申し込みのご案内メール（任意・失敗しても無視）
            try {
              const planName = planCfg?.name ?? 'プラン';
              const { sendEmail } = await import('./notification');
              if (user.email) {
                await sendEmail({
                  to: user.email,
                  subject: isCampaignPlan
                    ? '【Threads Studio】お申し込みありがとうございます'
                    : '【Threads Studio】7日間の無料トライアルが始まりました',
                  html: isCampaignPlan
                    ? `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                        <h2>お申し込みありがとうございます</h2>
                        <p>${planName} のご利用を開始いただけます。本日から全機能をお使いいただけます。</p>
                        <p>紹介コード適用のお申し込みのため、無料トライアルは付かず、初回のお支払いが発生しています。
                        解約はダッシュボードからいつでもお手続きいただけます。</p>
                      </div>`
                    : `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                        <h2>無料トライアルが始まりました</h2>
                        <p>${planName} の全機能を、本日から7日間無料でお試しいただけます。</p>
                        <p>トライアル終了後（8日目）に、登録いただいたカードへ初回のお支払いが発生します。
                        期間中に停止をご希望の場合は、ダッシュボードからお手続きください。</p>
                      </div>`,
                });
              }
            } catch (e) { console.error('[Univapay Webhook] 申し込み案内メールの送信に失敗:', e); }
          }
        } else {
          console.log(`[Univapay Webhook] 未分類イベント（無視・要構造確認）: event=${eventType} status=${status}`);
        }

        return res.json({ received: true });
      } catch (err: any) {
        // 失敗してもUnivapayにはエラーを返しすぎない（リトライ嵐回避）。ログで追う。
        console.error('[Univapay Webhook] 処理エラー:', err?.message ?? err, '\n生:', rawBody.slice(0, 1000));
        return res.status(200).json({ received: true, note: 'processing error logged' });
      }
    }
  );

  // Rate limiting for API endpoints
  //
  // ★ここは「同一IPからの機械的な連打」を止めるためのもので、ふつうに使っている
  //   お客様を止めるためのものではない。以前は全API一律100回/15分だったが、
  //   ・院内の複数スタッフが同じWi-Fiから使う
  //   ・携帯回線でグローバルIPが共有される
  //   といったケースで簡単に上限へ達し、しかも上限に達すると auth.me まで429になって
  //   「勝手にログアウトされ、ログインし直すこともできない（ログインも429）」状態になっていた。
  //   そのため、通常APIはゆるく・パスワード試行系だけ厳しく、の2段構えにする。
  const AUTH_SENSITIVE = /auth\.(login|register|requestPasswordReset|resetPassword)/;

  // パスワードの総当たり対策。ここだけは厳しくしておく。
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'ログイン・登録の試行が多すぎます。しばらく待ってから再試行してください。' },
  });

  // 通常API。1ページの表示でtRPCは2回程度なので、1000回/15分あれば
  // 実利用でぶつかることはまずない（＝異常な連打だけを止める）。
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
    // Webhook（LINE・決済）は相手サーバーから来るので、ここで止めると通知が落ちる。
    skip: (req) => req.path.includes('webhook'),
  });

  app.use('/api/', (req, res, next) => {
    if (req.method === 'POST' && AUTH_SENSITIVE.test(req.path)) return authLimiter(req, res, next);
    return apiLimiter(req, res, next);
  });

  // CSRF protection: verify Origin header on mutation requests
  app.use('/api/trpc', (req, res, next) => {
    // Only check POST/mutation requests
    if (req.method !== 'POST') return next();

    const origin = req.headers.origin;
    const host = req.headers.host;

    // Skip CSRF check for webhook endpoints (they use signature verification)
    if (req.path.includes('webhook')) return next();

    // In production, verify Origin matches Host
    if (process.env.NODE_ENV === 'production') {
      if (!origin) {
        return res.status(403).json({ error: 'Missing Origin header' });
      }
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          console.warn(`[CSRF] Origin mismatch: ${origin} vs ${host}`);
          return res.status(403).json({ error: 'CSRF validation failed' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid Origin header' });
      }
    }

    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Note: Threads OAuth callback is handled directly by the frontend route /threads-connect
  // No server-side /api/threads/callback route needed - this avoids production routing issues
  
  // Threads Data Deletion Request Callback (required for Meta App Review)
  app.post('/api/threads/data-deletion', async (req, res) => {
    try {
      const signedRequest = req.body?.signed_request;
      if (!signedRequest) {
        return res.status(400).json({ error: 'Missing signed_request' });
      }

      // ★署名を検証（偽造リクエストによる不正削除を防止）
      const data = parseSignedRequest(signedRequest, process.env.THREADS_APP_SECRET || "");
      if (!data) {
        return res.status(400).json({ error: 'Invalid signed_request' });
      }
      const threadsUserId = data.user_id?.toString();

      if (threadsUserId) {
        // Find and delete all threads accounts matching this Threads user ID
        const { eq } = await import('drizzle-orm');
        const { threadsAccounts } = await import('../../drizzle/schema');
        const { getDb } = await import('../db');
        const database = await getDb();
        if (database) {
          const accounts = await database.select().from(threadsAccounts).where(eq(threadsAccounts.threadsUserId, threadsUserId));
          for (const account of accounts) {
            // データ削除リクエストなので完全削除（トークン消去ではなく物理削除）
            await db.hardDeleteThreadsAccount(account.id);
          }
        }
        console.log(`[Data Deletion] Deleted data for Threads user: ${threadsUserId}`);
      }

      // Return confirmation URL and tracking code as required by Meta
      const confirmationCode = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const statusUrl = `${req.headers.origin || req.protocol + '://' + req.get('host')}/api/threads/data-deletion-status?code=${confirmationCode}`;

      res.json({
        url: statusUrl,
        confirmation_code: confirmationCode,
      });
    } catch (err: any) {
      console.error('[Data Deletion] Error:', err.message);
      res.status(500).json({ error: 'Data deletion processing failed' });
    }
  });

  // Data Deletion Status Check
  app.get('/api/threads/data-deletion-status', (req, res) => {
    const code = req.query.code;
    res.json({
      confirmation_code: code,
      status: 'completed',
      message: 'All user data has been deleted.',
    });
  });

  // Threads Deauthorize Callback (required for Meta App Review)
  app.post('/api/threads/deauthorize', async (req, res) => {
    try {
      const signedRequest = req.body?.signed_request;
      if (!signedRequest) {
        return res.status(400).json({ error: 'Missing signed_request' });
      }

      // ★署名を検証（偽造リクエスト対策）
      const data = parseSignedRequest(signedRequest, process.env.THREADS_APP_SECRET || "");
      if (!data) {
        return res.status(400).json({ error: 'Invalid signed_request' });
      }
      const threadsUserId = data.user_id?.toString();

      if (threadsUserId) {
        const { eq } = await import('drizzle-orm');
        const { threadsAccounts } = await import('../../drizzle/schema');
        const { getDb } = await import('../db');
        const database = await getDb();
        if (database) {
          const accounts = await database.select().from(threadsAccounts).where(eq(threadsAccounts.threadsUserId, threadsUserId));
          for (const account of accounts) {
            await db.deleteThreadsAccount(account.id);
          }
        }
        console.log(`[Deauthorize] Deauthorized Threads user: ${threadsUserId}`);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[Deauthorize] Error:', err.message);
      res.status(500).json({ error: 'Deauthorize processing failed' });
    }
  });

  // Static Privacy Policy page (server-rendered HTML for Meta App Review crawlers)
  app.get("/privacy", (req, res, next) => {
    // Only serve static HTML for non-browser crawlers (Meta/Facebook bot, curl, etc.)
    // Let SPA handle it for regular browsers
    const ua = req.headers['user-agent'] || '';
    const isCrawler = /facebookexternalhit|facebookcatalog|Facebot|meta-externalagent|curl|wget|bot|crawl|spider|slurp/i.test(ua);
    if (!isCrawler) return next();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>プライバシーポリシー - Threads Studio | 株式会社しっとる</title>
</head>
<body>
<h1>プライバシーポリシー</h1>
<p>最終更新日：2025年6月1日</p>
<p>運営会社：株式会社しっとる</p>
<p>サービス名：Threads Studio</p>

<h2>1. はじめに</h2>
<p>株式会社しっとる（以下「当社」）が運営するThreads Studio（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本プライバシーポリシーは、本サービスがどのような情報を収集し、どのように利用・保護するかについて説明します。</p>

<h2>2. 収集する情報</h2>
<h3>2.1 アカウント情報</h3>
<p>メールアドレス、ユーザー名、パスワード（暗号化して保存）など、アカウント作成時に提供される情報。</p>
<h3>2.2 Threadsアカウント情報</h3>
<p>Threads APIを通じて取得するThreadsユーザーID、ユーザー名、プロフィール画像URL、アクセストークン。これらはThreads連携機能を提供するために必要です。</p>
<h3>2.3 投稿コンテンツ</h3>
<p>本サービスを通じて作成・編集された投稿テキスト、画像、テンプレートデータ。</p>
<h3>2.4 AI生成に関するデータ</h3>
<p>AI投稿生成機能を利用する際にユーザーが入力するプロジェクト情報、テーマ、キーワード等のデータ。</p>
<h3>2.5 決済情報</h3>
<p>有料プランの決済に必要な情報はUnivapay（株式会社ユニヴァ・ペイキャスト）を通じて安全に処理されます。当社はクレジットカード番号等の機密情報を直接保存しません。</p>
<h3>2.6 利用データ</h3>
<p>サービスの利用状況、投稿履歴、機能の使用頻度など、サービス改善のために収集する匿名化されたデータ。</p>
<h3>2.7 インサイトデータ</h3>
<p>Threads APIのインサイト機能を通じて取得する投稿のビュー数、いいね数、返信数等の統計データ。これらはユーザーの投稿パフォーマンス分析機能を提供するために使用します。</p>

<h2>3. 情報の利用目的</h2>
<ul>
<li>本サービスの提供・運営・改善</li>
<li>Threads APIを通じた投稿の作成・管理・予約投稿の実行</li>
<li>Threads投稿のインサイト分析・パフォーマンスレポートの提供</li>
<li>AIによる投稿コンテンツの自動生成・最適化</li>
<li>ユーザーアカウントの認証・管理</li>
<li>決済処理およびサブスクリプション管理</li>
<li>カスタマーサポートの提供</li>
<li>サービスの安全性確保と不正利用の防止</li>
<li>利用状況の分析によるサービス改善</li>
</ul>

<h2>4. Threads APIデータの取り扱い</h2>
<p>本サービスは、Meta社のThreads APIを利用しています。</p>
<ul>
<li>Threads APIから取得したデータは、本サービスの機能提供のみに使用します</li>
<li>アクセストークンは暗号化して安全に保存します</li>
<li>第三者にThreads APIデータを販売・共有することはありません</li>
<li>ユーザーがThreads連携を解除した場合、関連するThreadsデータを速やかに削除します</li>
<li>インサイトデータはユーザー自身の投稿分析にのみ使用し、第三者と共有しません</li>
</ul>

<h2>5. AI生成機能におけるデータの取り扱い</h2>
<ul>
<li>AIへの入力データは投稿生成の目的でのみ外部APIに送信されます</li>
<li>生成されたコンテンツはユーザーが確認・編集した上で投稿されます</li>
<li>AI生成データを第三者のモデル学習に提供することはありません</li>
</ul>

<h2>6. 決済処理</h2>
<p>有料プランの決済はUnivapay（株式会社ユニヴァ・ペイキャスト）の安全な決済インフラを通じて処理されます。クレジットカード情報は当社サーバーを経由せず、Univapayが直接処理・保管します。</p>

<h2>7. 情報の共有</h2>
<p>本サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。</p>
<ul>
<li>ユーザーの同意がある場合</li>
<li>法令に基づく開示要求がある場合</li>
<li>サービス提供に必要な業務委託先に対して、必要最小限の情報を提供する場合</li>
</ul>

<h2>8. データの保存と保護</h2>
<p>SSL/TLS暗号化通信、パスワードのハッシュ化、アクセストークンの暗号化など、業界標準のセキュリティ対策を実施しています。</p>

<h2>9. ユーザーの権利</h2>
<ul>
<li>アクセス権：自身の個人情報へのアクセスを要求する権利</li>
<li>訂正権：不正確な個人情報の訂正を要求する権利</li>
<li>削除権：個人情報の削除を要求する権利</li>
<li>Threads連携解除：いつでもThreadsアカウントの連携を解除する権利</li>
</ul>

<h2>10. データ削除</h2>
<p>ユーザーがアカウントの削除を希望する場合、またはThreads連携を解除する場合、関連する個人情報およびThreads APIデータは速やかに削除されます。データ削除のリクエストは、アプリ内の設定画面から行うことができます。</p>

<h2>11. Cookieの使用</h2>
<p>本サービスでは、ユーザー認証のためにセッションCookieを使用しています。トラッキングや広告目的では使用しません。</p>

<h2>12. 本ポリシーの変更</h2>
<p>本プライバシーポリシーは、法令の改正やサービスの変更に伴い、予告なく変更される場合があります。重要な変更がある場合は、サービス内で通知します。</p>

<h2>13. お問い合わせ</h2>
<p>プライバシーに関するご質問やご要望がございましたら、アプリ内のお問い合わせ機能またはサポートまでご連絡ください。</p>
<p>運営：株式会社しっとる</p>
<p>所在地：岡山県岡山市</p>
<p>メール：momen_t421@yahoo.co.jp</p>

<footer>
<p>&copy; 2025 Threads Studio（株式会社しっとる）. All rights reserved.</p>
</footer>
</body>
</html>`);
  });

  // Static Terms of Service page (server-rendered HTML for Meta App Review crawlers)
  app.get("/terms", (req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    const isCrawler = /facebookexternalhit|facebookcatalog|Facebot|meta-externalagent|curl|wget|bot|crawl|spider|slurp/i.test(ua);
    if (!isCrawler) return next();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>利用規約 - Threads Studio | 株式会社しっとる</title>
</head>
<body>
<h1>利用規約</h1>
<p>最終更新日：2025年6月1日</p>
<p>運営会社：株式会社しっとる</p>
<p>サービス名：Threads Studio</p>
<p>本利用規約は、株式会社しっとる（以下「当社」）が提供するThreads Studio（以下「本サービス」）の利用条件を定めるものです。詳細はアプリ内でご確認ください。</p>
<footer>
<p>&copy; 2025 Threads Studio（株式会社しっとる）. All rights reserved.</p>
</footer>
</body>
</html>`);
  });

  /**
   * メールから承認する導線（ログイン不要 / 署名付きトークン）。
   *
   * GET  … 投稿内容を表示して確認ボタンを出す（メールソフトのリンク先読みで
   *        勝手に公開されないよう、GETでは状態を変えない）
   * POST … 実際に承認 or 見送りを反映する
   *
   * トークンは1投稿・1操作にしか使えず、ログインセッションは発行しない。
   */
  const approvalPage = (title: string, body: string, tone: 'ok' | 'ng' = 'ok') => `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} | Threads Studio</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px 16px;background:#f8fafc;color:#0f172a;
       font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;
       line-height:1.7;-webkit-text-size-adjust:100%}
  .card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;
        border-radius:16px;padding:24px 20px}
  h1{font-size:19px;margin:0 0 12px;line-height:1.5;color:${tone === 'ok' ? '#065f46' : '#334155'}}
  p{font-size:15px;margin:0 0 12px;color:#334155}
  .post{white-space:pre-wrap;word-break:break-word;background:#f1f5f9;border-radius:12px;
        padding:16px;font-size:15px;margin:16px 0;color:#0f172a}
  .btn{display:block;width:100%;text-align:center;background:#10b981;color:#fff;border:0;
       padding:16px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;
       text-decoration:none;margin-top:8px}
  .btn.sub{background:#fff;color:#64748b;border:1px solid #cbd5e1;font-weight:600}
  .meta{font-size:13px;color:#64748b}
  a.link{color:#0f766e}
</style></head>
<body><div class="card">${body}</div></body></html>`;

  // ご案内メールの配信停止（ログイン不要・署名つきリンク）。
  // お手続きやお支払いに関するメールは対象外で、これまで通りお送りする。
  app.get('/api/unsubscribe', async (req, res) => {
    const { verifyUnsubscribeToken } = await import('../unsubscribeToken');
    const userId = verifyUnsubscribeToken(req.query.token);
    if (!userId) {
      return res.status(400).send(approvalPage('リンクが無効です', `
        <h1>このリンクは使えません</h1>
        <p>URLが途中で切れている可能性があります。</p>
        <p class="meta">お手数ですが、メールに返信してお知らせください。</p>`, 'ng'));
    }
    try {
      const db = await import('../db');
      await db.setEmailOptOut(userId, true);
    } catch (e) {
      console.error('[Unsubscribe] 失敗:', e);
      return res.status(500).send(approvalPage('うまくいきませんでした', `
        <h1>いま手続きができませんでした</h1>
        <p>お手数ですが、少し時間をおいてもう一度お試しください。</p>`, 'ng'));
    }
    return res.send(approvalPage('配信を停止しました', `
      <h1>配信を停止しました</h1>
      <p>使い方のご案内メールは、今後お送りしません。</p>
      <p class="meta">お手続き・お支払いに関する大切なお知らせは、引き続きお送りします。</p>
      <a class="btn" href="/settings">アプリを開く</a>`, 'ok'));
  });

  app.get('/api/post-approval', async (req, res) => {
    const parsed = verifyApprovalToken(req.query.token);
    if (!parsed) {
      return res.status(400).send(approvalPage('リンクが無効です', `
        <h1>このリンクは使えません</h1>
        <p>リンクの有効期限が切れているか、URLが途中で切れている可能性があります。</p>
        <p class="meta">お手数ですが、アプリにログインして投稿履歴から承認してください。</p>
        <a class="btn" href="/post-history?status=awaiting_approval">アプリを開く</a>`, 'ng'));
    }
    const post = await db.getScheduledPostById(parsed.postId);
    if (!post || post.userId !== parsed.userId) {
      return res.status(404).send(approvalPage('投稿が見つかりません', `
        <h1>投稿が見つかりませんでした</h1>
        <p>削除された可能性があります。</p>
        <a class="btn" href="/post-history">アプリを開く</a>`, 'ng'));
    }
    if (post.status !== 'awaiting_approval') {
      const label = post.status === 'posted' ? 'すでに投稿済みです'
        : post.status === 'canceled' ? 'この投稿は見送り済みです'
        : post.status === 'pending' ? 'すでに承認済みです（投稿予定に入っています）'
        : '対応の必要はありません';
      return res.send(approvalPage('対応済みです', `
        <h1>${label}</h1>
        <p class="meta">この画面は閉じていただいて大丈夫です。</p>
        <a class="btn" href="/post-history">投稿履歴を見る</a>`));
    }

    const when = post.scheduledAt
      ? new Date(post.scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return res.send(approvalPage('投稿の確認', `
      <h1>この内容で投稿しますか？</h1>
      ${when ? `<p class="meta">投稿予定：${when}</p>` : ''}
      <div class="post">${esc(post.postContent || '(本文なし)')}</div>
      <form method="POST" action="/api/post-approval">
        <input type="hidden" name="token" value="${createApprovalToken(post.id, post.userId, 'approve')}" />
        <button class="btn" type="submit">この内容で投稿する</button>
      </form>
      <form method="POST" action="/api/post-approval">
        <input type="hidden" name="token" value="${createApprovalToken(post.id, post.userId, 'skip')}" />
        <button class="btn sub" type="submit">今回は見送る</button>
      </form>
      <p class="meta" style="margin-top:16px">文章を直したいときは
        <a class="link" href="/post-history?status=awaiting_approval">アプリで編集</a>できます。</p>`));
  });

  app.post('/api/post-approval', express.urlencoded({ extended: false }), async (req, res) => {
    const parsed = verifyApprovalToken(req.body?.token ?? req.query?.token);
    if (!parsed) {
      return res.status(400).send(approvalPage('リンクが無効です', `
        <h1>このリンクは使えません</h1>
        <p>有効期限が切れている可能性があります。アプリから承認してください。</p>
        <a class="btn" href="/post-history?status=awaiting_approval">アプリを開く</a>`, 'ng'));
    }
    const post = await db.getScheduledPostById(parsed.postId);
    if (!post || post.userId !== parsed.userId) {
      return res.status(404).send(approvalPage('投稿が見つかりません', `
        <h1>投稿が見つかりませんでした</h1>
        <a class="btn" href="/post-history">アプリを開く</a>`, 'ng'));
    }
    if (post.status !== 'awaiting_approval') {
      return res.send(approvalPage('対応済みです', `
        <h1>この投稿はすでに対応済みです</h1>
        <p class="meta">重ねて投稿されることはありません。</p>
        <a class="btn" href="/post-history">投稿履歴を見る</a>`));
    }

    if (parsed.action === 'skip') {
      await db.updateScheduledPost(post.id, { status: 'canceled' });
      console.log(`[QuickApproval] skipped post=${post.id} user=${post.userId}`);
      return res.send(approvalPage('見送りました', `
        <h1>今回は見送りました</h1>
        <p>この投稿は公開されません。次の投稿はこれまでどおり自動で作成されます。</p>
        <a class="btn" href="/post-history">投稿履歴を見る</a>`));
    }

    // 予約時刻が過去なら直近の実行で公開されるよう現在時刻に寄せる（アプリ内の承認と同じ挙動）
    const now = new Date();
    const scheduledAt = post.scheduledAt && new Date(post.scheduledAt) > now ? undefined : now;
    await db.updateScheduledPost(post.id, {
      status: 'pending',
      ...(scheduledAt ? { scheduledAt } : {}),
    });
    console.log(`[QuickApproval] approved post=${post.id} user=${post.userId}`);
    return res.send(approvalPage('承認しました', `
      <h1>承認しました</h1>
      <p>この投稿は予定どおり公開されます。数分以内にThreadsへ反映されます。</p>
      <a class="btn" href="/post-history">投稿履歴を見る</a>`));
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Client error reporting endpoint
  app.post('/api/client-error', express.json(), (req, res) => {
    console.error("[CLIENT ERROR]", req.body?.message);
    console.error("[CLIENT STACK]", req.body?.stack?.substring(0, 500));
    console.error("[CLIENT COMPONENT]", req.body?.componentStack?.substring(0, 500));
    res.json({ ok: true });
  });

  // ★ /api/debug/user-check は無認証で特定ユーザの PII を返す重大脆弱性だった
  //   ため、削除した。同様の調査は管理者ダッシュボード or DB 直接で実施すること。

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Ensure database schema matches application requirements
  try {
    const { getDb } = await import("../db");
    const database = await getDb();
    if (database) {
      const { sql } = await import("drizzle-orm");

      // Check if schema is from old app (Zoom) by checking if plans table has correct columns
      const [rows] = await database.execute(sql.raw(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plans' AND COLUMN_NAME = 'maxAiGenerations'`
      )) as any;
      const hasCorrectSchema = rows?.[0]?.cnt > 0;

      if (!hasCorrectSchema) {
        console.log("[DB] Schema mismatch detected - rebuilding tables for Threads Studio...");

        // Drop old tables that conflict (from previous Zoom app)
        const oldTables = [
          '__drizzle_migrations',
          'userHistoryFavorites', 'userFavorites', 'userCoupons',
          'aiChatMessages', 'aiChatConversations',
          'aiGenerationHistory', 'aiGenerationUsage', 'aiGenerationPresets', 'aiGenerationTemplates',
          'postAnalytics', 'scheduledPosts', 'creditTransactions', 'referrals',
          'passwordResetTokens', 'subscriptions', 'threadsAccounts', 'projects',
          'templates', 'coupons', 'plans', 'users',
          // Old Zoom app tables
          'app_settings', 'chatbot_logs', 'chatbot_nodes', 'chatbot_scenarios',
          'client_invitations', 'client_users', 'industry_templates',
          'invitation_templates', 'meetings', 'message_logs', 'passcodes',
          'recurring_meetings', 'rich_menus', 'step_messages', 'step_scenarios',
          'zoom_settings'
        ];

        for (const table of oldTables) {
          try {
            await database.execute(sql.raw(`DROP TABLE IF EXISTS \`${table}\``));
          } catch (e: any) {
            // FK constraints may prevent drop, try again after disabling checks
          }
        }

        // Now read and apply the latest migration SQL to create fresh tables
        const fs = await import("fs");
        const path = await import("path");
        const drizzleDir = path.resolve(process.cwd(), "drizzle");
        const sqlFiles = fs.readdirSync(drizzleDir)
          .filter((f: string) => f.endsWith(".sql"))
          .sort();

        // Disable FK checks for clean creation
        await database.execute(sql.raw(`SET FOREIGN_KEY_CHECKS = 0`));

        for (const file of sqlFiles) {
          const filePath = path.join(drizzleDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const statements = content.split("--> statement-breakpoint").filter((s: string) => s.trim());
          for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (!trimmed) continue;
            try {
              await database.execute(sql.raw(trimmed));
            } catch (e: any) {
              if (e.errno === 1050 || e.errno === 1060 || e.errno === 1061) continue;
              console.warn(`[DB] Warning in ${file}:`, e.message?.substring(0, 100));
            }
          }
          console.log(`[DB] Applied: ${file}`);
        }

        await database.execute(sql.raw(`SET FOREIGN_KEY_CHECKS = 1`));
        console.log("[DB] Fresh schema created successfully");
      } else {
        // Schema is correct but we still need to apply any new migrations
        console.log("[DB] Schema OK - checking for new migrations...");
        const fs = await import("fs");
        const path = await import("path");
        const drizzleDir = path.resolve(process.cwd(), "drizzle");
        const sqlFiles = fs.readdirSync(drizzleDir)
          .filter((f: string) => f.endsWith(".sql"))
          .sort();

        // Create tracking table if not exists
        await database.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
            \`id\` int AUTO_INCREMENT PRIMARY KEY,
            \`hash\` varchar(255) NOT NULL,
            \`created_at\` bigint NOT NULL
          )
        `));

        const applied = await database.execute(sql.raw(`SELECT hash FROM \`__drizzle_migrations\``));
        const appliedHashes = new Set((applied as any)[0]?.map((r: any) => r.hash) || []);

        for (const file of sqlFiles) {
          const hash = file.replace(".sql", "");
          if (appliedHashes.has(hash)) continue;

          const filePath = path.join(drizzleDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const statements = content.split("--> statement-breakpoint").filter((s: string) => s.trim());

          for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (!trimmed) continue;
            try {
              await database.execute(sql.raw(trimmed));
            } catch (e: any) {
              if (e.errno === 1050 || e.errno === 1060 || e.errno === 1061) continue;
              console.warn(`[DB] Warning in ${file}:`, e.message?.substring(0, 100));
            }
          }

          await database.execute(sql.raw(
            `INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES ('${hash}', ${Date.now()})`
          ));
          console.log(`[DB] Applied migration: ${file}`);
        }
        console.log("[DB] Migration check complete");
        // 既定メニューを「未連携むけ」にしたため、それ以前から連携済みの方を通常メニューへ戻す
        try {
          const { reconcileRichMenus } = await import("../lineNotify");
          void reconcileRichMenus();
        } catch { /* 起動を止めない */ }
      }
    }
  } catch (err: any) {
    console.error("[DB] Schema setup error:", err.message);
  }

  // Ensure DB schema is up-to-date (fix missing columns)
  try {
    const { getDb } = await import("../db");
    const database = await getDb();
    if (database) {
      const { sql } = await import("drizzle-orm");

      // Create missing tables first
      const createStatements = [
        `CREATE TABLE IF NOT EXISTS aiGenerationHistory (
          id int AUTO_INCREMENT PRIMARY KEY,
          userId int NOT NULL,
          projectId varchar(50),
          postType varchar(50) NOT NULL,
          content text NOT NULL,
          metadata text,
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX user_id_idx (userId),
          INDEX project_id_idx (projectId),
          INDEX created_at_idx (createdAt)
        )`,
      ];

      for (const stmt of createStatements) {
        try { await database.execute(sql.raw(stmt)); } catch (e: any) {}
      }

      // Fix subscriptions table
      const alterStatements = [
        `ALTER TABLE subscriptions ADD COLUMN planId varchar(50) NOT NULL DEFAULT 'free'`,
        `ALTER TABLE subscriptions ADD COLUMN stripeSubscriptionId varchar(255)`,
        `ALTER TABLE subscriptions ADD COLUMN univapaySubscriptionId varchar(255)`,
        `ALTER TABLE subscriptions ADD COLUMN status enum('trialing','active','canceled','past_due','unpaid','incomplete') NOT NULL DEFAULT 'trialing'`,
        `ALTER TABLE subscriptions ADD COLUMN trialEndsAt timestamp NULL`,
        `ALTER TABLE subscriptions ADD COLUMN currentPeriodEnd timestamp NULL`,
        `ALTER TABLE subscriptions ADD COLUMN cancelAtPeriodEnd boolean NOT NULL DEFAULT false`,
        `ALTER TABLE subscriptions ADD COLUMN updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        // Fix plans table
        `ALTER TABLE plans ADD COLUMN maxAiGenerations int NOT NULL DEFAULT 10`,
        `ALTER TABLE plans ADD COLUMN hasPrioritySupport boolean NOT NULL DEFAULT false`,
        `ALTER TABLE plans ADD COLUMN stripePriceId varchar(255)`,
        `ALTER TABLE plans ADD COLUMN isActive boolean NOT NULL DEFAULT true`,
        // Fix users table
        `ALTER TABLE users ADD COLUMN emailVerified boolean NOT NULL DEFAULT false`,
        `ALTER TABLE users ADD COLUMN emailVerificationToken varchar(64)`,
        `ALTER TABLE users ADD COLUMN autoPostEnabled boolean NOT NULL DEFAULT true`,
        `ALTER TABLE users ADD COLUMN autoPostFrequency enum('daily','twice_daily','three_daily') NOT NULL DEFAULT 'daily'`,
        `ALTER TABLE users ADD COLUMN lastAutoPostTypeIndex int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN lastAutoPurposeIndex int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN referralCode varchar(16)`,
        `ALTER TABLE users ADD COLUMN credits int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN isDemoMode boolean NOT NULL DEFAULT true`,
        `ALTER TABLE users ADD COLUMN setupStep int NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN authProvider enum('manus','email') NOT NULL DEFAULT 'manus'`,
        `ALTER TABLE users ADD COLUMN role enum('user','admin') NOT NULL DEFAULT 'user'`,
      ];

      for (const stmt of alterStatements) {
        try {
          await database.execute(sql.raw(stmt));
        } catch (e: any) {
          // Ignore "duplicate column" errors (1060)
          if (e.errno !== 1060) {
            // Only log unexpected errors
          }
        }
      }
      // Fix invalid subscription records (from old Zoom/LINE app)
      // Set planId to 'free' where it's empty, set status where it's NULL
      await database.execute(sql.raw(`UPDATE subscriptions SET planId = 'free' WHERE planId IS NULL OR planId = ''`));
      await database.execute(sql.raw(`UPDATE subscriptions SET status = 'active' WHERE status IS NULL OR status = ''`));
      console.log("[DB] Schema columns verified");

      // Set admin
      await database.execute(sql.raw(`UPDATE users SET role = 'admin' WHERE email = 'momen_t421@yahoo.co.jp'`));
      console.log("[Admin] Admin role set for momen_t421@yahoo.co.jp");
    }
  } catch (e: any) {
    console.error("[DB] Schema fix error:", e.message);
  }

  // Initialize plans in database
  await db.initializePlans();
  
  // Initialize coupon codes
  const { seedCoupons } = await import("../coupon");
  await seedCoupons();
  
  // ★QA安全モード：本番スナップショットを載せたローカル環境で、
  //   実在アカウントへの自動投稿・メール送信が走らないようにする。
  const qaSafeMode = process.env.QA_SAFE_MODE === '1';
  if (qaSafeMode) {
    console.log('[Server] QA_SAFE_MODE=1: 自動投稿・定期ジョブは起動しません');
  }

  let stopPostExecutor: () => void = () => {};

  if (!qaSafeMode) {
    // Start trial reminder scheduler
    initTrialReminderScheduler();
    initPaymentFollowUpScheduler();

    // Start scheduled post executor
    const { startScheduledPostExecutor } = await import("../scheduledPostExecutor");
    stopPostExecutor = startScheduledPostExecutor();

    // Start auto-post scheduler (daily AI generation + scheduling)
    const { startAutoPostScheduler } = await import("../autoPostScheduler");
    startAutoPostScheduler();

    // Start weekly report scheduler (Monday 9:00 AM JST, pro+ users only)
    const { startWeeklyReportScheduler } = await import("../weeklyReport");
    startWeeklyReportScheduler();

    // Daily ops: analytics auto-fetch + follower snapshots + hit-post archive
    // + overdue approval reminders
    const { initDailyOpsSchedulers } = await import("../dailyOpsJobs");
    initDailyOpsSchedulers();
  }

  // ★起動時キャッチアップ：デプロイ再起動でcron発火を跨いだ場合に
  //   その日の未実行ジョブを追い実行する（DB初期化が落ち着く60秒後）。
  if (!qaSafeMode) {
    setTimeout(async () => {
      try {
        const { catchUpMissedJobs } = await import("../jobRunner");
        await catchUpMissedJobs();
      } catch (e) {
        console.error("[JobRunner] 起動時キャッチアップ失敗:", e);
      }
    }, 60 * 1000);
  }

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background token refresh job
    if (!qaSafeMode) startTokenRefreshJob();
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received, shutting down gracefully...`);

    // Stop schedulers
    stopPostExecutor();
    const cron = await import("node-cron");
    cron.getTasks().forEach((task) => task.stop());

    // Close HTTP server (stop accepting new connections)
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ─── #10 グローバル例外ハンドラ ─────────────────────────────────
// 非同期エラーが拾われずにプロセスが落ちるのを防ぐ。
// 起動前に登録してログだけ残す。プロセスは継続させる（最低限の可用性）。
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Sentry などがあれば送信。落とさない（サービス継続）。
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
  void promise;
});

startServer().catch(console.error);
