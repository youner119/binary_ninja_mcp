# Binary Ninja MCP Server (TypeScript) — multi-session fork

> **This is a fork** of [fosdickio/binary_ninja_mcp](https://github.com/fosdickio/binary_ninja_mcp).
> For the original npm package, `npx -y binary-ninja-mcp` workflow, Claude Desktop / Cline auto-configuration snippets, and the complete tool overview, see the **upstream `bridge/README.md`**.
> This README documents only what is **different in this fork**.

## What this fork changes in the bridge

- **`view_id` is a required field on every analysis tool** (54 of them), spread in via a shared `viewIdField` zod constant.
- **`create_view` / `list_view` / `delete_view`** tools added; legacy `load_binary` / `list_binaries` / `select_binary` / `get_binary_status` tools removed.
- The `getActiveFilename` helper and `File: <filename>` output prefix are gone — the `view_id` already identifies which binary the LLM is operating on.
- `get_stack_frame_vars` returns the server's full JSON shape (`{stack_frame_vars: [{addr, vars: [...]}]}`) via `JSON.stringify`, not the old joined-string format.
- `delete_comment` / `delete_function_comment` issue `_method: "DELETE"` in a POST body so the plugin's shared `/comment` routes can dispatch correctly.

## Quick start (this fork)

```bash
# Build the bridge from this repo
cd bridge
npm install
npm run build
# -> dist/index.js
```

MCP client configuration (`~/.claude.json` or equivalent):

```json
{
  "mcpServers": {
    "binary_ninja_mcp": {
      "command": "/abs/path/to/node",
      "args": [
        "/abs/path/to/binary_ninja_mcp/bridge/dist/index.js"
      ]
    }
  }
}
```

This fork is **local-only** — not published to npm. The upstream's `npx -y binary-ninja-mcp` package still ships v1 tool names and is incompatible with this fork's v2 plugin (every analysis call requires `view_id`). Use the locally-built `dist/index.js` from this repo.

## Tool catalog (this fork)

See the [main `README.md`](../README.md#supported-capabilities-this-fork) for the full table — every analysis tool takes `view_id` as the first argument, and the three view-lifecycle tools (`create_view`, `list_view`, `delete_view`) replace upstream's binary-management tools. The bridge exposes **59 tools total**: 3 view-lifecycle + 2 view-agnostic utilities (`list_platforms`, `convert_number`) + 54 view-aware analysis tools.

## Differences from upstream at a glance

| Aspect | Upstream | This fork |
|---|---|---|
| Tool count | 60 | 59 (`-4` legacy view-management, `+3` view-lifecycle) |
| Active binary | Implicit (via `select_binary`) | Explicit `view_id` on every call |
| `client.post("comment", ...)` semantics | One verb per route | POST body `_method: "DELETE"` for delete-on-shared-path routes |
| `get_stack_frame_vars` output | Joined string | `JSON.stringify` of full server response |
| Distribution | Published as `npx binary-ninja-mcp` | Local build only (`bridge/dist/index.js`) — this is a private fork, not published to npm |

## Upstream documentation

For the original CLI flag reference, `npx`/global-install/from-source flows, Claude Desktop / Cline configuration examples, requirements, and license, see the upstream `bridge/README.md` at <https://github.com/fosdickio/binary_ninja_mcp/blob/main/bridge/README.md>.

## License

GPL-3.0 (inherited from upstream).
