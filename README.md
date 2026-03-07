# @git-fabric/cloudflare

Cloudflare fabric app -- DNS, zones, cache, and KV as a composable MCP layer. Part of [git-fabric](https://github.com/git-fabric).

## What it is

A self-contained autonomous fabric that exposes 13 Cloudflare API v4 operations as MCP tools. Runs standalone via stdio or registers with the [fabric-sdk gateway](https://github.com/git-fabric/sdk) as AS65008, advertising `fabric.cloudflare.*` routes into the F-RIB.

Queries route through three lanes: deterministic (live Cloudflare API, confidence >= 0.95), local-llm (library reference docs via Ollama, confidence >= floor), and Claude (default route, last resort). The library module pulls official Cloudflare documentation from `cloudflare/cloudflare-docs` on demand -- no local copies, no embeddings, just git-based retrieval.

## Tools

| Tool | Description |
|------|-------------|
| `cf_list_zones` | List zones (domains) in the Cloudflare account |
| `cf_get_zone` | Get details for a specific zone |
| `cf_list_dns_records` | List DNS records for a zone |
| `cf_create_dns_record` | Create a DNS record in a zone |
| `cf_update_dns_record` | Update an existing DNS record |
| `cf_delete_dns_record` | Delete a DNS record |
| `cf_purge_cache` | Purge cache for a zone (everything or selective files/tags/hosts) |
| `cf_list_kv_namespaces` | List Workers KV namespaces |
| `cf_list_kv_keys` | List keys in a KV namespace |
| `cf_read_kv_value` | Read a value from KV storage by key |
| `cf_write_kv_value` | Write a key-value pair to KV storage |
| `cf_delete_kv_value` | Delete a key from KV storage |
| `cf_zone_analytics` | Get analytics for a zone (requests, bandwidth, threats, pageviews) |

## OSI Layer Architecture

```
Layer 7 -- Application    app.ts (FabricApp factory, 13 tools)
Layer 6 -- Presentation   bin/cli.js (MCP stdio + HTTP, aiana_query)
Layer 5 -- Session        (stateless -- direct API queries)
Layer 4 -- Transport      MCP protocol (stdio + StreamableHTTP)
Layer 3 -- Network        Gateway registration (AS65008, fabric.cloudflare.*)
Layer 2 -- Data Link      adapters/env.ts (Cloudflare API v4)
Layer 1 -- Physical       Cloudflare API
```

**Layer 7** -- `createApp()` returns a `FabricApp` with 13 tools, a health check, and an injectable adapter. Each tool maps directly to a Cloudflare API v4 endpoint.

**Layer 6** -- `bin/cli.js` bridges MCP protocol and HTTP. In HTTP mode, it handles `aiana_query` for gateway DNS resolution: live API state first, library reference docs as fallback.

**Layer 4** -- Stdio for local/CLI use, StreamableHTTP on `MCP_HTTP_PORT` for gateway integration. Health and tool-list endpoints at `/health` and `/tools`.

**Layer 3** -- On startup, registers with the gateway at `GATEWAY_URL`, advertising routes into the F-RIB. Sends keepalives every 30 seconds.

**Layer 2** -- `createAdapterFromEnv()` reads `CLOUDFLARE_API_TOKEN` and builds an HTTP client wrapping the Cloudflare API v4 base URL.

## Gateway Registration

| Field | Value |
|-------|-------|
| fabric_id | `fabric-cloudflare` |
| AS number | `65008` |
| Routes | `fabric.cloudflare`, `fabric.cloudflare.dns`, `fabric.cloudflare.zones`, `fabric.cloudflare.kv`, `fabric.cloudflare.cache` |
| local_pref | `100` (all routes) |
| MCP endpoint | `http://{POD_IP}:{MCP_HTTP_PORT}/mcp` |

Registration is BGP-style: the fabric advertises knowledge prefixes, the gateway maintains an F-RIB, and queries resolve via unicast to the best-matching prefix.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token with zone/DNS/KV permissions |
| `CLOUDFLARE_ACCOUNT_ID` | No | Default account ID for KV operations (can also pass per-call) |
| `MCP_HTTP_PORT` | No | Port for HTTP/StreamableHTTP mode (omit for stdio) |
| `GATEWAY_URL` | No | Fabric-SDK gateway URL for registration (e.g. `http://gateway:8080`) |
| `POD_IP` | No | Pod IP advertised to gateway (default: `0.0.0.0`) |
| `OLLAMA_ENDPOINT` | No | Ollama endpoint for local LLM inference (default: `http://ollama.fabric-sdk:11434`) |
| `OLLAMA_MODEL` | No | Ollama model for local inference (default: `qwen2.5-coder:3b`) |

## Library

The library module (`src/library.ts`) provides git-based knowledge retrieval from the official [cloudflare/cloudflare-docs](https://github.com/cloudflare/cloudflare-docs) repository. It uses keyword matching to find relevant documentation files and fetches them via the GitHub raw API -- no cloning, no embeddings, no vector store.

Coverage: DNS, zones, KV, cache, Workers, Pages, WAF, SSL/TLS, bot management, Durable Objects.

The library feeds the `aiana_query` handler: when a gateway DNS query does not match a live-API pattern, the library supplies reference documentation as context.

## Usage

### Standalone (stdio)

```bash
CLOUDFLARE_API_TOKEN=cf-xxx npx @git-fabric/cloudflare
```

Connects via stdio -- use with Claude Desktop, claude-code, or any MCP client.

### With gateway (HTTP)

```bash
CLOUDFLARE_API_TOKEN=cf-xxx \
MCP_HTTP_PORT=8200 \
GATEWAY_URL=http://gateway:8080 \
POD_IP=10.42.0.15 \
node bin/cli.js
```

Starts HTTP server on port 8200, registers with the gateway, and begins keepalive cycle. The gateway can then route `fabric.cloudflare.*` queries to this fabric via unicast.

## Related

- [git-fabric/sdk](https://github.com/git-fabric/sdk) -- Gateway, client, and routing model (BGP-style F-RIB)

## License

MIT
