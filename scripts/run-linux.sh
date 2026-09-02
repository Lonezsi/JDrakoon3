#!/bin/bash
# Linux launcher for JDrakoon3. Make executable once: chmod +x run-linux.sh
# Needs Node 18+ and a Chromium-family browser (chrome/chromium/edge/brave).
cd "$(dirname "$0")/.." || exit 1
exec node launcher.mjs
