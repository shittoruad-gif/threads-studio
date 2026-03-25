/**
 * Threads Post API Helper
 * 
 * Handles posting to Threads via Graph API
 */

const THREADS_GRAPH_URL = "https://graph.threads.net/v1.0";

export interface CreatePostParams {
  accessToken: string;
  threadsUserId: string;
  text: string;
  mediaType?: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
  imageUrl?: string;
  videoUrl?: string;
  children?: string[]; // For carousel posts
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
  const { accessToken, threadsUserId, text, mediaType = "TEXT", imageUrl, videoUrl, children } = params;

  const body: Record<string, string> = {
    media_type: mediaType,
    access_token: accessToken,
  };

  // Add text content
  if (text) {
    body.text = text;
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
