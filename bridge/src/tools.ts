/**
 * MCP Tool definitions for Binary Ninja integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BinjaHttpClient } from "./client.js";

// View-id field shared across multi-session tools (Phase 2 will add it to all 60 tools).
const viewIdField = {
  view_id: z.string().describe(
    "Target view alias (from create_view). Required — each call must explicitly " +
    "specify which view to operate on. Use list_view to see registered views."
  ),
};

export function registerTools(server: McpServer, client: BinjaHttpClient): void {
  // ===== Function Analysis Tools =====

  server.tool(
    "list_methods",
    "List all function names in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("methods", { view_id, offset, limit });
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "get_entry_points",
    "List entry point(s) of the loaded binary in the given view.",
    {
      ...viewIdField,
    },
    async ({ view_id }) => {
      const data = await client.getJson<{ entry_points?: Array<{ address: string; name?: string }> }>("entryPoints", { view_id });
      if (!data || "error" in data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      const entryPoints = (data as { entry_points?: Array<{ address: string; name?: string }> }).entry_points || [];
      const lines = entryPoints.map((ep) => {
        const addr = ep.address;
        const name = ep.name || "(unknown)";
        return `${addr}\t${name}`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "search_functions_by_name",
    "Search for functions whose name contains the given substring in the given view.",
    {
      ...viewIdField,
      query: z.string().describe("Search query string"),
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, query, offset = 0, limit = 100 }) => {
      if (!query) {
        return { content: [{ type: "text", text: "Error: query string is required" }] };
      }
      const lines = await client.getLines("searchFunctions", { view_id, query, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "decompile_function",
    "Decompile a specific function by name in the given view and return the decompiled C code.",
    {
      ...viewIdField,
      name: z.string().describe("Function name or address"),
    },
    async ({ view_id, name }) => {
      const data = await client.getJson<{ decompiled?: string; error?: string }>("decompile", { view_id, name });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${data.error}` }] };
      }
      const decompiled = (data as { decompiled?: string }).decompiled;
      return { content: [{ type: "text", text: decompiled || "" }] };
    }
  );

  server.tool(
    "decompile_to_file",
    "Decompile a function in the given view and save the FULL HLIL pseudocode directly to a file on disk. " +
    "No LLM intermediation — the complete decompiled output is written as-is. " +
    "Also returns the pseudocode in the response for immediate analysis.",
    {
      ...viewIdField,
      name: z.string().describe("Function name or address to decompile"),
      output_path: z.string().describe("Absolute file path to write the pseudocode (e.g. '/path/to/.omp/artifacts/pseudocode/main.txt')"),
    },
    async ({ view_id, name, output_path }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await client.getJson("decompileToFile", { view_id, name, outputPath: output_path });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response from BN plugin" }] };
      }
      if (data.error) {
        return { content: [{ type: "text", text: `Error: ${data.error}` }] };
      }
      const lines = data.lines ?? 0;
      const path = data.path ?? output_path;
      const code = data.decompiled ?? "";
      return {
        content: [{ type: "text", text: `Saved ${lines} lines to ${path}\n\n${code}` }],
      };
    }
  );

  server.tool(
    "batch_decompile_to_file",
    "Decompile ALL non-imported functions in the given view and save each to <outputDir>/<function_name>.txt. " +
    "Skips external/imported functions and thunks. Returns list of saved files.",
    {
      ...viewIdField,
      output_dir: z.string().describe("Directory to write pseudocode files to"),
    },
    async ({ view_id, output_dir }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await client.getJson("batchDecompileToFile", { view_id, outputDir: output_dir });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response from BN plugin" }] };
      }
      if (data.error) {
        return { content: [{ type: "text", text: `Error: ${data.error}` }] };
      }
      const saved = data.saved_count ?? 0;
      const skipped = data.skipped_count ?? 0;
      const files = (data.saved ?? []).map((s: { name: string; path: string }) => `  ${s.name} → ${s.path}`).join("\n");
      return {
        content: [{ type: "text", text: `Decompiled ${saved} functions (${skipped} skipped)\nOutput: ${output_dir}\n\n${files}` }],
      };
    }
  );

  server.tool(
    "save_bndb",
    "Save the current analysis state of the given view as a .bndb database file. " +
    "The user can open this in BN GUI later to review all renames, types, and comments.",
    {
      ...viewIdField,
      output_path: z.string().describe("Absolute path for the .bndb file (e.g. /path/to/.omp/artifacts/analysis.bndb)"),
    },
    async ({ view_id, output_path }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await client.getJson("saveBndb", { view_id, outputPath: output_path });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response from BN plugin" }] };
      }
      if (data.error) {
        return { content: [{ type: "text", text: `Error: ${data.error}` }] };
      }
      return {
        content: [{ type: "text", text: `BNDB saved to ${data.path}` }],
      };
    }
  );

  server.tool(
    "get_il",
    "Get IL for a function in the given view (hlil, mlil, llil).",
    {
      ...viewIdField,
      name_or_address: z.string().describe("Function name or address (hex like 0x401000)"),
      view: z.enum(["hlil", "mlil", "llil"]).default("hlil").describe("IL view: hlil, mlil, or llil"),
      ssa: z.boolean().default(false).describe("Request SSA form (MLIL/LLIL only)"),
    },
    async ({ view_id, name_or_address, view = "hlil", ssa = false }) => {
      const ident = name_or_address.trim();
      const params: Record<string, string | number> = { view_id, view, ssa: ssa ? 1 : 0 };
      if (ident.toLowerCase().startsWith("0x") || /^\d+$/.test(ident)) {
        params.address = ident;
      } else {
        params.name = ident;
      }
      const data = await client.getJson<{ il?: string; error?: unknown }>("il", params);
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${JSON.stringify(data.error)}` }] };
      }
      const il = (data as { il?: string }).il;
      return { content: [{ type: "text", text: il || "" }] };
    }
  );

  server.tool(
    "fetch_disassembly",
    "Retrieve the disassembled code of a function in the given view as assembly mnemonic instructions.",
    {
      ...viewIdField,
      name: z.string().describe("Function name"),
    },
    async ({ view_id, name }) => {
      const data = await client.getJson<{ assembly?: string; error?: string }>("assembly", { view_id, name });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      const assembly = (data as { assembly?: string }).assembly;
      return { content: [{ type: "text", text: assembly || "" }] };
    }
  );

  // ===== Rename Tools =====

  server.tool(
    "rename_function",
    "Rename a function by its current name in the given view. The configured prefix will be automatically prepended if not present.",
    {
      ...viewIdField,
      old_name: z.string().describe("Current function name"),
      new_name: z.string().describe("New function name"),
    },
    async ({ view_id, old_name, new_name }) => {
      const result = await client.post("renameFunction", { view_id, oldName: old_name, newName: new_name });
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "rename_single_variable",
    "Rename a variable in a function in the given view.",
    {
      ...viewIdField,
      function_name: z.string().describe("Function name"),
      variable_name: z.string().describe("Current variable name"),
      new_name: z.string().describe("New variable name"),
    },
    async ({ view_id, function_name, variable_name, new_name }) => {
      const data = await client.getJson<{ status?: string; error?: string }>("renameVariable", {
        view_id,
        functionName: function_name,
        variableName: variable_name,
        newName: new_name,
      });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("status" in data) {
        return { content: [{ type: "text", text: (data as { status: string }).status }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    "rename_multi_variables",
    "Rename multiple local variables in one call in the given view.",
    {
      ...viewIdField,
      function_identifier: z.string().describe("Function name or address (hex)"),
      mapping_json: z.string().optional().describe("JSON object old->new"),
      pairs: z.string().optional().describe("Comma-separated old:new pairs"),
      renames_json: z.string().optional().describe("JSON array of {old,new} objects"),
    },
    async ({ view_id, function_identifier, mapping_json, pairs, renames_json }) => {
      const ident = function_identifier.trim();
      const params: Record<string, string> = { view_id };
      if (ident.toLowerCase().startsWith("0x") || /^\d+$/.test(ident)) {
        params.address = ident;
      } else {
        params.functionName = ident;
      }

      if (renames_json) {
        try {
          JSON.parse(renames_json);
          params.renames = renames_json;
        } catch {
          return { content: [{ type: "text", text: "Error: renames_json is not valid JSON" }] };
        }
      } else if (mapping_json) {
        try {
          JSON.parse(mapping_json);
          params.mapping = mapping_json;
        } catch {
          return { content: [{ type: "text", text: "Error: mapping_json is not valid JSON" }] };
        }
      } else if (pairs) {
        params.pairs = pairs;
      } else {
        return { content: [{ type: "text", text: "Error: provide mapping_json, renames_json, or pairs" }] };
      }

      const data = await client.getJson<{ error?: string; total?: number; renamed?: number }>("renameVariables", params);
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      const total = (data as { total?: number }).total;
      const renamed = (data as { renamed?: number }).renamed;
      return { content: [{ type: "text", text: `Batch rename: ${renamed}/${total} applied` }] };
    }
  );

  server.tool(
    "rename_data",
    "Rename a data label at the specified address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000)"),
      new_name: z.string().describe("New name for the data label"),
    },
    async ({ view_id, address, new_name }) => {
      const result = await client.post("renameData", { view_id, address, newName: new_name });
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ===== Comment Tools =====

  server.tool(
    "set_comment",
    "Set a comment at a specific address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000)"),
      comment: z.string().describe("Comment text"),
    },
    async ({ view_id, address, comment }) => {
      const result = await client.post("comment", { view_id, address, comment });
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "get_comment",
    "Get the comment at a specific address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000)"),
    },
    async ({ view_id, address }) => {
      const lines = await client.getLines("comment", { view_id, address });
      return { content: [{ type: "text", text: lines[0] ?? "" }] };
    }
  );

  server.tool(
    "delete_comment",
    "Delete the comment at a specific address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000)"),
    },
    async ({ view_id, address }) => {
      const result = await client.post("comment", { view_id, address, _method: "DELETE" });
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "set_function_comment",
    "Set a comment for a function in the given view.",
    {
      ...viewIdField,
      function_name: z.string().describe("Function name"),
      comment: z.string().describe("Comment text"),
    },
    async ({ view_id, function_name, comment }) => {
      const result = await client.post("comment/function", { view_id, name: function_name, comment });
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "get_function_comment",
    "Get the comment for a function in the given view.",
    {
      ...viewIdField,
      function_name: z.string().describe("Function name"),
    },
    async ({ view_id, function_name }) => {
      const lines = await client.getLines("comment/function", { view_id, name: function_name });
      return { content: [{ type: "text", text: lines[0] || "" }] };
    }
  );

  server.tool(
    "delete_function_comment",
    "Delete the comment for a function in the given view.",
    {
      ...viewIdField,
      function_name: z.string().describe("Function name"),
    },
    async ({ view_id, function_name }) => {
      const result = await client.post("comment/function", { view_id, name: function_name, _method: "DELETE" });
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ===== Type Tools =====

  server.tool(
    "define_types",
    "Define types from a C code string in the given view.",
    {
      ...viewIdField,
      c_code: z.string().describe("C code containing type definitions"),
    },
    async ({ view_id, c_code }) => {
      const data = await client.getJson<{ error?: string } | unknown[]>("defineTypes", { view_id, cCode: c_code });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if (Array.isArray(data)) {
        return { content: [{ type: "text", text: `Defined types: ${data.join(", ")}` }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    "list_local_types",
    "List all local types in the given view database (paginated).",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      count: z.number().default(200).describe("Number of results to return"),
      include_libraries: z.boolean().default(false).describe("Include library types"),
    },
    async ({ view_id, offset = 0, count = 200, include_libraries = false }) => {
      const lines = await client.getLines("localTypes", {
        view_id,
        offset,
        limit: count,
        includeLibraries: include_libraries ? 1 : 0,
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "search_types",
    "Search local types in the given view whose name or declaration contains the substring.",
    {
      ...viewIdField,
      query: z.string().describe("Search query"),
      offset: z.number().default(0).describe("Offset for pagination"),
      count: z.number().default(200).describe("Number of results to return"),
      include_libraries: z.boolean().default(false).describe("Include library types"),
    },
    async ({ view_id, query, offset = 0, count = 200, include_libraries = false }) => {
      const lines = await client.getLines("searchTypes", {
        view_id,
        query,
        offset,
        limit: count,
        includeLibraries: include_libraries ? 1 : 0,
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_user_defined_type",
    "Retrieve definition of a user defined type (struct, enumeration, typedef, union) in the given view.",
    {
      ...viewIdField,
      type_name: z.string().describe("Type name"),
    },
    async ({ view_id, type_name }) => {
      const lines = await client.getLines("getUserDefinedType", { view_id, name: type_name });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_type_info",
    "Resolve a type name in the given view and return its declaration and details (kind, members, enum values).",
    {
      ...viewIdField,
      type_name: z.string().describe("Type name"),
    },
    async ({ view_id, type_name }) => {
      const data = await client.getJson<Record<string, unknown>>("getTypeInfo", { view_id, name: type_name });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${String(data.error)}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "declare_c_type",
    "Create or update a local type from a C declaration in the given view.",
    {
      ...viewIdField,
      c_declaration: z.string().describe("C type declaration"),
    },
    async ({ view_id, c_declaration }) => {
      const data = await client.getJson<{ error?: string; defined_types?: Record<string, unknown>; count?: number }>("declareCType", { view_id, declaration: c_declaration });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      if ((data as { defined_types?: Record<string, unknown> }).defined_types) {
        const names = Object.keys((data as { defined_types: Record<string, unknown> }).defined_types).join(", ");
        const count = (data as { count?: number }).count || 0;
        return { content: [{ type: "text", text: `Declared types (${count}): ${names}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    "retype_variable",
    "Retype a variable in a function in the given view.",
    {
      ...viewIdField,
      function_name: z.string().describe("Function name"),
      variable_name: z.string().describe("Variable name"),
      type_str: z.string().describe("New type for the variable"),
    },
    async ({ view_id, function_name, variable_name, type_str }) => {
      const data = await client.getJson<{ status?: string; error?: string }>("retypeVariable", {
        view_id,
        functionName: function_name,
        variableName: variable_name,
        type: type_str,
      });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("status" in data) {
        return { content: [{ type: "text", text: (data as { status: string }).status }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    "set_local_variable_type",
    "Set a local variable's type in the given view.",
    {
      ...viewIdField,
      function_address: z.string().describe("Function address or name"),
      variable_name: z.string().describe("Variable name"),
      new_type: z.string().describe("New type"),
    },
    async ({ view_id, function_address, variable_name, new_type }) => {
      const data = await client.getJson<{ status?: string; error?: string }>("setLocalVariableType", {
        view_id,
        functionAddress: function_address,
        variableName: variable_name,
        newType: new_type,
      });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ((data as { status?: string }).status === "ok") {
        const d = data as { variable?: string; function?: string; applied_type?: string };
        return { content: [{ type: "text", text: `Retyped ${d.variable} in ${d.function} to ${d.applied_type}` }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  // ===== Data Tools =====

  server.tool(
    "list_data_items",
    "List defined data labels and their values in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("data", { view_id, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "hexdump_address",
    "Hexdump data starting at an address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000)"),
      length: z.number().default(-1).describe("Number of bytes (use -1 for defined size)"),
    },
    async ({ view_id, address, length = -1 }) => {
      const params: Record<string, string | number> = { view_id, address };
      if (length !== undefined && length !== -1) {
        params.length = length;
      }
      const text = await client.getText("hexdump", params);
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "hexdump_data",
    "Hexdump a data symbol by name or address in the given view.",
    {
      ...viewIdField,
      name_or_address: z.string().describe("Symbol name or address (hex)"),
      length: z.number().default(-1).describe("Number of bytes (use -1 for defined size)"),
    },
    async ({ view_id, name_or_address, length = -1 }) => {
      const ident = name_or_address.trim();
      if (ident.startsWith("0x")) {
        const params: Record<string, string | number> = { view_id, address: ident };
        if (length !== undefined && length !== -1) {
          params.length = length;
        }
        const text = await client.getText("hexdump", params);
        return { content: [{ type: "text", text }] };
      }
      const params: Record<string, string | number> = { view_id, name: ident };
      if (length !== undefined && length !== -1) {
        params.length = length;
      }
      const text = await client.getText("hexdumpByName", params);
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "get_data_decl",
    "Return a declaration-like string and hexdump for a data symbol in the given view.",
    {
      ...viewIdField,
      name_or_address: z.string().describe("Symbol name or address (hex)"),
      length: z.number().default(-1).describe("Number of bytes"),
    },
    async ({ view_id, name_or_address, length = -1 }) => {
      const ident = name_or_address.trim();
      const params: Record<string, string | number> = ident.startsWith("0x")
        ? { view_id, address: ident }
        : { view_id, name: ident };
      if (length !== undefined && length !== -1) {
        params.length = length;
      }
      const data = await client.getJson<{
        error?: string;
        decl?: string;
        hexdump?: string;
        address?: string;
        name?: string;
      }>("getDataDecl", params);
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      const decl = (data as { decl?: string }).decl || "(no declaration)";
      const hexdump = (data as { hexdump?: string }).hexdump || "";
      const addr = (data as { address?: string }).address || "";
      const name = (data as { name?: string }).name || ident;
      return {
        content: [{ type: "text", text: `Declaration (${addr} ${name}):\n${decl}\n\nHexdump:\n${hexdump}` }],
      };
    }
  );

  // ===== Cross-Reference Tools =====

  server.tool(
    "get_xrefs_to",
    "Get all cross references (code and data) to the given address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex or decimal)"),
    },
    async ({ view_id, address }) => {
      const lines = await client.getLines("getXrefsTo", { view_id, address });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_xrefs_to_field",
    "Get all cross references to a named struct field (member) in the given view.",
    {
      ...viewIdField,
      struct_name: z.string().describe("Struct name"),
      field_name: z.string().describe("Field name"),
    },
    async ({ view_id, struct_name, field_name }) => {
      const lines = await client.getLines("getXrefsToField", { view_id, struct: struct_name, field: field_name });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_xrefs_to_struct",
    "Get cross references/usages related to a struct name in the given view.",
    {
      ...viewIdField,
      struct_name: z.string().describe("Struct name"),
    },
    async ({ view_id, struct_name }) => {
      const lines = await client.getLines("getXrefsToStruct", { view_id, name: struct_name });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_xrefs_to_type",
    "Get xrefs/usages related to a struct or type name in the given view.",
    {
      ...viewIdField,
      type_name: z.string().describe("Type name"),
    },
    async ({ view_id, type_name }) => {
      const lines = await client.getLines("getXrefsToType", { view_id, name: type_name });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_xrefs_to_enum",
    "Get usages/xrefs of an enum by scanning for member values and matches in the given view.",
    {
      ...viewIdField,
      enum_name: z.string().describe("Enum name"),
    },
    async ({ view_id, enum_name }) => {
      const lines = await client.getLines("getXrefsToEnum", { view_id, name: enum_name });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_xrefs_to_union",
    "Get cross references/usages related to a union type by name in the given view.",
    {
      ...viewIdField,
      union_name: z.string().describe("Union name"),
    },
    async ({ view_id, union_name }) => {
      const lines = await client.getLines("getXrefsToUnion", { view_id, name: union_name });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ===== Utility Tools =====

  server.tool(
    "get_callers",
    "Get functions that call the specified function(s) in the given view. Returns caller names, addresses, and call sites.",
    {
      ...viewIdField,
      identifier: z.string().describe("Function name or address (or comma-separated list)"),
    },
    async ({ view_id, identifier }) => {
      const lines = await client.getLines("getCallers", { view_id, identifier });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_callees",
    "Get functions called by the specified function(s) in the given view. Returns callee names, addresses, and call sites.",
    {
      ...viewIdField,
      identifier: z.string().describe("Function name or address (or comma-separated list)"),
    },
    async ({ view_id, identifier }) => {
      const lines = await client.getLines("getCallees", { view_id, identifier });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "function_at",
    "Retrieve the name of the function the address belongs to in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex format 0x00001)"),
    },
    async ({ view_id, address }) => {
      const lines = await client.getLines("functionAt", { view_id, address });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_stack_frame_vars",
    "Get stack frame variable information for a function in the given view (names, offsets, sizes, types).",
    {
      ...viewIdField,
      function_identifier: z.string().describe("Function name or address (hex)"),
    },
    async ({ view_id, function_identifier }) => {
      const ident = function_identifier.trim();
      const params: Record<string, string> = ident.toLowerCase().startsWith("0x") || /^\d+$/.test(ident)
        ? { view_id, address: ident }
        : { view_id, name: ident };
      // Server returns a list[{addr, vars: [{name, offset, size, type}, ...]}],
      // not the {stack_frame_vars: string[]} the old handler expected. Stringify
      // the JSON response so the LLM sees the real shape instead of "[object Object]".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await client.getJson("getStackFrameVars", params);
      if (data === null || data === undefined) {
        return { content: [{ type: "text", text: "Error: no response from BN plugin" }] };
      }
      if (typeof data === "object" && "error" in data && data.error) {
        return { content: [{ type: "text", text: `Error: ${data.error}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_classes",
    "List all namespace/class names in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("classes", { view_id, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_namespaces",
    "List all non-global namespaces in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("namespaces", { view_id, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_segments",
    "List all memory segments in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("segments", { view_id, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_sections",
    "List sections in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const data = await client.getJson<{ error?: string; sections?: Array<Record<string, unknown>> }>("sections", { view_id, offset, limit });
      if (!data || "error" in data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      const sections = (data as { sections?: Array<Record<string, unknown>> }).sections || [];
      const lines: string[] = [];
      for (const s of sections) {
        const start = (s as { start?: string }).start || "";
        const end = (s as { end?: string }).end || "";
        const size = (s as { size?: number }).size;
        const name = (s as { name?: string }).name || "(unnamed)";
        const sem = ((s as { semantics?: string }).semantics || (s as { type?: string }).type) || "";
        const tail = sem ? `\t${sem}` : "";
        lines.push(`${start}-${end}\t${size}\t${name}${tail}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_imports",
    "List imported symbols in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("imports", { view_id, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_exports",
    "List exported functions/symbols in the given view with pagination.",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      limit: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, limit = 100 }) => {
      const lines = await client.getLines("exports", { view_id, offset, limit });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_strings",
    "List all strings in the given view database (paginated).",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      count: z.number().default(100).describe("Number of results to return"),
    },
    async ({ view_id, offset = 0, count = 100 }) => {
      const lines = await client.getLines("strings", { view_id, offset, limit: count });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_strings_filter",
    "List matching strings in the given view database (paginated, filtered).",
    {
      ...viewIdField,
      offset: z.number().default(0).describe("Offset for pagination"),
      count: z.number().default(100).describe("Number of results to return"),
      filter: z.string().optional().describe("Filter string"),
    },
    async ({ view_id, offset = 0, count = 100, filter = "" }) => {
      const lines = await client.getLines("strings/filter", { view_id, offset, limit: count, filter });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "list_all_strings",
    "List all strings in the given view database (aggregated across pages).",
    {
      ...viewIdField,
      batch_size: z.number().default(500).describe("Batch size for aggregation"),
    },
    async ({ view_id, batch_size = 500 }) => {
      const results: string[] = [];
      let offset = 0;
      while (true) {
        const data = await client.getJson<Record<string, unknown>>("strings", { view_id, offset, limit: batch_size });
        if (!data || !("strings" in data)) {
          break;
        }
        const stringsData = data.strings as Array<{ address?: string; length?: number; type?: string; value?: string }>;
        const items = Array.isArray(stringsData) ? stringsData : [];
        if (!items.length) {
          break;
        }
        for (const s of items) {
          const addr = s.address || "";
          const length = s.length;
          const stype = s.type || "";
          const value = s.value || "";
          results.push(`${addr}\t${length}\t${stype}\t${value}`);
        }
        if (items.length < batch_size) {
          break;
        }
        offset += batch_size;
      }
      return { content: [{ type: "text", text: results.join("\n") }] };
    }
  );

  server.tool(
    "create_view",
    "Load a binary file and register it under a user-specified view_id alias. " +
    "The view_id is used to target this view in subsequent tool calls. " +
    "Returns 409 if view_id already exists, or if the same filepath is already " +
    "loaded under a different view_id (use list_view to find the existing alias).",
    {
      filepath: z.string().describe("Absolute path to the binary file"),
      view_id: z.string().describe("User-assigned alias for this view (must be globally unique)"),
    },
    async ({ filepath, view_id }) => {
      const data = await client.post("createView", { filepath, view_id });
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "list_view",
    "List all currently registered views (open binaries). Returns view_id, filepath, " +
    "basename, arch, and analysis_state for each.",
    {},
    async () => {
      const data = await client.getText("listView");
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "delete_view",
    "Close the BinaryView for the given view_id and unregister it. " +
    "WARNING: any unsaved analysis (renames, comments, types) is lost — " +
    "call save_bndb first if you need to preserve work.",
    {
      view_id: z.string().describe("view_id from create_view or list_view"),
    },
    async ({ view_id }) => {
      const data = await client.post("deleteView", { view_id });
      return { content: [{ type: "text", text: data }] };
    }
  );

  // ===== Binary Modification Tools =====

  server.tool(
    "set_function_prototype",
    "Set a function's prototype by name or address in the given view.",
    {
      ...viewIdField,
      name_or_address: z.string().describe("Function name or address"),
      prototype: z.string().describe("New function prototype"),
    },
    async ({ view_id, name_or_address, prototype }) => {
      const ident = name_or_address.trim();
      const params: Record<string, string> = { view_id, prototype };
      if (ident.toLowerCase().startsWith("0x") || /^\d+$/.test(ident)) {
        params.address = ident;
      } else {
        params.name = ident;
      }
      const data = await client.getJson<{ status?: string; error?: string; address?: string; applied_type?: string }>("setFunctionPrototype", params);
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("status" in data) {
        return { content: [{ type: "text", text: `Applied prototype at ${(data as { address?: string }).address}: ${(data as { applied_type?: string }).applied_type}` }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${(data as { error: string }).error}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    "make_function_at",
    "Create a function at the given address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000 or decimal)"),
      platform: z.string().optional().describe("Platform (e.g., linux-x86_64)"),
    },
    async ({ view_id, address, platform }) => {
      const params: Record<string, string> = { view_id, address };
      if (platform) {
        params.platform = platform;
      }
      const data = await client.getJson<{ error?: string; status?: string; address?: string; name?: string }>("makeFunctionAt", params);
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      if ((data as { status?: string }).status === "exists") {
        return { content: [{ type: "text", text: `Function already exists at ${(data as { address?: string }).address}: ${(data as { name?: string }).name}` }] };
      }
      if ((data as { status?: string }).status === "ok") {
        return { content: [{ type: "text", text: `Created function at ${(data as { address?: string }).address}: ${(data as { name?: string }).name}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  server.tool(
    "list_platforms",
    "List all available platform names from Binary Ninja.",
    {},
    async () => {
      const data = await client.getJson<{ error?: string; platforms?: string[] }>("platforms");
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      const plats = (data as { platforms?: string[] }).platforms;
      if (!plats) {
        return { content: [{ type: "text", text: "(no platforms)" }] };
      }
      return { content: [{ type: "text", text: plats.join("\n") }] };
    }
  );

  server.tool(
    "patch_bytes",
    "Patch bytes at a given address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000 or decimal)"),
      data: z.string().describe("Hex string of bytes to write (e.g., '90 90' or '9090')"),
      save_to_file: z.boolean().default(true).describe("Save patched binary to disk"),
    },
    async ({ view_id, address, data, save_to_file = true }) => {
      const result = await client.getJson<{
        error?: string;
        status?: string;
        original_bytes?: string;
        patched_bytes?: string;
        bytes_written?: number;
        bytes_requested?: number;
        saved_to_file?: boolean;
        saved_path?: string;
        warning?: string;
      }>("patch", { view_id, address, data, save_to_file: save_to_file ? 1 : 0 });
      if (!result) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in result) {
        return { content: [{ type: "text", text: `Error: ${(result as { error: string }).error}` }] };
      }
      const status = (result as { status?: string }).status;
      if (status === "ok" || status === "partial") {
        const orig = (result as { original_bytes?: string }).original_bytes || "";
        const patched = (result as { patched_bytes?: string }).patched_bytes || "";
        const written = (result as { bytes_written?: number }).bytes_written || 0;
        const requested = (result as { bytes_requested?: number }).bytes_requested || 0;
        const saved = (result as { saved_to_file?: boolean }).saved_to_file || false;
        const savedPath = (result as { saved_path?: string }).saved_path || "";
        const warning = (result as { warning?: string }).warning || "";

        let msg = `Patched ${written}/${requested} bytes at ${address}`;
        if (status === "partial") {
          msg += " (PARTIAL WRITE)";
        }
        if (warning) {
          msg += `\nWarning: ${warning}`;
        }
        if (orig) {
          msg += `\nOriginal: ${orig}`;
        }
        if (patched) {
          msg += `\nPatched:  ${patched}`;
        }
        if (saved) {
          msg += `\nSaved to file: ${savedPath}`;
        }
        return { content: [{ type: "text", text: msg }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "format_value",
    "Convert and annotate a value at an address in the given view.",
    {
      ...viewIdField,
      address: z.string().describe("Address (hex like 0x401000)"),
      text: z.string().describe("Text to convert"),
      size: z.number().default(0).describe("Size in bytes"),
    },
    async ({ view_id, address, text, size = 0 }) => {
      const lines = await client.getLines("formatValue", { view_id, address, text, size });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "convert_number",
    "Convert a number or string to multiple representations (hex/dec/bin, C literals).",
    {
      text: z.string().describe("Number or string to convert (decimal, hex 0x7b, binary 0b1111011, char 'A', or string)"),
      size: z.number().default(0).describe("Size in bytes (0 for auto)"),
    },
    async ({ text, size = 0 }) => {
      const data = await client.getJson<Record<string, unknown>>("convertNumber", { text, size });
      if (!data) {
        return { content: [{ type: "text", text: "Error: no response" }] };
      }
      if ("error" in data) {
        return { content: [{ type: "text", text: `Error: ${String(data.error)}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
