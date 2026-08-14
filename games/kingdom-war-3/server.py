"""Compatibility launcher for the fixed LAN/TikFinity bridge."""
import os
import shutil
import subprocess
import sys

root = os.path.dirname(os.path.abspath(__file__))
node = shutil.which("node")
if not node:
    print("Node.js 22 o superiore non trovato. Usa AVVIA_SAFARI_TIKFINITY.bat.")
    sys.exit(1)
sys.exit(subprocess.call([node, os.path.join(root, "bridge", "server.mjs")], cwd=root))
