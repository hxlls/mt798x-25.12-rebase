include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=hxlls

LUCI_TITLE:=LuCI app for Sing-Box
LUCI_DEPENDS:=+sing-box +curl +jsonfilter +ucode +uhttpd
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
