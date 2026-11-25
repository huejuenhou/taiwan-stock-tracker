#!/bin/bash
# Double-click to open the Taiwan Stock Tracker. Close this window to stop it.
cd "$(dirname "$0")" || exit 1
if ! python3 -c "import sys; sys.exit(sys.version_info < (3, 9))" >/dev/null 2>&1; then
  echo ""
  echo "  This app needs Python 3, which comes with Apple's free Command Line Tools."
  echo "  If a window asks to install them, click Install, wait for it to finish,"
  echo "  then double-click this file again."
  echo ""
  xcode-select --install >/dev/null 2>&1
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi
exec python3 taiwan_etf_tracker.py 
