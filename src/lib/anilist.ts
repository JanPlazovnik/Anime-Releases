const DEFAULT_LIMIT_PER_MINUTE = 30;

let nextRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export async function anilistQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (;;) {
    await sleep(nextRequestAt - Date.now());
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const limit = Number(res.headers.get("X-RateLimit-Limit") ?? DEFAULT_LIMIT_PER_MINUTE);
    const remaining = Number(res.headers.get("X-RateLimit-Remaining") ?? limit);
    nextRequestAt = Date.now() + (remaining <= 1 ? 60_000 : 60_000 / limit);

    if (res.status === 429) {
      nextRequestAt = Date.now() + Number(res.headers.get("Retry-After") ?? 60) * 1000;
      continue;
    }
    const json = await res.json();
    if (!res.ok || json.errors) {
      throw new Error(`AniList request failed (${res.status}): ${JSON.stringify(json.errors ?? json)}`);
    }
    return json.data;
  }
}

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
