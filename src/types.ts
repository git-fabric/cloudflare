/**
 * @git-fabric/cloudflare — shared types
 *
 * Covers: zones, DNS, cache, KV, analytics
 */

export interface CloudflareAdapter {
  accountId: string | undefined;
  get(path: string, params?: Record<string, unknown>): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  put(path: string, body?: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  getRaw(url: string): Promise<string>;
  putRaw(url: string, body: string, params?: Record<string, string>): Promise<void>;
  deleteRaw(url: string): Promise<void>;
}
