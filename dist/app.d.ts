/**
 * @git-fabric/cloudflare — FabricApp factory
 * 13 tools: zones, DNS, cache, KV, analytics
 */
import { type CloudflareAdapter } from './adapters/env.js';
interface FabricTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}
interface FabricApp {
    name: string;
    version: string;
    description: string;
    tools: FabricTool[];
    health: () => Promise<{
        app: string;
        status: 'healthy' | 'degraded' | 'unavailable';
        latencyMs?: number;
        details?: Record<string, unknown>;
    }>;
}
export declare function createApp(adapterOverride?: CloudflareAdapter): FabricApp;
export {};
//# sourceMappingURL=app.d.ts.map