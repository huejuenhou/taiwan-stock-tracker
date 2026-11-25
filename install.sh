#!/bin/bash
# Installs Taiwan Stock Tracker and adds "Taiwan Stock Tracker" to Applications.
# Running it again reinstalls the app and keeps your trades.
set -euo pipefail
URL="https://github.com/huejuenhou/taiwan-stock-tracker/releases/latest/download/taiwan-stock-tracker.zip"
DEST="$HOME/Applications/Taiwan Stock Tracker"
FILES=(taiwan_etf_tracker.py index.html demo-data.json README.md CHANGELOG.md AppIcon.icns
       "Start Tracker.command" "Try Demo.command" "Install App.command" mac-app/TrackerApp)

echo ""
echo "  Installing Taiwan Stock Tracker…"
if ! python3 -c "import sys; sys.exit(sys.version_info < (3, 8))" >/dev/null 2>&1; then
  echo ""
  echo "  This app needs Apple's free Command Line Tools."
  echo "  A window will ask to install them: click Install and wait for it to finish,"
  echo "  then paste the same install command again."
  echo ""
  xcode-select --install >/dev/null 2>&1 || true
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ -n "${INSTALL_FROM:-}" ]; then
  SRC="$INSTALL_FROM"            # a local copy, for testing
else
  curl -fsSL "$URL" -o "$TMP/app.zip"
  unzip -q "$TMP/app.zip" -d "$TMP/unzipped"
  SRC="$TMP/unzipped/Taiwan Stock Tracker"
fi
if [ ! -f "$SRC/taiwan_etf_tracker.py" ]; then
  echo "  The download didn't look right, so nothing was changed. Please try again later."
  exit 1
fi

# Copy only the app's own files, so an existing install keeps its data.
mkdir -p "$DEST"
for f in "${FILES[@]}"; do
  if [ -f "$SRC/$f" ]; then
    mkdir -p "$(dirname "$DEST/$f")"
    cp "$SRC/$f" "$DEST/$f"
  fi
done
chmod 755 "$DEST/"*.command
if [ -f "$DEST/mac-app/TrackerApp" ]; then chmod 755 "$DEST/mac-app/TrackerApp"; fi

# The Mac app with the seal icon, in Applications, Launchpad and Spotlight.
# Releases before 1.0.3 don't include it; then the tracker opens in the
# browser through Start Tracker, as before.
APP=""
if [ -f "$DEST/mac-app/TrackerApp" ]; then
  APP="$(python3 "$DEST/taiwan_etf_tracker.py" --install-app || true)"
fi
if [ -z "$APP" ]; then
  echo "  Installed in: $DEST"
  echo "  To open it later, double-click \"Start Tracker\" in that folder."
  echo ""
  open "$DEST"
  open "$DEST/Start Tracker.command"
  exit 0
fi

echo "  Installed. Open \"Taiwan Stock Tracker\" from Applications or Launchpad any time."
echo "  Your trades are kept in: $DEST"
echo ""
open "$APP"
