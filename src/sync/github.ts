// Reads and writes the household plan in a PRIVATE GitHub repository, using a key that opens only that repository.
// Every save is a commit, so the repository's history is also a full backup of every change.

export interface Conn {
  owner: string;
  repo: string;
  token: string;
}

export class SyncError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const API = 'https://api.github.com';

function headers(c: Conn): HeadersInit {
  return {
    Authorization: `Bearer ${c.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function explain(status: number): string {
  if (status === 401) return 'The access key was refused — it may have expired or been typed wrongly.';
  if (status === 403) return 'The access key is not allowed to read and write this store.';
  if (status === 404) return 'The private store was not found (or the key cannot see it).';
  return `GitHub answered ${status}.`;
}

export async function readFile(c: Conn, path: string, fetcher = fetch): Promise<{ text: string; sha: string } | null> {
  const r = await fetcher(`${API}/repos/${c.owner}/${c.repo}/contents/${path}?t=${Date.now()}`, { headers: headers(c), cache: 'no-store' });
  if (r.status === 404) {
    // 404 is also what GitHub says when the key cannot see the repo: check the repo itself
    const repo = await fetcher(`${API}/repos/${c.owner}/${c.repo}`, { headers: headers(c), cache: 'no-store' });
    if (!repo.ok) throw new SyncError(repo.status, explain(repo.status));
    return null;
  }
  if (!r.ok) throw new SyncError(r.status, explain(r.status));
  const j = await r.json();
  if (typeof j.content !== 'string') throw new SyncError(500, 'Unexpected answer from GitHub.');
  return { text: b64decode(j.content), sha: j.sha };
}

/** Writes a file. Returns the new sha, or 'conflict' when someone else saved in between. */
export async function writeFile(c: Conn, path: string, text: string, sha: string | null, message: string, fetcher = fetch): Promise<string | 'conflict'> {
  const body: Record<string, unknown> = { message, content: b64encode(text) };
  if (sha) body.sha = sha;
  const r = await fetcher(`${API}/repos/${c.owner}/${c.repo}/contents/${path}`, { method: 'PUT', headers: { ...headers(c), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return 'conflict';
  if (!r.ok) throw new SyncError(r.status, explain(r.status));
  const j = await r.json();
  return j.content.sha;
}

export async function deleteFile(c: Conn, path: string, message: string, fetcher = fetch): Promise<void> {
  const cur = await readFile(c, path, fetcher);
  if (!cur) return;
  const r = await fetcher(`${API}/repos/${c.owner}/${c.repo}/contents/${path}`, { method: 'DELETE', headers: { ...headers(c), 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sha: cur.sha }) });
  if (!r.ok && r.status !== 404) throw new SyncError(r.status, explain(r.status));
}
