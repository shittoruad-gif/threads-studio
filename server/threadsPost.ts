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
 * Combined function: Create and publish post
 */
export async function createAndPublishPost(
  params: CreatePostParams
): Promise<PublishResponse> {
  // Step 1: Create media container
  const container = await createMediaContainer(params);

  // Step 2: Publish media container
  const result = await publishMediaContainer(
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
      const published = await publishMediaContainer(base.threadsUserId, container.id, base.accessToken);
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
