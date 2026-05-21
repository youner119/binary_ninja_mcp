# Binary Ninja MCP — multi-session fork

> **This is a fork** of [fosdickio/binary_ninja_mcp](https://github.com/fosdickio/binary_ninja_mcp).
> For the original feature set, installation walkthrough, MCP-client auto-setup, the CTF demo video, prerequisites, and contributing guidelines, please refer to **the upstream README**.
> This README documents only what is **different in this fork**.

![Binary Ninja MCP Logo](images/logo-small.png)

## What this fork adds

- **Multi-session model** — register many open binaries under user-assigned `view_id` aliases and analyze them in parallel from one MCP session
- **`view_id` is mandatory on every analysis tool** — there is no implicit "active binary"; calls without a `view_id` return `400`, unknown `view_id` returns `404`
- **`create_view` / `list_view` / `delete_view`** lifecycle tools replace upstream's `load_binary` / `list_binaries` / `select_binary` / `get_binary_status`
- **`ThreadingHTTPServer`** so one slow request can't block unrelated calls
- **Analysis-progress signaling** — long reads return `202 {"analysis_in_progress": true, "state": ..., "progress_pct": ...}` instead of holding the connection until the bridge's 30-second axios timeout fires

See [`.omc/specs/deep-interview-view-id-everywhere.md`](.omc/specs/deep-interview-view-id-everywhere.md) for the full spec that drove the multi-session refactor.

## Multi-session model

A single Binary Ninja instance can manage multiple open binaries simultaneously. Each binary is registered under a user-assigned **`view_id`** alias when loaded via `create_view`. Every analysis tool requires this `view_id` parameter to identify which view it should operate on — there is no implicit "active" binary.

This lets an LLM session analyse several binaries in parallel (e.g., a loader and its payload, two versions of the same binary for diff analysis, or multiple CTF challenges at once) without reloading. Use `list_view` to inspect currently registered views at any time, and `delete_view` to close a view when you are finished (call `save_bndb` first to preserve analysis). Note that Binary Ninja does not permit loading the same filepath twice: if `create_view` returns a 409 conflict, use `list_view` to find the existing alias.

## Quick start (this fork)

```bash
# 1. Clone into your BN plugins folder (or symlink from a dev directory)
git clone https://github.com/youner119/binary_ninja_mcp \
  ~/.binaryninja/plugins/binary_ninja_mcp

# 2. Build the TypeScript bridge
cd ~/.binaryninja/plugins/binary_ninja_mcp/bridge
npm install && npm run build
```

Then configure your MCP client to launch the **TypeScript bridge** (this fork is TS-only — the upstream's Python bridge has been removed because its legacy v1 tool names are incompatible with the v2 plugin):

```json
{
  "mcpServers": {
    "binary_ninja_mcp": {
      "command": "/abs/path/to/node",
      "args": [
        "/path/to/binary_ninja_mcp/bridge/dist/index.js"
      ]
    }
  }
}
```

In the MCP client, before calling any analysis tool:

```
create_view("/path/to/binary", view_id="<short-alias>")
```

For upstream's auto-setup scripts, `npx -y binary-ninja-mcp`, Plugin Manager listing, and Python-bridge config, see the upstream README.

## Supported capabilities (this fork)

All analysis tools require a `view_id` parameter that identifies which binary to operate on (obtained via `create_view`).

### View lifecycle (fork-specific)

| Function | Description |
|---|---|
| `create_view(filepath, view_id)` | Load a binary and register it under a user-assigned `view_id` alias. Returns 409 if the `view_id` already exists, or if the same filepath is already loaded under a different alias. Use this before any analysis tool. |
| `list_view()` | List all currently registered views with `view_id`, filepath, basename, arch, and `analysis_state` for each. |
| `delete_view(view_id)` | Close the BinaryView for the given `view_id` and unregister it. WARNING: unsaved analysis (renames, comments, types) is lost — call `save_bndb` first if you need to preserve work. |

### Analysis tools (all take `view_id` as the first parameter)

| Function | Description |
| -------- | ----------- |
| `decompile_function(view_id, name)` | Decompile a function (HLIL/Pseudo C). |
| `decompile_to_file(view_id, name, output_path)` | Decompile a function and write the full output directly to a file on disk; also returns the pseudocode in the response. |
| `batch_decompile_to_file(view_id, output_dir)` | Decompile every non-imported, non-thunk function and save each to `<output_dir>/<function_name>.txt`. |
| `save_bndb(view_id, output_path)` | Save the analysis state of the view to a `.bndb` database file. |
| `get_il(view_id, name_or_address, view, ssa)` | Get IL for a function in `hlil`, `mlil`, or `llil` (SSA supported for MLIL/LLIL). |
| `fetch_disassembly(view_id, name)` | Get the assembly representation of a function by name. |
| `function_at(view_id, address)` | Retrieve the name of the function the address belongs to. |
| `get_entry_points(view_id)` | List entry point(s) of the binary. |
| `get_callers(view_id, identifier)` | List callers plus call sites for one or more function identifiers. |
| `get_callees(view_id, identifier)` | List callees plus call sites for one or more function identifiers. |
| `search_functions_by_name(view_id, query, offset, limit)` | Search for functions whose name contains the given substring. |
| `get_stack_frame_vars(view_id, function_identifier)` | Get stack frame variable information (names, offsets, sizes, types). |
| `make_function_at(view_id, address, platform)` | Create a function at an address. `platform=default` uses the BinaryView/platform default. |
| `set_function_prototype(view_id, name_or_address, prototype)` | Set a function's prototype. |
| `rename_function(view_id, old_name, new_name)` | Rename a function by its current name. |
| `rename_data(view_id, address, new_name)` | Rename a data label at the specified address. |
| `rename_single_variable(view_id, function_name, variable_name, new_name)` | Rename a single local variable inside a function. |
| `rename_multi_variables(view_id, function_identifier, ...)` | Batch rename multiple local variables (mapping or pairs). |
| `set_local_variable_type(view_id, function_address, variable_name, new_type)` | Set a local variable's type. |
| `retype_variable(view_id, function_name, variable_name, type_str)` | Retype a variable inside a function. |
| `set_comment(view_id, address, comment)` / `get_comment` / `delete_comment` | Address-level comment lifecycle. |
| `set_function_comment(view_id, function_name, comment)` / `get_function_comment` / `delete_function_comment` | Function-level comment lifecycle. |
| `define_types(view_id, c_code)` | Add type definitions from a C string. |
| `declare_c_type(view_id, c_declaration)` | Create/update a local type from a single C declaration. |
| `list_local_types(view_id, offset, count)` / `search_types(view_id, query, ...)` | Enumerate or search local types. |
| `get_user_defined_type(view_id, type_name)` / `get_type_info(view_id, type_name)` | Retrieve type definition / resolved members. |
| `get_xrefs_to(view_id, address)` | Get all cross references (code and data) to an address. |
| `get_xrefs_to_struct(view_id, struct_name)` / `_field` / `_type` / `_enum` / `_union` | Get xrefs/usages for a named type. |
| `list_data_items(view_id, offset, limit)` | List defined data labels and their values. |
| `get_data_decl(view_id, name_or_address, length)` | Return a C-like declaration and a hexdump for a data symbol. |
| `hexdump_address(view_id, address, length)` / `hexdump_data(view_id, name_or_address, length)` | Text hexdump. `length < 0` reads exact defined size if available. |
| `patch_bytes(view_id, address, data, save_to_file)` | Patch raw bytes at an address. `data` is a hex string (e.g., `"90 90"`). `save_to_file` (default True) saves to disk and re-signs on macOS. |
| `format_value(view_id, address, text, size)` | Convert a value and annotate it at an address (adds a comment). |
| `list_methods(view_id, offset, limit)` | List all function names. |
| `list_classes(view_id, offset, limit)` / `list_namespaces` / `list_imports` / `list_exports` / `list_segments` / `list_sections` | Enumerate the corresponding metadata. |
| `list_strings(view_id, offset, count)` / `list_strings_filter(..., filter)` / `list_all_strings(view_id)` | Paginated, filtered, or aggregated string listing. |

### View-agnostic tools (no `view_id`)

| Function | Description |
|---|---|
| `list_platforms()` | List all available platform names. |
| `convert_number(text, size)` | Convert a number/string into multiple representations (hex/dec/bin, char, C literal). `size=0` auto-detects. |

## HTTP endpoints (this fork)

**All analysis endpoints require `?view_id=<alias>`.** Missing `view_id` → **400**. Unknown `view_id` → **404**. If analysis is still in progress, endpoints return **202** with `{"analysis_in_progress": true, ...}` — callers should retry after a short wait.

### View management (no `view_id`)

- `POST /createView?filepath=<path>&view_id=<alias>` — load + register. 200 success, 409 conflict, 400 missing filepath.
- `GET /listView` — list registered views.
- `POST /deleteView?view_id=<alias>` — close + unregister (unsaved analysis is lost).
- `GET /platforms` — list platform names.
- `GET /convertNumber?text=<value>&size=<n>` — number conversions.

### Analysis (all take `?view_id=<alias>`)

- `/decompile`, `/decompileToFile`, `/batchDecompileToFile`, `/il`, `/saveBndb`, `/assembly`
- `/comment` (GET/POST/DELETE), `/comment/function` (GET/POST/DELETE), `/getComment`, `/getFunctionComment`
- `/getXrefsTo`, `/getXrefsToField`, `/getXrefsToStruct`, `/getXrefsToType`, `/getXrefsToEnum`, `/getXrefsToUnion`, `/getTypeInfo`
- `/data`, `/hexdump`, `/hexdumpByName`, `/getDataDecl`, `/allStrings`, `/strings`, `/strings/filter`
- `/methods`, `/functions`, `/searchFunctions`, `/functionAt`, `/getCallers`, `/getCallees`, `/getStackFrameVars`
- `/segments`, `/sections`, `/imports`, `/exports`, `/classes`, `/namespaces`, `/entryPoints`
- `/localTypes`, `/searchTypes`, `/defineTypes`, `/declareCType`, `/getUserDefinedType`
- `/makeFunctionAt`, `/setFunctionPrototype`, `/setLocalVariableType`, `/retypeVariable`, `/renameVariable`, `/renameVariables`
- `/rename/function`, `/rename/data`, `/patch` (alias `/patchBytes`), `/formatValue`

DELETE on `/comment` and `/comment/function` is exposed over POST by adding `_method: "DELETE"` to the JSON body (the bridge does this automatically; only matters if you call the HTTP API directly).

## Differences from upstream at a glance

| Aspect | Upstream | This fork |
|---|---|---|
| Active binary model | Single global `current_view`; `select_binary` to switch | Multi-session via `view_id` alias; no implicit active binary |
| Loading | `load_binary(filepath)` | `create_view(filepath, view_id)` (409 on duplicate filepath) |
| Tool signatures | No view selector | First argument is `view_id` on every analysis tool |
| HTTP server | `HTTPServer` (single-threaded) | `ThreadingHTTPServer` |
| Long-running analysis | Blocks until done (or times out) | Returns `202` with progress payload after ~5s |
| Python bridge | Maintained as one of two entry points | Removed — TypeScript bridge is the only entry point |

## Upstream documentation

This is a **local-only fork** — not published to npm or the Plugin Manager. For everything not listed above — the upstream's `npx binary-ninja-mcp` npm flow, Plugin Manager listing, the CTF demo video, Ruff configuration, GitHub Actions setup, contributing guidelines — see the upstream README at <https://github.com/fosdickio/binary_ninja_mcp>.
