include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-firewall-patches
PKG_VERSION:=1.0
PKG_RELEASE:=1

LUCI_TITLE:=Hide flow offloading type from firewall
LUCI_DEPENDS:=+luci-app-firewall

include $(TOPDIR)/feeds/luci/luci.mk

# Apply patches to feeds/luci before build
define Build/Patch
	@echo "Applying firewall patches..."
	@for patch in $(TOPDIR)/package/diy/luci-app-firewall-patches/luci-app-firewall-patches/patches/*.patch; do \
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
