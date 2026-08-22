include $(TOPDIR)/rules.mk

PKG_NAME:=hnat-bwmon
PKG_VERSION:=1.8.0
PKG_RELEASE:=1

PKG_MAINTAINER:=HNAT Bandwidth Monitor
PKG_LICENSE:=GPL-2.0-only

include $(INCLUDE_DIR)/package.mk

define Package/hnat-bwmon
  SECTION:=utils
  CATEGORY:=MTK Properties
  SUBMENU:=Applications
  TITLE:=HNAT-aware bandwidth monitor
  DEPENDS:=+libc @TARGET_mediatek
  PROVIDES:=wrtbwmon
endef

define Package/hnat-bwmon/description
  A bandwidth monitoring tool that reads MediaTek HNAT (Hardware NAT)
  FOE (Flow Offload Engine) entries to accurately track per-client
  bandwidth usage. Compatible with luci-app-hnatwrtmon.

  This replaces the standard wrtbwmon which cannot see HW-offloaded
  flows and would report zero traffic when HNAT is active.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./src/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(TARGET_CC) $(TARGET_CFLAGS) $(TARGET_CPPFLAGS) -Wall \
		-o $(PKG_BUILD_DIR)/hnat-bwmon \
		$(PKG_BUILD_DIR)/hnat-bwmon.c $(TARGET_LDFLAGS)
endef

define Package/hnat-bwmon/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/hnat-bwmon $(1)/usr/sbin/
	$(LN) hnat-bwmon $(1)/usr/sbin/wrtbwmon
endef

$(eval $(call BuildPackage,hnat-bwmon))
