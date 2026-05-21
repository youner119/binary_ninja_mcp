#!/usr/bin/env python3

import json
import os
import platform
import sys
from pathlib import Path


def check_os():
    """Check if the operating system is Mac OS."""
    if platform.system() != "Darwin":
        print("Error: This setup script is only supported on Mac OS.")
        print(f"Current operating system: {platform.system()}")
        sys.exit(1)


def get_config_path():
    """Get the path to the Claude Desktop config file."""
    home = Path.home()
    return home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"


def _node_executable() -> str:
    """Resolve absolute path to a Node.js binary.

    Prefers shutil.which(), falls back to the bare "node" name (lets MCP
    client resolve via PATH). Returning "node" is acceptable because most
    MCP clients are launched from a login shell that has Node on PATH.
    """
    import shutil
    return shutil.which("node") or "node"


def setup_claude_desktop():
    """Set up Claude Desktop configuration for the current project."""
    check_os()

    config_path = get_config_path()

    if not config_path.exists():
        print(f"Error: Claude Desktop config not found at {config_path}")
        print("Please make sure Claude Desktop is installed and configured.")
        sys.exit(1)

    try:
        with open(config_path) as f:
            config = json.load(f)

        # Use the installed plugin path (works for Plugin Manager installs):
        # <BinaryNinja>/repositories/community/plugins/CX330Blake_binary_ninja_mcp
        plugin_root = Path(__file__).resolve().parent.parent
        src_dir = plugin_root / "bridge"

        if "mcpServers" not in config:
            config["mcpServers"] = {}

        config["mcpServers"]["binary_ninja_mcp"] = {
            "command": _node_executable(),
            "args": [str(src_dir / "dist" / "index.js")],
        }

        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)

        print("Successfully updated Claude Desktop configuration.")

    except Exception as e:
        print(f"Error updating configuration: {e}")
        sys.exit(1)


if __name__ == "__main__":
    setup_claude_desktop()
