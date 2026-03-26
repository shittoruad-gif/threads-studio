/**
 * Threads API integration
 * Handles communication with Threads API for profile and posting operations
 */

const THREADS_API_BASE_URL = "https://graph.threads.net";

export interface ThreadsUserProfile {
  id: string;
  username: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
  followers_count?: number;
  following_count?: number;
}

/**
 * Get user profile from Threads API
 * @param accessToken - Threads access token
 * @returns User profile data
 */
export async function getThreadsUserProfile(
  accessToken: string
): Promise<ThreadsUserProfile> {
  const fields = [
    "id",
    "username",
    "name",
    "threads_profile_picture_url",
    "threads_biography",
  ].join(",");

  const url = `${THREADS_API_BASE_URL}/v1.0/me?fields=${fields}&access_token=${accessToken}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to fetch Threads profile: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
    );
  }

  const data = await response.json();
  return data;
}

export interface ThreadsPostMedia {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
}

export interface ThreadsPostInsight {
  name: string;
  period: string;
  values: Array<{ value: number }>;
  title: string;
  description: string;
  id: string;
}

/**
 * Get user's threads (posts) from Threads API
 * @param accessToken - Threads access token
 * @param userId - Threads user ID
 * @param limit - Number of posts to fetch
 * @returns Array of post data
 */
export async function getThreadsUserPosts(
  accessToken: string,
  userId: string,
  limit: number = 25
): Promise<ThreadsPostMedia[]> {
  const fields = ["id", "text", "timestamp", "permalink", "media_type"].join(",");
  const url = `${THREADS_API_BASE_URL}/v1.0/${userId}/threads?fields=${fields}&limit=${limit}&access_token=${accessToken}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Failed to fetch Threads posts:", response.status, errorData);
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching Threads posts:", error);
    return [];
  }
}

/**
 * Get insights (metrics) for a specific Threads post
 * @param accessToken - Threads access token
 * @param postId - Threads post ID
 * @returns Post insight metrics
 */
export async function getThreadsPostInsights(
  accessToken: string,
  postId: string
): Promise<{ views: number; likes: number; replies: number; reposts: number }> {
  const metrics = "views,likes,replies,reposts";
  const url = `${THREADS_API_BASE_URL}/v1.0/${postId}/insights?metric=${metrics}&access_token=${accessToken}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Failed to fetch insights for post ${postId}:`, response.status, errorData);
      return { views: 0, likes: 0, replies: 0, reposts: 0 };
    }
    const data = await response.json();
    const insights: Record<string, number> = {};
    if (data.data) {
      for (const insight of data.data) {
        insights[insight.name] = insight.values?.[0]?.value ?? 0;
      }
    }
    return {
      views: insights.views ?? 0,
      likes: insights.likes ?? 0,
      replies: insights.replies ?? 0,
      reposts: insights.reposts ?? 0,
    };
  } catch (error) {
    console.error(`Error fetching insights for post ${postId}:`, error);
    return { views: 0, likes: 0, replies: 0, reposts: 0 };
  }
}

/**
 * Get user's followers and following counts from Threads API
 * Note: This is a placeholder implementation as the actual Threads API endpoints may vary
 * @param accessToken - Threads access token
 * @param userId - Threads user ID
 * @returns Followers and following counts
 */
export async function getThreadsUserCounts(
  accessToken: string,
  userId: string
): Promise<{ followersCount: number; followingCount: number }> {
  // Placeholder implementation
  // The actual Threads API may not provide these endpoints yet
  // This would need to be updated based on the official Threads API documentation
  
  try {
    const url = `${THREADS_API_BASE_URL}/v1.0/${userId}?fields=followers_count,following_count&access_token=${accessToken}`;
    const response = await fetch(url);

    if (!response.ok) {
      // If the API doesn't support these fields yet, return default values
      return { followersCount: 0, followingCount: 0 };
    }

    const data = await response.json();
    return {
      followersCount: data.followers_count || 0,
      followingCount: data.following_count || 0,
    };
  } catch (error) {
    console.error("Error fetching Threads user counts:", error);
    return { followersCount: 0, followingCount: 0 };
  }
}

