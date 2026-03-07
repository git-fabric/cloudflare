/**
 * Library — git-based knowledge retrieval for fabric-cloudflare
 *
 * The librarian model: we know where the books are, we go fetch them
 * when asked, and we return them when done. No photocopies.
 *
 * Sources:
 *   - cloudflare/cloudflare-docs — official Cloudflare developer documentation
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
const LIBRARY_DIR = process.env.LIBRARY_DIR || '/tmp/fabric-library';
const SOURCES = [
    {
        id: 'cloudflare-docs',
        repo: 'https://github.com/cloudflare/cloudflare-docs.git',
        branch: 'production',
        description: 'Cloudflare developer documentation — DNS, Workers, Pages, KV, WAF, SSL, cache',
        useRawApi: true,
        topics: [
            // ── DNS ──────────────────────────────────────────────────────
            { keywords: ['dns', 'record', 'a record', 'aaaa', 'cname', 'mx', 'txt', 'nameserver'],
                files: ['src/content/docs/dns/manage-dns-records/how-to/create-dns-records.mdx', 'src/content/docs/dns/manage-dns-records/reference/dns-record-types.mdx'],
                description: 'DNS record management and record types' },
            { keywords: ['dnssec', 'dns security'],
                files: ['src/content/docs/dns/dnssec/index.mdx'],
                description: 'DNSSEC configuration' },
            { keywords: ['dns zone', 'zone transfer', 'secondary dns'],
                files: ['src/content/docs/dns/zone-setups/index.mdx'],
                description: 'DNS zone setup and transfers' },
            // ── Zones ────────────────────────────────────────────────────
            { keywords: ['zone', 'domain', 'add site', 'add domain', 'setup'],
                files: ['src/content/docs/fundamentals/setup/index.mdx', 'src/content/docs/fundamentals/setup/manage-domains/add-site.mdx'],
                description: 'Zone setup and domain management' },
            { keywords: ['zone settings', 'zone config'],
                files: ['src/content/docs/fundamentals/setup/manage-domains/index.mdx'],
                description: 'Zone configuration' },
            // ── KV ───────────────────────────────────────────────────────
            { keywords: ['kv', 'key value', 'key-value', 'workers kv', 'namespace'],
                files: ['src/content/docs/kv/get-started.mdx', 'src/content/docs/kv/concepts/how-kv-works.mdx'],
                description: 'Workers KV key-value storage' },
            { keywords: ['kv api', 'kv binding', 'kv write', 'kv read'],
                files: ['src/content/docs/kv/api/index.mdx'],
                description: 'KV API reference' },
            // ── Cache ────────────────────────────────────────────────────
            { keywords: ['cache', 'purge', 'caching', 'cdn', 'ttl', 'edge cache'],
                files: ['src/content/docs/cache/how-to/purge-cache/index.mdx', 'src/content/docs/cache/concepts/default-cache-behavior.mdx'],
                description: 'Cache and CDN configuration' },
            { keywords: ['cache rules', 'page rules', 'cache control'],
                files: ['src/content/docs/cache/how-to/cache-rules/index.mdx'],
                description: 'Cache rules and page rules' },
            // ── Workers ──────────────────────────────────────────────────
            { keywords: ['worker', 'workers', 'serverless', 'edge function', 'script'],
                files: ['src/content/docs/workers/get-started/guide.mdx'],
                description: 'Cloudflare Workers serverless platform' },
            { keywords: ['worker api', 'worker binding', 'wrangler', 'deploy worker'],
                files: ['src/content/docs/workers/wrangler/commands.mdx'],
                description: 'Workers deployment and wrangler CLI' },
            { keywords: ['durable object', 'durable objects'],
                files: ['src/content/docs/durable-objects/get-started.mdx'],
                description: 'Durable Objects stateful serverless' },
            // ── Pages ────────────────────────────────────────────────────
            { keywords: ['pages', 'static site', 'jamstack', 'deploy site'],
                files: ['src/content/docs/pages/get-started/guide.mdx'],
                description: 'Cloudflare Pages static site hosting' },
            { keywords: ['pages function', 'pages api', 'pages build'],
                files: ['src/content/docs/pages/functions/index.mdx'],
                description: 'Pages Functions (serverless)' },
            // ── WAF ──────────────────────────────────────────────────────
            { keywords: ['waf', 'firewall', 'web application firewall', 'managed rules', 'owasp'],
                files: ['src/content/docs/waf/managed-rules/index.mdx'],
                description: 'Web Application Firewall managed rules' },
            { keywords: ['custom rule', 'firewall rule', 'rate limit', 'rate limiting'],
                files: ['src/content/docs/waf/custom-rules/index.mdx', 'src/content/docs/waf/rate-limiting-rules/index.mdx'],
                description: 'Custom firewall and rate limiting rules' },
            { keywords: ['bot', 'bot management', 'bot fight'],
                files: ['src/content/docs/bots/index.mdx'],
                description: 'Bot management' },
            // ── SSL / TLS ────────────────────────────────────────────────
            { keywords: ['ssl', 'tls', 'certificate', 'https', 'origin cert', 'edge cert'],
                files: ['src/content/docs/ssl/get-started.mdx'],
                description: 'SSL/TLS certificate management' },
            { keywords: ['origin certificate', 'origin ca', 'client certificate', 'mtls'],
                files: ['src/content/docs/ssl/origin-configuration/origin-ca.mdx'],
                description: 'Origin certificates and mTLS' },
            { keywords: ['full strict', 'ssl mode', 'encryption mode', 'flexible ssl'],
                files: ['src/content/docs/ssl/origin-configuration/ssl-modes/index.mdx'],
                description: 'SSL encryption modes' },
        ],
    },
];
export class Library {
    cacheDir;
    constructor() {
        this.cacheDir = LIBRARY_DIR;
        if (!existsSync(this.cacheDir)) {
            mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    findTopics(query) {
        const q = query.toLowerCase();
        const matches = [];
        for (const source of SOURCES) {
            for (const topic of source.topics) {
                let score = 0;
                for (const kw of topic.keywords) {
                    if (q.includes(kw)) {
                        score += kw.length;
                    }
                }
                if (score > 0) {
                    matches.push({ source, topic, score });
                }
            }
        }
        return matches.sort((a, b) => b.score - a.score);
    }
    checkout(source) {
        if (source.useRawApi)
            return '';
        const localPath = join(this.cacheDir, source.id);
        if (existsSync(join(localPath, '.git'))) {
            try {
                execSync(`git -C ${localPath} pull --depth 1 --rebase 2>/dev/null || true`, {
                    timeout: 15000,
                    stdio: 'pipe',
                });
            }
            catch {
                // Stale cache is better than no cache
            }
            return localPath;
        }
        execSync(`git clone --depth 1 --branch ${source.branch} ${source.repo} ${localPath}`, { timeout: 60000, stdio: 'pipe' });
        return localPath;
    }
    readFiles(source, files) {
        if (source.useRawApi) {
            return this.readFilesFromGitHub(source, files);
        }
        const localPath = this.checkout(source);
        const sections = [];
        for (const file of files) {
            const fullPath = join(localPath, file);
            if (existsSync(fullPath)) {
                try {
                    const content = readFileSync(fullPath, 'utf-8');
                    const trimmed = content.length > 8000
                        ? content.slice(0, 8000) + '\n\n...[truncated — full source at ' + file + ']'
                        : content;
                    sections.push(`--- ${file} ---\n${trimmed}`);
                }
                catch {
                    // Skip unreadable files
                }
            }
        }
        return sections.join('\n\n');
    }
    readFilesFromGitHub(source, files) {
        const match = source.repo.match(/github\.com\/([^/]+\/[^/.]+)/);
        if (!match)
            return '';
        const ownerRepo = match[1];
        const sections = [];
        for (const file of files) {
            try {
                const url = `https://raw.githubusercontent.com/${ownerRepo}/${source.branch}/${file}`;
                const content = execSync(`curl -sf --max-time 10 "${url}"`, {
                    timeout: 12000,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    encoding: 'utf-8',
                });
                if (content) {
                    const trimmed = content.length > 8000
                        ? content.slice(0, 8000) + '\n\n...[truncated — full source at ' + file + ']'
                        : content;
                    sections.push(`--- ${file} ---\n${trimmed}`);
                }
            }
            catch {
                // Skip unavailable files
            }
        }
        return sections.join('\n\n');
    }
    async query(queryText) {
        const matches = this.findTopics(queryText);
        if (matches.length === 0)
            return null;
        const topMatches = matches.slice(0, 3);
        const seenFiles = new Set();
        const filesToRead = [];
        for (const m of topMatches) {
            for (const f of m.topic.files) {
                const key = `${m.source.id}:${f}`;
                if (!seenFiles.has(key)) {
                    seenFiles.add(key);
                    filesToRead.push({ source: m.source, file: f });
                }
            }
        }
        const capped = filesToRead.slice(0, 6);
        const bySource = new Map();
        for (const { source, file } of capped) {
            const existing = bySource.get(source.id);
            if (existing) {
                existing.files.push(file);
            }
            else {
                bySource.set(source.id, { source, files: [file] });
            }
        }
        const sections = [];
        const sources = [];
        for (const { source, files } of bySource.values()) {
            try {
                const content = this.readFiles(source, files);
                if (content) {
                    sections.push(content);
                    sources.push(...files.map(f => `${source.id}/${f}`));
                }
            }
            catch {
                // Continue with other sources
            }
        }
        if (sections.length === 0)
            return null;
        const context = sections.join('\n\n');
        const bestScore = topMatches[0].score;
        const confidence = Math.min(0.92, 0.6 + bestScore * 0.04);
        return { context, confidence, sources };
    }
    listSources() {
        return SOURCES.map(s => ({
            id: s.id,
            repo: s.repo,
            topics: s.topics.length,
            description: s.description,
        }));
    }
}
//# sourceMappingURL=library.js.map