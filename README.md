# Binary Ninja MCP

This repository contains a Binary Ninja plugin, MCP server, and bridge that enables seamless integration of Binary Ninja's capabilities with your favorite LLM client.

![Binary Ninja MCP Logo](images/logo-small.png)

## Features

- Seamless, real-time integration between Binary Ninja and MCP clients
- Enhanced reverse engineering workflow with AI assistance
- Support for every MCP client (Cline, Claude desktop, Roo Code, etc.)
- Multi-session model: manage multiple open binaries simultaneously via user-assigned view aliases

## Examples

### Solving a CTF Challenge

Check out [this demo video on YouTube](https://www.youtube.com/watch?v=0ffMHH39L_M) that uses the extension to solve a CTF challenge.

## Components

This repository contains two separate components:

1. A Binary Ninja plugin that provides an MCP server that exposes Binary Ninja's capabilities through HTTP endpoints. This can be used with any client that implements the MCP protocol.
2. A separate MCP bridge component that connects your favorite MCP client to the Binary Ninja MCP server.

## Multi-session Model

A single Binary Ninja instance can manage multiple open binaries simultaneously. Each binary is registered under a user-assigned **view_id** alias when loaded via `create_view`. Every analysis tool requires this `view_id` parameter to identify which view it should operate on — there is no implicit "active" binary.

This design allows an LLM session to analyse several binaries in parallel (e.g., a loader and its payload, two versions of the same binary for diff analysis, or multiple CTF challenges at once) without reloading. Use `list_view` to inspect currently registered views at any time, and `delete_view` to close a view when you are finished with it (call `save_bndb` first to preserve analysis). Note that Binary Ninja does not permit loading the same filepath twice: if `create_view` returns a 409 conflict, use `list_view` to find the existing alias.

## Prerequisites

- [Binary Ninja](https://binary.ninja/)
- Python 3.12+
- MCP client (those with auto-setup support are listed below)

## Installation

### MCP Client

Please install the MCP client before you install Binary Ninja MCP so that the MCP clients can be auto-setup. We currently support auto-setup for these MCP clients:

    1. Cline (recommended)
    2. Roo Code
    3. Claude Desktop (recommended)
    4. Cursor
    5. Windsurf
    6. Claude Code
    7. LM Studio

### Extension Installation

After the MCP client is installed, you can install the MCP server using the Binary Ninja Plugin Manager or manually. Both methods support auto-setup of MCP clients.

If your MCP client is not set, you should install it first then try to reinstall the extension.

#### Binary Ninja Plugin Manager

You may install the extension through Binary Ninja's Plugin Manager (`Plugins > Manage Plugins`).

![Plugin Manager](images/plugin-manager-listing.png)

#### Manual Install

To manually install the extension, this repository can be copied into the [Binary Ninja plugins folder](https://docs.binary.ninja/guide/plugins.html).

### [Optional] Manual Setup of the MCP Client

*You do NOT need to set this up manually if you use a supported MCP client and follow the installation steps before.*

You can also manage MCP client entries from the command line:

```bash
python scripts/mcp_client_installer.py --install    # auto setup supported MCP clients
python scripts/mcp_client_installer.py --uninstall  # remove entries and delete `.mcp_auto_setup_done`
python scripts/mcp_client_installer.py --config     # print a generic JSON config snippet
```

#### Using npm package (Recommended)

The recommended way to set up the MCP client is using the official npm package:

```bash
npx -y binary-ninja-mcp
```

For MCP clients, use this configuration:

```json
{
  "mcpServers": {
    "binary-ninja-mcp": {
      "command": "npx",
      "args": ["-y", "binary-ninja-mcp", "--host", "localhost", "--port", "9009"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "binary-ninja-mcp": {
      "command": "binary-ninja-mcp",
      "args": ["--host", "localhost", "--port", "9009"]
    }
  }
}
```

#### Using Python Bridge (Legacy)

For other MCP clients, use the Python bridge directly:

```json
{
    "mcpServers": {
        "binary_ninja_mcp": {
            "command": "/ABSOLUTE/PATH/TO/Binary Ninja/plugins/repositories/community/plugins/fosdickio_binary_ninja_mcp/.venv/bin/python",
            "args": [
                "/ABSOLUTE/PATH/TO/Binary Ninja/plugins/repositories/community/plugins/fosdickio_binary_ninja_mcp/bridge/binja_mcp_bridge.py"
            ]
        }
    }
}
```

Note: Replace `/ABSOLUTE/PATH/TO` with the actual absolute path to your project directory. The virtual environment's Python interpreter must be used to access the installed dependencies.

## Usage

1. Open Binary Ninja
2. Click the button shown at left bottom corner to start the MCP server
3. In your MCP client, call `create_view("/path/to/binary", view_id="<short-alias>")` to load and register a binary before using any other tool
4. Start prompting with your MCP client

You may now start prompting LLMs about the registered view(s). Example prompts:

### CTF Challenges

```txt
You're the best CTF player in the world. Please solve this reversing CTF challenge in the <folder_name> folder using Binary Ninja. First call create_view("/path/to/binary", view_id="<short-alias>") before any other tool to load and register the binary. Rename ALL the function and the variables during your analyzation process (except for main function) so I can better read the code. Write a python solve script if you need. Also, if you need to create struct or anything, please go ahead. Reverse the code like a human reverser so that I can read the decompiled code that analyzed by you.
```

### Malware Analysis

```txt
Your task is to analyze an unknown binary file. You can use the existing MCP server called "binary_ninja_mcp" to interact with the Binary Ninja instance and retrieve information, using the tools made available by this server. In general use the following strategy:

- First call create_view("/path/to/file", view_id="target") to load the binary and register it; then use list_view to confirm it is registered and analysis_state is complete before proceeding
- Start from the entry point of the code
- If this function call others, make sure to follow through the calls and analyze these functions as well to understand their context
- If more details are necessary, disassemble or decompile the function and add comments with your findings
- Inspect the decompilation and add comments with your findings to important areas of code
- Add a comment to each function with a brief summary of what it does
- Rename variables and function parameters to more sensible names
- Change the variable and argument types if necessary (especially pointer and array types)
- Change function names to be more descriptive, using mcp_ as prefix.
- NEVER convert number bases yourself. Use the convert_number MCP tool if needed!
- When you finish your analysis, report how long the analysis took
- At the end, create a report with your findings.
- Based only on these findings, make an assessment on whether the file is malicious or not.
```

## Supported Capabilities

The following table lists the available MCP functions for use. All analysis tools require a `view_id` parameter that identifies which binary to operate on (obtained via `create_view`).

| Function                                                                   | Description                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `create_view(filepath, view_id)`                                           | Load a binary and register it under a user-assigned `view_id` alias. Returns 409 if the `view_id` already exists, or if the same filepath is already loaded under a different alias. Use this before any analysis tool. |
| `list_view()`                                                              | List all currently registered views with `view_id`, filepath, basename, arch, and `analysis_state` for each. |
| `delete_view(view_id)`                                                     | Close the BinaryView for the given `view_id` and unregister it. WARNING: unsaved analysis (renames, comments, types) is lost — call `save_bndb` first if you need to preserve work. |
| `decompile_function(view_id, name)`                                        | Decompile a function in the given view (returns HLIL/Pseudo C representation). |
| `decompile_to_file(view_id, name, output_path)`                            | Decompile a function in the given view and write the full output directly to a file on disk; also returns the pseudocode in the response. |
| `batch_decompile_to_file(view_id, output_dir)`                             | Decompile every non-imported, non-thunk function in the given view and save each to `<output_dir>/<function_name>.txt`. Returns counts and per-function paths. |
| `save_bndb(view_id, output_path)`                                          | Save the analysis state of the given view to a `.bndb` database file (renames, types, comments preserved for later BN GUI review). |
| `get_il(view_id, name_or_address, view, ssa)`                              | Get IL for a function in the given view in `hlil`, `mlil`, or `llil` (SSA supported for MLIL/LLIL).         |
| `define_types(view_id, c_code)`                                            | Add type definitions from a C string type definition in the given view.                                      |
| `delete_comment(view_id, address)`                                         | Delete the comment at a specific address in the given view.                                                  |
| `delete_function_comment(view_id, function_name)`                          | Delete the comment for a function in the given view.                                                         |
| `declare_c_type(view_id, c_declaration)`                                   | Create/update a local type from a single C declaration in the given view.                                    |
| `format_value(view_id, address, text, size)`                               | Convert a value and annotate it at an address in the given view (adds a comment).                            |
| `function_at(view_id, address)`                                            | Retrieve the name of the function the address belongs to in the given view.                                  |
| `fetch_disassembly(view_id, name)`                                         | Get the assembly representation of a function by name in the given view.                                     |
| `get_entry_points(view_id)`                                                | List entry point(s) of the binary in the given view.                                                         |
| `get_comment(view_id, address)`                                            | Get the comment at a specific address in the given view.                                                     |
| `get_function_comment(view_id, function_name)`                             | Get the comment for a function in the given view.                                                            |
| `get_user_defined_type(view_id, type_name)`                                | Retrieve definition of a user-defined type (struct, enumeration, typedef, union) in the given view.          |
| `get_xrefs_to(view_id, address)`                                           | Get all cross references (code and data) to an address in the given view.                                    |
| `get_data_decl(view_id, name_or_address, length)`                          | Return a C-like declaration and a hexdump for a data symbol or address in the given view.                    |
| `hexdump_address(view_id, address, length)`                                | Text hexdump at address in the given view. `length < 0` reads exact defined size if available.               |
| `hexdump_data(view_id, name_or_address, length)`                           | Hexdump by data symbol name or address in the given view. `length < 0` reads exact defined size if available.|
| `get_xrefs_to_enum(view_id, enum_name)`                                    | Get usages related to an enum in the given view (matches member constants in code).                          |
| `get_xrefs_to_field(view_id, struct_name, field_name)`                     | Get all cross references to a named struct field in the given view.                                          |
| `get_xrefs_to_struct(view_id, struct_name)`                                | Get xrefs/usages related to a struct in the given view (members, globals, code refs).                        |
| `get_xrefs_to_type(view_id, type_name)`                                    | Get xrefs/usages related to a struct/type in the given view (globals, refs, HLIL matches).                   |
| `get_xrefs_to_union(view_id, union_name)`                                  | Get xrefs/usages related to a union in the given view (members, globals, code refs).                         |
| `get_stack_frame_vars(view_id, function_identifier)`                       | Get stack frame variable information for a function in the given view (names, offsets, sizes, types).        |
| `get_type_info(view_id, type_name)`                                        | Resolve a type in the given view and return declaration, kind, and members.                                  |
| `get_callers(view_id, identifier)`                                         | List callers plus call sites for one or more function identifiers in the given view.                         |
| `get_callees(view_id, identifier)`                                         | List callees plus call sites for one or more function identifiers in the given view.                         |
| `make_function_at(view_id, address, platform)`                             | Create a function at an address in the given view. `platform` optional; use `default` to pick the BinaryView/platform default. |
| `list_platforms()`                                                         | List all available platform names (global; no view_id required).                                            |
| `list_all_strings(view_id)`                                                | List all strings in the given view (no pagination; aggregates all pages).                                    |
| `list_classes(view_id, offset, limit)`                                     | List all namespace/class names in the given view.                                                            |
| `list_data_items(view_id, offset, limit)`                                  | List defined data labels and their values in the given view.                                                 |
| `list_exports(view_id, offset, limit)`                                     | List exported functions/symbols in the given view.                                                           |
| `list_imports(view_id, offset, limit)`                                     | List imported symbols in the given view.                                                                     |
| `list_local_types(view_id, offset, count)`                                 | List local Types in the given view database (name/kind/decl).                                                |
| `list_methods(view_id, offset, limit)`                                     | List all function names in the given view.                                                                   |
| `list_namespaces(view_id, offset, limit)`                                  | List all non-global namespaces in the given view.                                                            |
| `list_sections(view_id, offset, limit)`                                    | List sections in the given view (start/end/size/name/semantics) with pagination.                             |
| `list_segments(view_id, offset, limit)`                                    | List all memory segments in the given view.                                                                  |
| `list_strings(view_id, offset, count)`                                     | List all strings in the given view (paginated).                                                              |
| `list_strings_filter(view_id, offset, count, filter)`                      | List matching strings in the given view (paginated, filtered by substring).                                  |
| `rename_data(view_id, address, new_name)`                                  | Rename a data label at the specified address in the given view.                                              |
| `rename_function(view_id, old_name, new_name)`                             | Rename a function by its current name to a new user-defined name in the given view.                          |
| `rename_single_variable(view_id, function_name, variable_name, new_name)`  | Rename a single local variable inside a function in the given view.                                          |
| `rename_multi_variables(view_id, function_identifier, ...)`                | Batch rename multiple local variables in a function in the given view (mapping or pairs).                    |
| `set_local_variable_type(view_id, function_address, variable_name, new_type)` | Set a local variable's type in the given view.                                                            |
| `retype_variable(view_id, function_name, variable_name, type_str)`         | Retype a variable inside a given function in the given view.                                                 |
| `search_functions_by_name(view_id, query, offset, limit)`                  | Search for functions whose name contains the given substring in the given view.                              |
| `search_types(view_id, query, offset, count)`                              | Search local Types by substring (name/decl) in the given view.                                              |
| `set_comment(view_id, address, comment)`                                   | Set a comment at a specific address in the given view.                                                       |
| `set_function_comment(view_id, function_name, comment)`                    | Set a comment for a function in the given view.                                                              |
| `set_function_prototype(view_id, name_or_address, prototype)`              | Set a function's prototype by name or address in the given view.                                             |
| `patch_bytes(view_id, address, data, save_to_file)`                        | Patch raw bytes at an address in the given view (byte-level, not assembly). Can patch entire instructions by providing their bytecode. Address: hex (e.g., "0x401000") or decimal. Data: hex string (e.g., "90 90"). `save_to_file` (default True) saves to disk and re-signs on macOS. |
| `convert_number(text, size)`                                               | Convert a number or string into multiple representations (hex/dec/bin, char, C literal). `size=0` auto-detects width. Global tool — no `view_id` required. |

These are the list of HTTP endpoints that can be called.

**All view-touching endpoints require `?view_id=<alias>`.** Missing `view_id` returns **400**. Unknown `view_id` returns **404**. If analysis is still in progress, endpoints return **202** with `{"analysis_in_progress": true, ...}` — callers should retry after a short wait.

### View Management Endpoints (no `view_id` required)

- `POST /createView?filepath=<path>&view_id=<alias>`: Load a binary and register it under `view_id`. Returns 200 on success, 409 if `view_id` already exists or the filepath is already loaded under another alias, 400 if `filepath` is missing.
- `GET /listView`: List all registered views with `view_id`, filepath, basename, arch, and `analysis_state` for each.
- `POST /deleteView?view_id=<alias>`: Close and unregister the view for `view_id`. WARNING: unsaved analysis is lost.
- `GET /platforms`: List all available platform names (global; no `view_id` required).
- `GET /convertNumber?text=<value>&size=<n>`: Convert a number/string into multiple representations (hex/dec/bin, char, C literal). `size=0` auto-detects. Global — no `view_id` required.

### Analysis Endpoints (all require `?view_id=<alias>`)

- `/decompile?view_id=<alias>&name=<func>`: Decompile a function. Returns HLIL/Pseudo C representation.
- `/decompileToFile?view_id=<alias>&name=<func>&outputPath=<path>`: Decompile a function and save to a file.
- `/batchDecompileToFile?view_id=<alias>&outputDir=<dir>`: Decompile every non-imported, non-thunk function and write each to `<outputDir>/<function_name>.txt`. Returns counts plus saved/skipped lists.
- `/il?view_id=<alias>&name=<func>&view=<hlil|mlil|llil>&ssa=<0|1>`: Get IL for a function in the selected view.
- `/saveBndb?view_id=<alias>&outputPath=<path>`: Save the analysis database as a `.bndb` file.
- `/allStrings?view_id=<alias>`: All strings in one response.
- `/formatValue?view_id=<alias>&address=<addr>&text=<value>&size=<n>`: Convert and set a comment at an address.
- `/getXrefsTo?view_id=<alias>&address=<addr>`: Xrefs to address (code+data).
- `/getDataDecl?view_id=<alias>&name=<symbol>|address=<addr>&length=<n>`: JSON with declaration-style string and a hexdump for a data symbol or address. Keys: `address`, `name`, `size`, `type`, `decl`, `hexdump`. `length < 0` reads exact defined size if available.
- `/hexdump?view_id=<alias>&address=<addr>&length=<n>`: Text hexdump aligned at address; `length < 0` reads exact defined size if available.
- `/hexdumpByName?view_id=<alias>&name=<symbol>&length=<n>`: Text hexdump by symbol name. Recognizes BN auto-labels like `data_<hex>`, `byte_<hex>`, `word_<hex>`, `dword_<hex>`, `qword_<hex>`, `off_<hex>`, `unk_<hex>`, and plain hex addresses.
- `/makeFunctionAt?view_id=<alias>&address=<addr>&platform=<name|default>`: Create a function at an address (idempotent if already exists). `platform=default` uses the BinaryView/platform default.
- `/sections?view_id=<alias>&offset=<n>&limit=<m>`: List sections (start/end/size/name/semantics).
- `/data?view_id=<alias>&offset=<n>&limit=<m>&length=<n>`: Defined data items with previews. `length` controls bytes read per item (capped at defined size). Default behavior reads exact defined size when available; `length=-1` forces exact-size.
- `/getXrefsToEnum?view_id=<alias>&name=<enum>`: Enum usages by matching member constants.
- `/getXrefsToField?view_id=<alias>&struct=<name>&field=<name>`: Xrefs to struct field.
- `/getXrefsToType?view_id=<alias>&name=<type>`: Xrefs/usages related to a struct/type name.
- `/getTypeInfo?view_id=<alias>&name=<type>`: Resolve a type and return declaration and details.
- `/getXrefsToUnion?view_id=<alias>&name=<union>`: Union xrefs/usages (members, globals, refs).
- `/getStackFrameVars?view_id=<alias>&name=<function>|address=<addr>`: Get stack frame variable information for a function.
- `/getCallers?view_id=<alias>&identifiers=<name|addr>[,...]`: Return caller summaries (functions, call sites, HLIL/IL snippets) for one or more identifiers. Accepts `identifiers`, `identifier`, `names`, or `addresses` query params.
- `/getCallees?view_id=<alias>&identifiers=<name|addr>[,...]`: Return callee summaries with the same schema as `/getCallers`, detailing every outgoing call target per request identifier.
- `/localTypes?view_id=<alias>&offset=<n>&limit=<m>`: List local types.
- `/strings?view_id=<alias>&offset=<n>&limit=<m>`: Paginated strings.
- `/strings/filter?view_id=<alias>&offset=<n>&limit=<m>&filter=<substr>`: Filtered strings.
- `/searchTypes?view_id=<alias>&query=<substr>&offset=<n>&limit=<m>`: Search local types by substring.
- `/patch` or `/patchBytes?view_id=<alias>&address=<addr>&data=<hex>&save_to_file=<bool>`: Patch raw bytes at an address (byte-level, not assembly). Can patch entire instructions by providing their bytecode. Address: hex (e.g., "0x401000") or decimal. Data: hex string (e.g., "90 90"). `save_to_file` (default True) saves to disk and re-signs on macOS.
- `/renameVariables?view_id=<alias>`: Batch rename locals in a function. Parameters:
  - Function: one of `functionAddress`, `address`, `function`, `functionName`, or `name`.
  - Provide renames via one of:
    - `renames`: JSON array of `{old, new}` objects
    - `mapping`: JSON object of `old->new`
    - `pairs`: compact string `old1:new1,old2:new2`
          Returns per-item results plus totals. Order is respected; later pairs can refer to earlier new names.

## Development

### Code Quality

This project uses [Ruff](https://docs.astral.sh/ruff/) for linting and formatting. Configuration is in `ruff.toml`.

#### Running Ruff Manually

Check for issues:
```bash
ruff check .
```

Auto-fix issues:
```bash
ruff check --fix .
```

Check formatting issues:
```bash
ruff format --check .
```

Format code:
```bash
ruff format .
```

#### GitHub Actions

A GitHub Action workflow (`.github/workflows/lint-format.yml`) automatically runs Ruff on:

- Every push to the `main` branch
- Every pull request targeting the `main` branch

The workflow will fail if there are linting errors or formatting issues, ensuring code quality in CI.

## Contributing

Contributions are welcome. Please feel free to submit a pull request.
