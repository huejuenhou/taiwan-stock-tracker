#!/bin/bash
# Double-click once to add "Taiwan Stock Tracker" to your Applications folder.
# The app keeps using this folder for your trades, so leave the folder here;
# if you move it, open Install App again from its new place.
cd "$(dirname "$0")" || exit 1
if ! python3 -c "import sys; sys.exit(sys.version_info < (3, 8))" >/dev/null 2>&1; then
  echo ""
  echo "  This app needs Python 3, which comes with Apple's free Command Line Tools."
  echo "  If a window asks to install them, click Install, wait for it to finish,"
  echo "  then double-click this file again."
  echo ""
  xcode-select --install >/dev/null 2>&1
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi
APP="$(python3 taiwan_etf_tracker.py --install-app)"
echo ""
if [ -n "$APP" ]; then
  echo "  Added Taiwan Stock Tracker to $(dirname "$APP")."
  echo "  Open it from there, Launchpad or Spotlight. You can close this window."
  echo ""
  open "$APP"
else
  echo "  The app couldn't be added. You can still use Start Tracker in this folder."
  echo ""
  read -n 1 -s -r -p "  Press any key to close."
fi
