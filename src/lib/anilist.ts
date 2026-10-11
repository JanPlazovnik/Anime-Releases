export async function anilistQuery<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  for (;;) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 60);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    const json = await res.json();
    if (!res.ok || json.errors) {
      throw new Error(`AniList request failed (${res.status}): ${JSON.stringify(json.errors ?? json)}`);
    }
    return json.data;
  }
}

export const VIEWER_QUERY = `
  query {
    Viewer { id name avatar { medium } }
  }
`;

export const LIST_QUERY = `
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME, status_in: [CURRENT, PLANNING, PAUSED]) {
      lists {
        entries {
          mediaId
          status
          progress
        }
      }
    }
  }
`;

export const AIRING_QUERY = `
  query ($page: Int, $from: Int, $to: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
        id
        episode
        airingAt
        media {
          id
          siteUrl
          episodes
          title { english romaji }
          coverImage { large }
          bannerImage
          description(asHtml: false)
          format
          season
          seasonYear
          averageScore
          genres
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  }
`;
