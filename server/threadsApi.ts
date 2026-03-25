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
