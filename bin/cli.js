#!/usr/bin/env node
import { createApp } from '../dist/app.js';
import { Library } from '../dist/library.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from 'node:http';

const app = createApp();
const library = new Library();

function buildServer() {
  const server = new Server({ name: app.name, version: app.version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: app.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = app.tools.find((t) => t.name === req.params.name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
    try {
      const result = await tool.execute(req.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: String(e) }], isError: true };
    }
  });

  return server;
}

// ── Gateway registration ─────────────────────────────────────────────────────

const GATEWAY_URL = process.env.GATEWAY_URL;
const MCP_HTTP_PORT = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : null;
const POD_IP = process.env.POD_IP || '0.0.0.0';

let sessionToken = null;

async function registerWithGateway() {
  if (!GATEWAY_URL) return;
  const mcpEndpoint = `http://${POD_IP}:${MCP_HTTP_PORT || 8200}/mcp`;
  const body = {
    fabric_id: 'fabric-cloudflare',
    as_number: 65008,
    version: app.version,
    mcp_endpoint: mcpEndpoint,
    ollama_endpoint: process.env.OLLAMA_ENDPOINT || 'http://ollama.fabric-sdk:11434',
    ollama_model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
    supervisor: 'standalone',
    tailscale_node: 'fabric-cloudflare',
    worker_pool: { total: 0, healthy: 0, workers: [] },
    routes: [
      { prefix: 'fabric.cloudflare', local_pref: 100, confidence_floor: 0.7, description: 'Cloudflare infrastructure — DNS, zones, cache, KV, analytics' },
      { prefix: 'fabric.cloudflare.dns', local_pref: 100, confidence_floor: 0.7, description: 'DNS management — records, DNSSEC, zone transfers' },
      { prefix: 'fabric.cloudflare.zones', local_pref: 100, confidence_floor: 0.7, description: 'Zone management — domains, settings, analytics' },
      { prefix: 'fabric.cloudflare.kv', local_pref: 100, confidence_floor: 0.7, description: 'Workers KV — namespaces, keys, values' },
      { prefix: 'fabric.cloudflare.cache', local_pref: 100, confidence_floor: 0.7, description: 'Cache management — purge, rules, CDN' },
    ],
  };

  try {
    const res = await fetch(`${GATEWAY_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      sessionToken = data.session_token;
      console.log(`[fabric-cloudflare] Registered with gateway: ${sessionToken} (${data.routes_accepted} routes)`);
    } else {
      console.warn(`[fabric-cloudflare] Registration rejected: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.warn(`[fabric-cloudflare] Gateway registration failed (standalone mode): ${err.message}`);
  }
}

async function sendKeepalive() {
  if (!GATEWAY_URL || !sessionToken) return;
  try {
    const res = await fetch(`${GATEWAY_URL}/keepalive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fabric_id: 'fabric-cloudflare',
        session_token: sessionToken,
        worker_pool: { total: 0, healthy: 0, workers: [] },
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });
    if (res.status === 401) {
      console.log('[fabric-cloudflare] Session expired — re-registering');
      sessionToken = null;
      await registerWithGateway();
    }
  } catch {
    // Gateway unreachable — will retry next interval
  }
}

// ── Server startup ───────────────────────────────────────────────────────────

const httpPort = MCP_HTTP_PORT;

if (httpPort) {
  const httpServer = createServer(async (req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      const h = await app.health();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(h));
      return;
    }
    if (req.url === '/tools') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(app.tools.map((t) => ({ name: t.name, description: t.description }))));
      return;
    }
    // MCP tool call endpoint for gateway DNS unicast resolution
    if ((req.url === '/mcp/tools/call' || req.url === '/tools/call') && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      // Handle aiana_query — gateway DNS resolver asks for context
      //
      // Two knowledge sources, checked in order:
      //   1. Live Cloudflare API (deterministic) — real-time infrastructure state
      //   2. Library (reference) — Cloudflare docs, fetched from git on demand
      //
      // Live API answers "what IS the state" — library answers "how to" and "why"
      if (body.name === 'aiana_query') {
        const queryText = (body.arguments?.query_text || '').toLowerCase();
        try {
          let context = '';
          let confidence = 0;
          let source = 'cloudflare-api';

          // ── Live Cloudflare queries (real-time state) ──────────────
          if (/\b(list|show|get|what)\b.*\b(zone|domain|site)s?\b/.test(queryText) && !queryText.includes('how')) {
            const zones = await app.tools.find(t => t.name === 'cf_list_zones')?.execute({});
            context = JSON.stringify(zones, null, 2);
            confidence = 0.95;
          } else if (/\b(list|show|get)\b.*\b(dns|record)s?\b/.test(queryText) && !queryText.includes('how')) {
            // Need a zone_id — list zones first, use first zone
            const zones = await app.tools.find(t => t.name === 'cf_list_zones')?.execute({});
            context = JSON.stringify(zones, null, 2);
            confidence = 0.8;
            source = 'cloudflare-api';
          } else if (/\b(list|show|get)\b.*\b(kv|namespace|key.?value)\b/.test(queryText) && !queryText.includes('how')) {
            const kv = await app.tools.find(t => t.name === 'cf_list_kv_namespaces')?.execute({});
            context = JSON.stringify(kv, null, 2);
            confidence = 0.9;
          } else if (/\b(purge|clear|flush)\b.*\b(cache)\b/.test(queryText)) {
            context = 'To purge cache, use cf_purge_cache with a zone_id. Set purge_everything: true to purge all, or specify files/tags/hosts arrays for selective purge.';
            confidence = 0.85;
            source = 'tool-hint';
          } else if (/\b(analytic|traffic|bandwidth|request|pageview)\b/.test(queryText)) {
            const zones = await app.tools.find(t => t.name === 'cf_list_zones')?.execute({});
            context = JSON.stringify(zones, null, 2);
            confidence = 0.75;
            source = 'cloudflare-api';
          } else {
            // ── Library queries (reference docs) ──────────────────────
            const libraryResult = await library.query(queryText);
            if (libraryResult && libraryResult.context) {
              context = libraryResult.context;
              confidence = libraryResult.confidence;
              source = 'library';
              console.log(`[fabric-cloudflare] Library hit: ${libraryResult.sources.join(', ')}`);
            } else {
              // Nothing in library either — return zone list as fallback
              const zones = await app.tools.find(t => t.name === 'cf_list_zones')?.execute({});
              context = JSON.stringify(zones, null, 2);
              confidence = 0.5;
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ context, confidence, source }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ context: `Error querying Cloudflare: ${err.message}`, confidence: 0 }));
        }
        return;
      }

      const tool = app.tools.find((t) => t.name === body.name);
      if (!tool) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Tool not found: ${body.name}` }));
        return;
      }
      try {
        const result = await tool.execute(body.arguments ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.url === '/mcp' || req.url === '/') {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = buildServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, undefined);
      return;
    }
    res.writeHead(404).end('not found');
  });

  httpServer.listen(httpPort, () => {
    console.log(`[fabric-cloudflare] ${app.name} v${app.version} — ${app.tools.length} tools`);
    console.log(`[fabric-cloudflare] MCP server listening on :${httpPort}`);
    console.log(`[fabric-cloudflare] Endpoints: /health /tools /tools/call /mcp/tools/call /mcp`);
  });

  // Register with gateway after server is listening
  await registerWithGateway();

  // Keepalive every 30s
  if (GATEWAY_URL) {
    setInterval(sendKeepalive, 30_000);
  }
} else {
  const transport = new StdioServerTransport();
  const server = buildServer();
  await server.connect(transport);
}
