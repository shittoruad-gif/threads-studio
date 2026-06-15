/**
 * Threads Post API Helper
 * 
 * Handles posting to Threads via Graph API
 */

import { THREAD_SEGMENT_DELIMITER } from "../shared/const";

const THREADS_GRAPH_URL = "https://graph.threads.net/v1.0";

/** Threads 1投稿の文字数上限（安全側）。各セグメントはこれを超えないよう切り詰める。 */
const PER_POST_SAFETY_LIMIT = 480;

export interface CreatePostParams {
  accessToken: string;
  threadsUserId: string;
  text: string;
  mediaType?: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
  imageUrl?: string;
  videoUrl?: string;
  children?: string[]; // For carousel posts
  replyToId?: string; // 返信チェーン（ツリー）用：この投稿IDへの返信として作成
}

export interface MediaContainer {
  id: string;
}

export interface PublishResponse {
  id: string;
}

/**
 * Step 1: Create media container
 */
export async function createMediaContainer(
  params: CreatePostParams
): Promise<MediaContainer> {
  const { accessToken, threadsUserId, text, mediaType = "TEXT", imageUrl, videoUrl, children, replyToId } = params;

  const body: Record<string, string> = {
    media_type: mediaType,
    access_token: accessToken,
  };

  // Add text content
  if (text) {
    body.text = text;
  }

  // 返信チェーン（ツリー）: 親投稿への返信として作成
  if (replyToId) {
    body.reply_to_id = replyToId;
  }

  // Add media URLs
  if (mediaType === "IMAGE" && imageUrl) {
    body.image_url = imageUrl;
  } else if (mediaType === "VIDEO" && videoUrl) {
    body.video_url = videoUrl;
  } else if (mediaType === "CAROUSEL" && children) {
    body.children = children.join(",");
  }

  const response = await fetch(
    `${THREADS_GRAPH_URL}/${threadsUserId}/threads`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create media container: ${error}`);
  }

  return response.json();
}

/**
 * Step 2: Publish media container
 */
export async function publishMediaContainer(
  threadsUserId: string,
  creationId: string,
  accessToken: string
): Promise<PublishResponse> {
  const body = {
    creation_id: creationId,
    access_token: accessToken,
  };

  const response = await fetch(
    `${THREADS_GRAPH_URL}/${threadsUserId}/threads_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to publish media container: ${error}`);
  }

  return response.json();
}

/**
 * メディアコンテナの処理状態を取得する。
 * status: EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED
 */
async function getContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<{ status: string; error_message?: string }> {
  const params = new URLSearchParams({
    fields: "status,error_message",
    access_token: accessToken,
  });
  const response = await fetch(`${THREADS_GRAPH_URL}/${containerId}?${params.toString()}`, {
    method: "GET",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get container status: ${error}`);
  }
  return response.json();
}

/**
 * コンテナが公開可能（status=FINISHED）になるまで待つ。
 *
 * Threads はコンテナ作成直後はまだ処理中（IN_PROGRESS）のことがあり、
 * その状態で publish すると「The requested resource does not exist (code:24)」で
 * 失敗する。テキストでも連続投稿が増えると顕在化するため、FINISHED を待ってから公開する。
 *
 * - FINISHED:     公開可能 → return
 * - IN_PROGRESS:  待って再確認
 * - ERROR/EXPIRED: 復旧不能 → throw
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  opts: { maxWaitMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const maxWaitMs = opts.maxWaitMs ?? 45000; // テキストは通常数秒。安全側で45秒上限
  const intervalMs = opts.intervalMs ?? 1500;
  const start = Date.now();
  // 直後は処理中のことが多いので、まず少し待ってから確認する
  await new Promise((r) => setTimeout(r, 800));
  while (true) {
    let info: { status: string; error_message?: string };
    try {
      info = await getContainerStatus(containerId, accessToken);
    } catch {
      // ステータス取得が一時的に失敗しても、上限内ならリトライ
      if (Date.now() - start > maxWaitMs) return; // 取得不能でも publish 側のリトライに委ねる
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    const status = (info.status || "").toUpperCase();
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`コンテナの処理に失敗しました (status=${status}${info.error_message ? `: ${info.error_message}` : ""})`);
    }
    if (Date.now() - start > maxWaitMs) {
      // タイムアウト：FINISHED にならなくても publish を試す（直後に通ることがある）
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * メディアコンテナを公開する。Threads が「まだ存在しない（code:24）」等の
 * 一時的エラーを返すことがあるため、指数バックオフで数回リトライする。
 */
async function publishWithRetry(
  threadsUserId: string,
  creationId: string,
  accessToken: string,
  attempts = 4,
): Promise<PublishResponse> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await publishMediaContainer(threadsUserId, creationId, accessToken);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      // 「存在しない(code:24)」や transient は、コンテナ処理完了待ちでリトライ
      const isTransient = /does not exist|code\D*24|is_transient\D*true|処理中|temporarily|timeout/i.test(msg);
      if (!isTransient || i === attempts - 1) throw err;
      // 公開前にもう一度 FINISHED を待ってから再試行
      await waitForContainerReady(creationId, accessToken, { maxWaitMs: 15000, intervalMs: 2000 });
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Combined function: Create and publish post
 */
