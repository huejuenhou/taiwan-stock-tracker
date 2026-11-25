#!/bin/bash
# Installs Taiwan Stock Tracker and adds "Taiwan Stock Tracker" to Applications.
# Running it again reinstalls the app and keeps your trades.
set -euo pipefail
URL="https://github.com/huejuenhou/taiwan-stock-tracker/releases/latest/download/taiwan-stock-tracker.zip"
DEST="$HOME/Applications/Taiwan Stock Tracker"
FILES=(taiwan_etf_tracker.py index.html demo-data.json README.md CHANGELOG.md AppIcon.icns
       "Start Tracker.command" "Try Demo.command")

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
  if [ -f "$SRC/$f" ]; then cp "$SRC/$f" "$DEST/$f"; fi
done
if [ -f "$SRC/mac-app/TrackerApp" ]; then cp "$SRC/mac-app/TrackerApp" "$DEST/TrackerApp"; fi
chmod 755 "$DEST/"*.command

# The Mac app with the seal icon, in Applications, Launchpad and Spotlight.
# It runs the tracker in its own window. If the app file is missing it falls
# back to a small launcher that opens the tracker in the browser.
make_launcher() {
  local bundle="$1/Taiwan Stock Tracker.app"
  rm -rf "$bundle.new"
  mkdir -p "$bundle.new/Contents/MacOS" "$bundle.new/Contents/Resources" || return 1
  if [ -f "$DEST/AppIcon.icns" ]; then cp "$DEST/AppIcon.icns" "$bundle.new/Contents/Resources/"; fi
  cat > "$bundle.new/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Taiwan Stock Tracker</string>
  <key>CFBundleDisplayName</key><string>Taiwan Stock Tracker</string>
  <key>CFBundleIdentifier</key><string>io.github.huejuenhou.taiwan-stock-tracker</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
PLIST
  cat > "$bundle.new/Contents/MacOS/launcher" <<'LAUNCHER'
#!/bin/bash
DIR="$HOME/Applications/Taiwan Stock Tracker"
if /usr/bin/curl -s -m 2 http://127.0.0.1:8787/api/update | /usr/bin/grep -q '"current"'; then
  /usr/bin/open "http://localhost:8787"
  exit 0
fi
if [ ! -f "$DIR/Start Tracker.command" ]; then
  /usr/bin/osascript -e 'display alert "Taiwan Stock Tracker is not installed" message "Paste the install line from the project page into Terminal to install it again."'
  exit 1
fi
/usr/bin/open -a Terminal "$DIR/Start Tracker.command"
LAUNCHER
  if [ -f "$DEST/TrackerApp" ]; then
    cp "$DEST/TrackerApp" "$bundle.new/Contents/MacOS/launcher"   # the real app window
  fi
  chmod 755 "$bundle.new/Contents/MacOS/launcher"
  rm -rf "$bundle" && mv "$bundle.new" "$bundle" && touch "$bundle"
}
if [ -w /Applications ] && make_launcher /Applications 2>/dev/null; then
  APP="/Applications/Taiwan Stock Tracker.app"
else
  make_launcher "$HOME/Applications"
  APP="$HOME/Applications/Taiwan Stock Tracker.app"
fi

echo "  Installed. Open \"Taiwan Stock Tracker\" from Applications or Launchpad any time."
echo "  Your trades are kept in: $DEST"
echo ""
open "$APP"
