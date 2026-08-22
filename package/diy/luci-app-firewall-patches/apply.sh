#!/bin/sh
TOPDIR="$1"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)/patches"
FEEDS_LUCI="$TOPDIR/feeds/luci"

for patch in "$PATCH_DIR"/*.patch; do
    [ -f "$patch" ] || continue
    echo "Applying $(basename "$patch") to feeds/luci..."
    if cd "$FEEDS_LUCI" && git apply --check "$patch" 2>/dev/null; then
        git apply "$patch"
        echo "  Applied successfully"
    else
        echo "  Already applied or failed, skipping"
    fi
done
