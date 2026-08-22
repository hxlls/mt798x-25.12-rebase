include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-firewall-patches
PKG_VERSION:=1.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-firewall-patches
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=Hide flow offloading type from firewall
  DEPENDS:=+luci-app-firewall
  PKGARCH:=all
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Compile
	true
endef

define Build/Patch
	@echo "Applying firewall patches..."
	@for patch in $(TOPDIR)/package/diy/luci-app-firewall-patches/patches/*.patch; do \
		[ -f "$$$$patch" ] || continue; \
		cd $(TOPDIR)/feeds/luci && \
		if git apply --check "$$$$patch" 2>/dev/null; then \
			git apply "$$$$patch" && \
			echo "Applied $$(basename $$$$patch)"; \
		else \
			echo "$$(basename $$$$patch) already applied or failed"; \
		fi; \
	done
endef

define Package/luci-app-firewall-patches/install
	true
endef

$(eval $(call BuildPackage,luci-app-firewall-patches))
