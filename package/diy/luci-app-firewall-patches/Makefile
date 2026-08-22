include $(TOPDIR)/rules.mk

LUCI_TITLE:=Hide flow offloading type from firewall
LUCI_DEPENDS:=+luci-app-firewall
LUCI_SUBMENU_FORCED:=3. Applications

include $(TOPDIR)/feeds/luci/luci.mk

# Apply patches to feeds/luci before build
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
