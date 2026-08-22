# SPDX-License-Identifier: GPL-2.0-only
# This is free software, licensed under the GNU General Public License v2.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-fakeup
PKG_VERSION:=1.0
PKG_RELEASE:=1

LUCI_TITLE:=Fake Kernel Upgrade Web UI
LUCI_DEPENDS:=+luci-base +luci-mod-status
LUCI_PKGARCH:=all

PKG_LICENSE:=GPL-2.0-only

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
