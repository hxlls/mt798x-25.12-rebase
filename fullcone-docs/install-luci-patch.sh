#!/bin/bash
# Install the fullcone LuCI patch into the luci feed.
# Needed after the feed has been re-cloned; a plain `./scripts/feeds update -a`
# does not remove the untracked patches/ directory.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
TREE=$(cd "$HERE/.." && pwd)
SRC="$HERE/luci-app-firewall-perzone-fullcone.patch"
DEST="$TREE/feeds/luci/applications/luci-app-firewall/patches"

[ -d "$TREE/feeds/luci/applications/luci-app-firewall" ] || {
	echo "luci feed is not installed yet; run:" >&2
	echo "  ./scripts/feeds update -a && ./scripts/feeds install -a" >&2
	exit 1
}

mkdir -p "$DEST"
cp -f "$SRC" "$DEST/001-luci-app-firewall-perzone-fullcone.patch"
echo "installed -> $DEST/001-luci-app-firewall-perzone-fullcone.patch"
