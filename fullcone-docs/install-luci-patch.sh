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

# The LuCI firewall UI lives in this feed; its po/ directory is compiled from
# the package source (not from build_dir), so a patch cannot reach it and the
# translations have to be appended directly.
PO="$TREE/feeds/luci/applications/luci-app-firewall/po/zh_Hans/firewall.po"
SNIP="$HERE/luci-app-firewall-zh_Hans.po"
if [ -f "$PO" ] && [ -f "$SNIP" ]; then
	if grep -q 'Fullcone NAT (IPv4)' "$PO"; then
		echo "zh_Hans translations already present, skipping"
	else
		cat "$SNIP" >> "$PO"
		echo "appended zh_Hans translations -> $PO"
	fi
fi
