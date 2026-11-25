#!/bin/bash
# Builds mac-app/TrackerApp (Apple Silicon + Intel, macOS 12+) from TrackerApp.swift.
# Run before a release whenever TrackerApp.swift changes, and commit the result.
set -euo pipefail
cd "$(dirname "$0")"
# Use the newest SDK this Swift compiler can read (a newer one can fail to load).
for SDK in $(ls -d /Library/Developer/CommandLineTools/SDKs/MacOSX[0-9]*.sdk | sort -rV); do
  ok=1
  for arch in arm64 x86_64; do
    swiftc -O -sdk "$SDK" -target "$arch-apple-macos12" TrackerApp.swift -o "/tmp/TrackerApp-$arch" 2>/dev/null || { ok=0; break; }
  done
  if [ $ok = 1 ]; then
    lipo -create /tmp/TrackerApp-arm64 /tmp/TrackerApp-x86_64 -output TrackerApp
    rm -f /tmp/TrackerApp-arm64 /tmp/TrackerApp-x86_64
    echo "Built TrackerApp with $(basename "$SDK")"; exit 0
  fi
done
echo "No SDK worked with this Swift compiler." >&2; exit 1
