const ENDPOINT = "https://graphql.anilist.co";
const STORAGE_KEY = "anilist";
const RATE_LIMIT_WINDOW_MS = 60_000;

const VIEWER_QUERY = `
  query {
    Viewer { id name avatar { medium } }
  }
`;

const LIST_QUERY = `
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

export type Viewer = { id: number; name: string; avatar: string };
export type Entry = { mediaId: number; listStatus: string; progress: number };
export type Session = { token: string; expiresAt: number; viewer: Viewer; entries: Entry[]; fetchedAt: number };

type ViewerResponse = { Viewer: { id: number; name: string; avatar: { medium: string } } };
type ListResponse = {
  MediaListCollection: { lists: { entries: { mediaId: number; status: string; progress: number }[] }[] };
};

export class InvalidTokenError extends Error {}

let queue: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function send<T>(query: string, variables: Record<string, unknown>, token: string): Promise<T> {
  for (;;) {
    await sleep(nextRequestAt - Date.now());
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429) {
      nextRequestAt = Date.now() + Number(res.headers.get("Retry-After") ?? 60) * 1000;
      continue;
    }
    if (Number(res.headers.get("X-RateLimit-Remaining") ?? Infinity) <= 1) {
      nextRequestAt = Date.now() + RATE_LIMIT_WINDOW_MS;
    }

    const json = await res.json();
    const errors: { message: string }[] = json.errors ?? [];
    if (res.status === 401 || errors.some((e) => /invalid token/i.test(e.message))) throw new InvalidTokenError();
    if (!res.ok || errors.length > 0) {
      throw new Error(`AniList request failed (${res.status}): ${JSON.stringify(errors)}`);
    }
    return json.data;
  }
}

function request<T>(query: string, variables: Record<string, unknown>, token: string) {
  const result = queue.then(() => send<T>(query, variables, token));
  queue = result.catch(() => undefined);
  return result;
}

async function fetchEntries(token: string, userId: number) {
  const data = await request<ListResponse>(LIST_QUERY, { userId }, token);
  const entries = new Map<number, Entry>();
  for (const list of data.MediaListCollection.lists) {
    for (const e of list.entries) {
      entries.set(e.mediaId, { mediaId: e.mediaId, listStatus: e.status, progress: e.progress });
    }
  }
  return [...entries.values()];
}

export function authorizeUrl(clientId: string) {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token`;
}

export function readTokenFromHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  if (!token) return null;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return { token, expiresAt: Date.now() + Number(params.get("expires_in")) * 1000 };
}

export function loadSession(): Session | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  const session: Session = JSON.parse(stored);
  if (session.expiresAt < Date.now()) {
    clearSession();
    return null;
  }
  return session;
}

function saveSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function signIn(token: string, expiresAt: number) {
  const { Viewer } = await request<ViewerResponse>(VIEWER_QUERY, {}, token);
  const viewer = { id: Viewer.id, name: Viewer.name, avatar: Viewer.avatar.medium };
  const entries = await fetchEntries(token, viewer.id);
  return saveSession({ token, expiresAt, viewer, entries, fetchedAt: Date.now() });
}

export async function refreshEntries(session: Session) {
  const entries = await fetchEntries(session.token, session.viewer.id);
  return saveSession({ ...session, entries, fetchedAt: Date.now() });
}