export interface ThreadsComment {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  media_id?: string;
  parent_post_text?: string;
  parent_post_id?: string;
}

/**
 * Get comments (replies) on the user's threads posts
 * Uses the Threads Replies API
 * @param accessToken - Threads access token
 * @param userId - Threads user ID
 * @param limit - Maximum number of comments to fetch
 * @returns Array of comments
 */
export async function getThreadsComments(
  accessToken: string,
  userId: string,
  limit: number = 25
): Promise<ThreadsComment[]> {
  try {
    // Step 1: Get user's recent threads
    const threadsFields = ["id", "text", "timestamp"].join(",");
    const threadsUrl = `${THREADS_API_BASE_URL}/v1.0/${userId}/threads?fields=${threadsFields}&limit=20&access_token=${accessToken}`;
    const threadsResponse = await fetch(threadsUrl);

    if (!threadsResponse.ok) {
      console.error("Failed to fetch user threads for comments:", threadsResponse.status);
      return [];
    }

    const threadsData = await threadsResponse.json();
    const threads = threadsData.data || [];

    // Step 2: For each thread, fetch its replies (conversations)
    const allComments: ThreadsComment[] = [];

    for (const thread of threads) {
      try {
        const repliesFields = ["id", "text", "username", "timestamp"].join(",");
        const repliesUrl = `${THREADS_API_BASE_URL}/v1.0/${thread.id}/conversation?fields=${repliesFields}&reverse=true&access_token=${accessToken}`;
        const repliesResponse = await fetch(repliesUrl);

        if (!repliesResponse.ok) continue;

        const repliesData = await repliesResponse.json();
        const replies = repliesData.data || [];

        // Filter out the original post (self-reply) and map
        for (const reply of replies) {
          // Skip replies from the user themselves (those are the original posts)
          if (reply.id === thread.id) continue;

          allComments.push({
            id: reply.id,
            text: reply.text || '',
            username: reply.username || '不明',
            timestamp: reply.timestamp,
            media_id: thread.id,
            parent_post_text: thread.text || '',
            parent_post_id: thread.id,
          });
        }
      } catch (error) {
        console.error(`Error fetching replies for thread ${thread.id}:`, error);
        continue;
      }

      if (allComments.length >= limit) break;
    }

    return allComments.slice(0, limit);
  } catch (error) {
    console.error("Error fetching Threads comments:", error);
    return [];
  }
}

/**
 * Post a reply to a comment/thread
 * Uses the Threads Reply API
 * @param accessToken - Threads access token
 * @param userId - Threads user ID
 * @param replyToId - The ID of the post/comment to reply to
 * @param text - Reply text
 * @returns The created reply
 */
export async function postThreadsReply(
  accessToken: string,
  userId: string,
  replyToId: string,
  text: string
): Promise<{ id: string }> {
  // Step 1: Create reply media container
  const createParams = new URLSearchParams({
    media_type: "TEXT",
    text: text,
    reply_to_id: replyToId,
    access_token: accessToken,
  });

  const createResponse = await fetch(
    `${THREADS_API_BASE_URL}/v1.0/${userId}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createParams.toString(),
    }
  );

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}));
    throw new Error(
      `Failed to create reply container: ${createResponse.status} ${JSON.stringify(errorData)}`
    );
  }

  const createData = await createResponse.json();
  const containerId = createData.id;

  // Step 2: Publish the reply
  const publishParams = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });

  const publishResponse = await fetch(
    `${THREADS_API_BASE_URL}/v1.0/${userId}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    }
  );

  if (!publishResponse.ok) {
    const errorData = await publishResponse.json().catch(() => ({}));
    throw new Error(
      `Failed to publish reply: ${publishResponse.status} ${JSON.stringify(errorData)}`
    );
  }

  const publishData = await publishResponse.json();
  return { id: publishData.id };
}
