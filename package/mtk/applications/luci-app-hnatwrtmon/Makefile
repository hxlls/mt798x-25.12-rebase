include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-hnatwrtmon
PKG_VERSION:=2.1.0
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=HNAT Traffic Monitor
LUCI_DEPENDS:=+hnat-bwmon
LUCI_PKGARCH:=all

define Build/Prepare
	$(call Build/Prepare/Default)
	chmod +x $(PKG_BUILD_DIR)/root/usr/libexec/rpcd/luci.hnatwrtmon
endef

define Package/luci-app-hnatwrtmon/postinst
#!/bin/sh
if [ -n "$${IPKG_INSTROOT}" ]; then
	chmod 755 "$${IPKG_INSTROOT}/usr/libexec/rpcd/luci.hnatwrtmon" 2>/dev/null
	exit 0
fi
chmod 755 /usr/libexec/rpcd/luci.hnatwrtmon 2>/dev/null
/etc/init.d/rpcd restart 2>/dev/null
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
