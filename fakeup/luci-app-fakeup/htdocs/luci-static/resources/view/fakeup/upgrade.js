'use strict';
'require view';
'require rpc';
'require ui';

var callGetStatus = rpc.declare({
	object: 'luci.fakeup',
	method: 'get_status'
});

var callDoUpgrade = rpc.declare({
	object: 'luci.fakeup',
	method: 'do_upgrade'
});

var callReboot = rpc.declare({
	object: 'system',
	method: 'reboot',
	expect: { result: 0 }
});

return view.extend({
	load: function() {
		return Promise.all([callGetStatus()]);
	},

	render: function(data) {
		var status = data[0] || {};
		var version = status.version || '-';
		var source = (status.source == 'file') ? _('custom file') : _('running kernel');

		return E('div', { 'class': 'cbi-map' }, [
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'cbi-section-descr' }, _(
					'Click the button to bump the smallest kernel version number and reboot the device.'
				)),
				E('div', { 'class': 'cbi-section-node' }, [
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('Current kernel version')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('b', {}, version),
							E('span', { 'class': 'cbi-value-description' }, ' (%s)'.format(source))
						])
					])
				]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action important',
						'click': ui.createHandlerFn(this, 'handleUpgrade')
					}, _('Upgrade & Reboot'))
				])
			])
		]);
	},

	handleUpgrade: function(ev) {
		return callDoUpgrade().then(function(upg) {
			if (upg.error) {
				L.ui.addNotification(null, E('p', _('Upgrade failed: %s').format(upg.error)));
				return;
			}

			return callReboot().then(function(res) {
				if (res != 0) {
					L.ui.addNotification(null, E('p', _('The reboot command failed with code %d').format(res)));
					return;
				}

				L.ui.showModal(_('Rebooting…'), [
					E('p', { 'class': 'spinning' },
						_('Kernel version bumped from %s to %s. Rebooting…').format(upg.old_version, upg.new_version))
				]);

				window.setTimeout(function() {
					L.ui.showModal(_('Rebooting…'), [
						E('p', { 'class': 'spinning alert-message warning' },
							_('Device unreachable! Still waiting for device...'))
					]);
				}, 150000);

				L.ui.awaitReconnect();
			});
		})
		.catch(function(e) { L.ui.addNotification(null, E('p', e.message)); });
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
