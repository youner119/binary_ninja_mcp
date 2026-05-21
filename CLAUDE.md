# binary_ninja_mcp — Project Instructions

## Binary Ninja API Reference

Local API docs live at **`~/Tools/binaryninja/api-docs/`** (Sphinx HTML, 77 modules).

**When implementing or modifying anything that touches the Binary Ninja Python API, consult these docs first** instead of guessing signatures or relying on memory. Examples of when to read them:

- Adding a new MCP endpoint in `plugin/api/endpoints.py` or `plugin/server/http_server.py`
- Wrapping a new BN API call in `plugin/core/binary_operations.py`
- Debugging behavior of `BinaryView`, `Function`, `HighLevelIL`, types, xrefs, etc.

### Useful module pages

| Topic | File |
|---|---|
| BinaryView (load, save, segments, sections, symbols) | `binaryninja.binaryview-module.html` |
| Function / variables / IL access | `binaryninja.function-module.html` |
| HLIL / MLIL / LLIL | `binaryninja.highlevelil-module.html`, `binaryninja.mediumlevelil-module.html`, `binaryninja.lowlevelil-module.html` |
| Types & type library | `binaryninja.types-module.html`, `binaryninja.typelibrary-module.html` |
| Architecture / Platform | `binaryninja.architecture-module.html`, `binaryninja.platform-module.html` |
| Enums (constants) | `binaryninja.enums-module.html` |
| Basic blocks / flow graph | `binaryninja.basicblock-module.html`, `binaryninja.flowgraph-module.html` |
| Settings | `binaryninja.settings-module.html` |
| UI (Qt integration) | `binaryninja.interaction-module.html` |

### How to use

- `grep -l "<symbol>" ~/Tools/binaryninja/api-docs/*.html` to locate which module defines a symbol.
- Open the relevant `*-module.html` to confirm method signatures, parameter types, and return values.
- Prefer the docs over the Python `help()` output — they include cross-references and deprecation notes.
