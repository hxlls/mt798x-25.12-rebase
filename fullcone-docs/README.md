# SONiC fullcone NAT integration

This branch carries the fullcone NAT work on top of `25.12`. The `25.12`
branch itself is kept clean (upstream merges only) so that syncing upstream
stays conflict-free - merge `25.12` into this branch to pick up updates.

## Contents

| Path | Purpose |
|---|---|
| `target/linux/generic/hack-6.12/984-add-sonic-fullcone-support.patch` | nf_nat_core: 3-tuple (proto / src-ip / src-port) hash table, EIM + EIF |
| `target/linux/generic/hack-6.12/986-add-sonic-fullcone-to-nft.patch` | nft_masq: registers the `fullcone` nftables expression |
| `package/network/config/firewall4/patches/001-firewall4-add-support-for-fullcone-nat.patch` | fw4: per-zone + per-protocol fullcone |
| `package/network/config/firewall4/Makefile` | drops the `+kmod-nft-fullcone` dependency |
| `package/mtk/applications/luci-app-turboacc-mtk/htdocs/.../view/fullcone.js` | LuCI page: global gates + per-zone table |

Upstream patch 985 (iptables `FULLCONE` target) is deliberately not used:
this tree is firewall4-only, there is no `iptables-mod-fullconenat`.

## Two prerequisites that live outside git

1. **`.config`** is not tracked by git. `CONFIG_PACKAGE_kmod-nft-fullcone`
   must be unset, because the old out-of-tree module registers the very same
   `fullcone` nft expression and would collide with the one that is now built
   into `nft_masq.ko`:

       # CONFIG_PACKAGE_kmod-nft-fullcone is not set

   The stale module also must not linger in the image - a full `make` removes
   it automatically via the package stale-file cleanup.


## Build

    make -j$(nproc)

## Configuration

    config defaults
        option fullcone      1    # global gate, IPv4
        option fullcone6     0    # global gate, IPv6

    config zone
        option fullcone            1        # opt this zone in (default 1)
        list   fullcone_proto     'udp'     # optional L4 protocol restriction

`defaults.fullcone` / `defaults.fullcone6` are global gates. `zone.fullcone`
defaults to 1, so with a gate enabled every masquerading zone gets fullcone -
unchanged behaviour compared to before per-zone control existed.
`zone.fullcone_proto` restricts fullcone to the listed protocols while all
other protocols keep plain masquerading: the per-protocol fullcone rules are
emitted first in the nat chain and the generic masquerade rule stays behind
them as the fallback (the first nat statement in a chain wins).

All of this is also exposed in LuCI: global gates under
*Firewall - Zone Settings / General Settings*, the per-zone switch in a
zone's *General* tab and the protocol list in its *Advanced* tab.

Protocol names are not checked against a whitelist (same behaviour as fw4's
`proto` option, so that `gre`, `esp` etc. remain usable). A typo therefore
produces an invalid ruleset and the firewall refuses to load - use the LuCI
selector when editing by hand.

## Where the controls live

Everything is on one page: **Network -> TurboACC -> Fullcone NAT**.

  - two global gates, "Fullcone NAT (IPv4)" and "Fullcone NAT (IPv6)"
  - a per-zone table with columns *Zone / IPv4 masquerading / Fullcone NAT /
    Protocols*. The protocol column restricts fullcone to the selected L4
    protocols, leaving every other protocol on plain masquerading.

The TurboACC page itself only reports status (its "Full Cone NAT" row now
shows "SONiC Fullcone" instead of always claiming "Disabled") and carries a
button that opens the fullcone page.

The page lives in `luci-app-turboacc-mtk`, which is part of this repository.
An earlier revision put the same controls on the firewall page via a patch
against the luci feed; that patch is gone, because a feed re-clone silently
loses it and the switch then existed in two places. The firewall4 patch still
provides the actual fw4 rules - only the UI moved.

## Verify on the device

    nft list ruleset | grep fullcone
    cat /sys/module/nft_masq/refcnt
    fw4 print | grep -i fullcone

## Sync upstream

    git checkout 25.12
    git merge pr-source/25.12
    git checkout fullcone
    git merge 25.12

## Known risks / to measure

- **flow offloading**: the interaction has not been measured on hardware.
  Test with `flow_offloading` / `flow_offloading_hw` both enabled and
  disabled.
- **memory**: the SONiC patch keeps a hash-table node per conntrack entry, so
  memory use grows with the connection count (BT/PT style workloads).
- `package/network/utils/fullconenat-nft/` is left in the tree but must stay
  unselected - it cannot coexist with this implementation.
