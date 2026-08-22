include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-firewall-patches
PKG_VERSION:=1.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-firewall-patches
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=Patches for luci-app-firewall
  DEPENDS:=+luci-app-firewall
  PKGARCH:=all
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Compile
	true
endef

define Build/Install
	true
endef

define Build/InstallDev
	true
endef

# Apply patches to feeds/luci during build
define Build/Patch
	$(TOPDIR)/package/diy/luci-app-firewall-patches/apply.sh "$(TOPDIR)"
endef

define Package/luci-app-firewall-patches/install
	true
endef

$(eval $(call BuildPackage,luci-app-firewall-patches))