export async function createAndPublishPost(
  params: CreatePostParams
): Promise<PublishResponse> {
  // Step 1: Create media container
  const container = await createMediaContainer(params);

  // Step 2: コンテナの処理完了を待つ（IN_PROGRESS のまま publish して code:24 になるのを防ぐ）
  await waitForContainerReady(container.id, params.accessToken);

  // Step 3: Publish media container（一時エラーはリトライ）
  const result = await publishWithRetry(
    params.threadsUserId,
    container.id,
    params.accessToken
  );

  return result;
}

/**
 * 投稿本文を「連続投稿（ツリー）」のセグメント配列に分解する。
 * THREAD_SEGMENT_DELIMITER で区切られていれば各セグメントに分割。
 * 区切りが無ければ単一要素。各セグメントは安全側で480字に切り詰める。
 */
export function splitThreadSegments(content: string): string[] {
  const raw = (content || '').split(THREAD_SEGMENT_DELIMITER);
  const segments = raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (Array.from(s).length > PER_POST_SAFETY_LIMIT
      ? Array.from(s).slice(0, PER_POST_SAFETY_LIMIT - 1).join('') + '…'
      : s));
  return segments.length > 0 ? segments : [''];
}

/**
 * 連続投稿（ツリー）を返信チェーンとして投稿する。
 * 先頭=ルート投稿、以降=直前の投稿への返信、という本物のスレッドを作る。
 * segments が1件なら単一投稿と同じ。
 */
/**
 * 連続投稿(ツリー)の途中で失敗したことを表すエラー。
 * ルート投稿は公開済みなので、呼び出し側はこれを見て「投稿済み（一部欠け）」と扱い、
 * 再試行でルートを二重投稿しないようにする（冪等性の確保 / 欠点#5対策）。
 */
export class PartialThreadError extends Error {
  rootId: string;
  publishedReplyIds: string[];
  failedAtIndex: number;
  constructor(message: string, rootId: string, publishedReplyIds: string[], failedAtIndex: number) {
    super(message);
    this.name = 'PartialThreadError';
    this.rootId = rootId;
    this.publishedReplyIds = publishedReplyIds;
    this.failedAtIndex = failedAtIndex;
  }
}

export async function createAndPublishThread(
  base: { accessToken: string; threadsUserId: string },
  segments: string[],
): Promise<{ id: string; replyIds: string[] }> {
  const clean = segments.map((s) => (s || '').trim()).filter(Boolean);
  if (clean.length === 0) throw new Error('No content to post');

  // ルート投稿（失敗時は何も公開されていないので通常エラー＝再試行可能）
  const root = await createAndPublishPost({
    accessToken: base.accessToken,
    threadsUserId: base.threadsUserId,
    text: clean[0],
    mediaType: 'TEXT',
  });

  // ルート投稿後に失敗した場合は PartialThreadError を投げる（再試行で二重投稿しない）
  const replyIds: string[] = [];
  let prevId = root.id;
  for (let i = 1; i < clean.length; i++) {
    try {
      // 直前の公開が反映されるまで少し待つ（順序保証・レート回避）
      await new Promise((r) => setTimeout(r, 1500));
      const container = await createMediaContainer({
        accessToken: base.accessToken,
        threadsUserId: base.threadsUserId,
        text: clean[i],
        mediaType: 'TEXT',
        replyToId: prevId,
      });
      // 返信コンテナの処理完了を待ってから公開（code:24「メディアが見つかりません」対策）
      await waitForContainerReady(container.id, base.accessToken);
      const published = await publishWithRetry(base.threadsUserId, container.id, base.accessToken);
      replyIds.push(published.id);
      prevId = published.id;
    } catch (err: any) {
      throw new PartialThreadError(
        `連続投稿の${i + 1}件目で失敗: ${err?.message || err}`,
        root.id,
        replyIds,
        i,
      );
    }
  }

  return { id: root.id, replyIds };
}

/**
 * Get post details
 */
export async function getPost(postId: string, accessToken: string) {
  const params = new URLSearchParams({
    fields: "id,text,timestamp,media_type,media_url,permalink",
    access_token: accessToken,
  });

  const response = await fetch(
    `${THREADS_GRAPH_URL}/${postId}?${params.toString()}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get post: ${error}`);
  }

  return response.json();
}

/**
 * Check publishing rate limit
 */
export async function checkPublishingLimit(
  threadsUserId: string,
  accessToken: string
) {
  const params = new URLSearchParams({
    fields: "quota_usage,config",
    access_token: accessToken,
  });

  const response = await fetch(
    `${THREADS_GRAPH_URL}/${threadsUserId}/threads_publishing_limit?${params.toString()}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to check publishing limit: ${error}`);
  }

  return response.json();
}
