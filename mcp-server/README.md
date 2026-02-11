# CoSeal MCP Server

An MCP (Model Context Protocol) server that exposes CoSeal e-signature tools to Claude Desktop and Cowork. This lets Claude create, send, check, and manage signature envelopes through natural conversation.

## Tools

| Tool | Description |
|------|-------------|
| `create_envelope` | Create a new envelope with signers and optional PDF attachment |
| `send_envelope` | Send a draft envelope to its signers |
| `check_status` | Get envelope status and signer progress |
| `list_envelopes` | List recent envelopes with optional status filter |
| `void_envelope` | Cancel/void an envelope |

## Quick Start

### 1. Build the server

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure Claude Desktop

Add the following to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "coseal": {
      "command": "node",
      "args": ["/Users/YOU/Desktop/CoSeal/mcp-server/dist/index.js"],
      "env": {
        "COSEAL_API_URL": "http://localhost:3000",
        "COSEAL_API_KEY": "dev_local_api_key_change_this_in_production"
      }
    }
  }
}
```

Replace the path and API key with your actual values.

### 3. Restart Claude Desktop

After saving the config, restart Claude Desktop. You should see "coseal" appear in the MCP tools list.

## Configure for Cursor / Cowork

Add to your `.cursor/mcp.json` (workspace-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "coseal": {
      "command": "node",
      "args": ["/Users/YOU/Desktop/CoSeal/mcp-server/dist/index.js"],
      "env": {
        "COSEAL_API_URL": "http://localhost:3000",
        "COSEAL_API_KEY": "dev_local_api_key_change_this_in_production"
      }
    }
  }
}
```

## Transport Modes

### stdio (default)

```bash
node dist/index.js
```

Used when Claude Desktop spawns the server as a child process.

### HTTP + SSE

```bash
node dist/index.js --http
```

Starts an HTTP server on port 3001 with SSE transport. Use this for Cowork, remote clients, or when stdio blocks startup.

- **SSE endpoint:** `http://localhost:3001/sse` (GET — establishes SSE stream)
- **Messages:** `http://localhost:3001/messages?sessionId=...` (POST — client sends JSON-RPC)
- **Health:** `http://localhost:3001/health` (GET — server status)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COSEAL_API_URL` | `http://localhost:3000` | Base URL of your CoSeal instance |
| `COSEAL_API_KEY` | *(required)* | API key for authentication |
| `MCP_HTTP_PORT` | `3001` | Port for HTTP+SSE mode |

## Example Conversation

Once installed, you can talk to Claude like:

> **You**: Send an NDA to alice@example.com for signature.
>
> **Claude**: I'll create an envelope for that. *(calls create_envelope)*
> Created envelope `abc-123`. Ready to send?
>
> **You**: Yes, send it.
>
> **Claude**: *(calls send_envelope)* Done — Alice will receive a signing link via email.
>
> **You**: Has she signed yet?
>
> **Claude**: *(calls check_status)* Not yet. The envelope is "sent" and Alice's status is "notified".

## Development

Run the server in development mode (auto-reload):

```bash
npm run dev
```

Test with the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture

```
Claude Desktop / Cowork
  │
  │  stdio (MCP protocol)
  │
  ▼
CoSeal MCP Server (this package)
  │
  │  HTTP REST API
  │
  ▼
CoSeal API Server (port 3000)
  │
  ├── PostgreSQL (envelopes, signers, audit)
  ├── Local/S3 Storage (encrypted documents)
  └── Signing UI (React SPA)
```

The MCP server is a thin translation layer: it converts Claude's tool calls into CoSeal REST API requests and formats the responses as readable text for Claude.
