#!/bin/bash
# Double-clickable macOS launcher for JDrakoon3.
# Resolves to the repo/release root (one level up from scripts/) and runs the
# cross-platform Node launcher. Make executable once: chmod +x run-macos.command
cd "$(dirname "$0")/.." || exit 1
exec node launcher.mjs
