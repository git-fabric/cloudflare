/**
 * @git-fabric/cloudflare — FabricApp factory
 * 13 tools: zones, DNS, cache, KV, analytics
 */
import { createAdapterFromEnv } from './adapters/env.js';
export function createApp(adapterOverride) {
    const cf = adapterOverride ?? createAdapterFromEnv();
    function accountId(args) {
        const id = args.account_id ?? cf.accountId;
        if (!id)
            throw new Error('account_id required (or set CLOUDFLARE_ACCOUNT_ID)');
        return id;
    }
    const tools = [
        { name: 'cf_list_zones', description: 'List zones (domains) in the Cloudflare account.',
            inputSchema: { type: 'object', properties: { name: { type: 'string' }, status: { type: 'string', enum: ['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'] }, page: { type: 'number' }, per_page: { type: 'number' } } },
            execute: async (a) => { const p = {}; if (a.name)
                p.name = a.name; if (a.status)
                p.status = a.status; if (a.page)
                p.page = a.page; if (a.per_page)
                p.per_page = a.per_page; return cf.get('/zones', p); } },
        { name: 'cf_get_zone', description: 'Get details for a specific zone.',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' } }, required: ['zone_id'] },
            execute: async (a) => cf.get(`/zones/${a.zone_id}`) },
        { name: 'cf_list_dns_records', description: 'List DNS records for a zone.',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' }, page: { type: 'number' }, per_page: { type: 'number' } }, required: ['zone_id'] },
            execute: async (a) => { const p = {}; if (a.type)
                p.type = a.type; if (a.name)
                p.name = a.name; if (a.content)
                p.content = a.content; if (a.page)
                p.page = a.page; if (a.per_page)
                p.per_page = a.per_page; return cf.get(`/zones/${a.zone_id}/dns_records`, p); } },
        { name: 'cf_create_dns_record', description: 'Create a DNS record in a zone.',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' }, ttl: { type: 'number' }, proxied: { type: 'boolean' }, priority: { type: 'number' }, comment: { type: 'string' } }, required: ['zone_id', 'type', 'name', 'content'] },
            execute: async (a) => { const b = { type: a.type, name: a.name, content: a.content, ttl: a.ttl ?? 1 }; if (a.proxied !== undefined)
                b.proxied = a.proxied; if (a.priority)
                b.priority = a.priority; if (a.comment)
                b.comment = a.comment; return cf.post(`/zones/${a.zone_id}/dns_records`, b); } },
        { name: 'cf_update_dns_record', description: 'Update an existing DNS record.',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' }, record_id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' }, ttl: { type: 'number' }, proxied: { type: 'boolean' }, comment: { type: 'string' } }, required: ['zone_id', 'record_id', 'type', 'name', 'content'] },
            execute: async (a) => { const b = { type: a.type, name: a.name, content: a.content }; if (a.ttl)
                b.ttl = a.ttl; if (a.proxied !== undefined)
                b.proxied = a.proxied; if (a.comment)
                b.comment = a.comment; return cf.put(`/zones/${a.zone_id}/dns_records/${a.record_id}`, b); } },
        { name: 'cf_delete_dns_record', description: 'Delete a DNS record.',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' }, record_id: { type: 'string' } }, required: ['zone_id', 'record_id'] },
            execute: async (a) => cf.delete(`/zones/${a.zone_id}/dns_records/${a.record_id}`) },
        { name: 'cf_purge_cache', description: 'Purge cache for a zone. Purge everything or specific files/tags/hosts.',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' }, purge_everything: { type: 'boolean' }, files: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, hosts: { type: 'array', items: { type: 'string' } } }, required: ['zone_id'] },
            execute: async (a) => { const b = {}; if (a.purge_everything) {
                b.purge_everything = true;
            }
            else {
                if (a.files)
                    b.files = a.files;
                if (a.tags)
                    b.tags = a.tags;
                if (a.hosts)
                    b.hosts = a.hosts;
            } return cf.post(`/zones/${a.zone_id}/purge_cache`, b); } },
        { name: 'cf_list_kv_namespaces', description: 'List Workers KV namespaces.',
            inputSchema: { type: 'object', properties: { account_id: { type: 'string' }, page: { type: 'number' }, per_page: { type: 'number' } } },
            execute: async (a) => { const p = {}; if (a.page)
                p.page = a.page; if (a.per_page)
                p.per_page = a.per_page; return cf.get(`/accounts/${accountId(a)}/storage/kv/namespaces`, p); } },
        { name: 'cf_list_kv_keys', description: 'List keys in a KV namespace.',
            inputSchema: { type: 'object', properties: { account_id: { type: 'string' }, namespace_id: { type: 'string' }, prefix: { type: 'string' }, limit: { type: 'number' }, cursor: { type: 'string' } }, required: ['namespace_id'] },
            execute: async (a) => { const p = {}; if (a.prefix)
                p.prefix = a.prefix; if (a.limit)
                p.limit = a.limit; if (a.cursor)
                p.cursor = a.cursor; return cf.get(`/accounts/${accountId(a)}/storage/kv/namespaces/${a.namespace_id}/keys`, p); } },
        { name: 'cf_read_kv_value', description: 'Read a value from KV storage by key.',
            inputSchema: { type: 'object', properties: { account_id: { type: 'string' }, namespace_id: { type: 'string' }, key: { type: 'string' } }, required: ['namespace_id', 'key'] },
            execute: async (a) => ({ value: await cf.getRaw(`https://api.cloudflare.com/client/v4/accounts/${accountId(a)}/storage/kv/namespaces/${a.namespace_id}/values/${a.key}`) }) },
        { name: 'cf_write_kv_value', description: 'Write a key-value pair to KV storage.',
            inputSchema: { type: 'object', properties: { account_id: { type: 'string' }, namespace_id: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' }, expiration_ttl: { type: 'number' } }, required: ['namespace_id', 'key', 'value'] },
            execute: async (a) => { const p = {}; if (a.expiration_ttl)
                p.expiration_ttl = String(a.expiration_ttl); await cf.putRaw(`https://api.cloudflare.com/client/v4/accounts/${accountId(a)}/storage/kv/namespaces/${a.namespace_id}/values/${a.key}`, a.value, p); return { ok: true }; } },
        { name: 'cf_delete_kv_value', description: 'Delete a key from KV storage.',
            inputSchema: { type: 'object', properties: { account_id: { type: 'string' }, namespace_id: { type: 'string' }, key: { type: 'string' } }, required: ['namespace_id', 'key'] },
            execute: async (a) => { await cf.deleteRaw(`https://api.cloudflare.com/client/v4/accounts/${accountId(a)}/storage/kv/namespaces/${a.namespace_id}/values/${a.key}`); return { ok: true }; } },
        { name: 'cf_zone_analytics', description: 'Get analytics for a zone (requests, bandwidth, threats, pageviews).',
            inputSchema: { type: 'object', properties: { zone_id: { type: 'string' }, since: { type: 'string' }, until: { type: 'string' } }, required: ['zone_id'] },
            execute: async (a) => { const p = {}; if (a.since)
                p.since = a.since; if (a.until)
                p.until = a.until; return cf.get(`/zones/${a.zone_id}/analytics/dashboard`, p); } },
    ];
    return {
        name: '@git-fabric/cloudflare', version: '0.1.0',
        description: 'Cloudflare fabric app — DNS, zones, cache, and KV',
        tools,
        async health() {
            const start = Date.now();
            try {
                await cf.get('/zones', { per_page: '1' });
                return { app: '@git-fabric/cloudflare', status: 'healthy', latencyMs: Date.now() - start };
            }
            catch (e) {
                return { app: '@git-fabric/cloudflare', status: 'unavailable', latencyMs: Date.now() - start, details: { error: String(e) } };
            }
        },
    };
}
//# sourceMappingURL=app.js.map