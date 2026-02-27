/**
 * Cloudflare environment adapter
 * Required: CLOUDFLARE_API_TOKEN
 * Optional: CLOUDFLARE_ACCOUNT_ID
 */
const CF_API = 'https://api.cloudflare.com/client/v4';
export function createAdapterFromEnv() {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token)
        throw new Error('CLOUDFLARE_API_TOKEN is required');
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    async function cfFetch(url, init) {
        const res = await fetch(url, {
            ...init,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        });
        if (!res.ok)
            throw new Error(`Cloudflare ${init.method ?? 'GET'} ${url}: ${res.status} ${await res.text()}`);
        const data = await res.json();
        if (!data.success)
            throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
        return data.result;
    }
    return {
        accountId,
        async get(path, params) {
            const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
            return cfFetch(`${CF_API}${path}${q}`, { method: 'GET' });
        },
        async post(path, body) {
            return cfFetch(`${CF_API}${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
        },
        async put(path, body) {
            return cfFetch(`${CF_API}${path}`, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
        },
        async delete(path) {
            return cfFetch(`${CF_API}${path}`, { method: 'DELETE' });
        },
        async getRaw(url) {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok)
                throw new Error(`Cloudflare GET ${url}: ${res.status}`);
            return res.text();
        },
        async putRaw(url, body, params) {
            const q = params ? '?' + new URLSearchParams(params).toString() : '';
            const res = await fetch(`${url}${q}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body });
            if (!res.ok)
                throw new Error(`Cloudflare PUT ${url}: ${res.status}`);
        },
        async deleteRaw(url) {
            const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok)
                throw new Error(`Cloudflare DELETE ${url}: ${res.status}`);
        },
    };
}
//# sourceMappingURL=env.js.map