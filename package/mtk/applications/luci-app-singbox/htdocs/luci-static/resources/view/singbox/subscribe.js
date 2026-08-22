'use strict';
'require form';
'require rpc';
'require uci';
'require view';

var callFetchSubscribe = rpc.declare({
	object: 'luci.singbox',
	method: 'fetchSubscribe',
	params: { url: '', ua: '' },
	expect: { '': '' }
});

var callParseNodes = rpc.declare({
	object: 'luci.singbox',
	method: 'parseNodes',
	params: { content: '' },
	expect: { '': [] }
});

var callUciAdd = rpc.declare({
	object: 'luci.singbox',
	method: 'uciAdd',
	params: { type: '', values: {} },
	expect: { '': '' }
});

var callUciDelete = rpc.declare({
	object: 'luci.singbox',
	method: 'uciDelete',
	params: { section: '' },
	expect: { '': '' }
});

var callUciSet = rpc.declare({
	object: 'luci.singbox',
	method: 'uciSet',
	params: { section: '', key: '', value: '' },
	expect: { '': '' }
});

var callUciCommit = rpc.declare({
	object: 'luci.singbox',
	method: 'uciCommit',
	expect: { '': '' }
});

var callRestartService = rpc.declare({
	object: 'luci.singbox',
	method: 'restartService',
	expect: { '': '' }
});

return view.extend({
	load: function() {
		return uci.load('singbox');
	},

	render: function(data) {
		var m, s, o;

		m = new form.Map('singbox', _('Sing-Box'),
			_('Manage subscription links and import nodes.'));

		// Subscription list
		s = m.section(form.GridSection, 'subscribe', _('Subscriptions'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.nodescriptions = true;

		s.handleAdd = function(ev) {
			var section_id = uci.add('singbox', 'subscribe');
			uci.set('singbox', section_id, 'enabled', '1');
			uci.set('singbox', section_id, 'auto_update', '0');
			uci.set('singbox', section_id, 'update_interval', '24');
			uci.set('singbox', section_id, 'ua', 'sing-box');
			m.addedSection = section_id;
			return this.renderMoreOptionsModal(section_id);
		};

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'name', _('Name'),
			_('Subscription name for identification.'));
		o.rmempty = true;
		o.placeholder = 'My Subscription';

		o = s.option(form.Value, 'url', _('URL'),
			_('Subscription URL. Supports Clash, V2Ray, SIP008, and base64 encoded formats.'));
		o.rmempty = false;
		o.placeholder = 'https://example.com/api/v1/client/subscribe?token=xxx';

		o = s.option(form.Value, 'ua', _('User Agent'));
		o.default = 'sing-box';
		o.rmempty = true;

		o = s.option(form.Flag, 'auto_update', _('Auto Update'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'update_interval', _('Update Interval'));
		o.value('6', _('Every 6 hours'));
		o.value('12', _('Every 12 hours'));
		o.value('24', _('Every 24 hours'));
		o.value('48', _('Every 48 hours'));
		o.value('72', _('Every 72 hours'));
		o.default = '24';
		o.depends('auto_update', '1');

		o = s.option(form.Button, '_update', _('Update'));
		o.inputstyle = 'action';
		o.inputtitle = _('Update Now');
		o.modalonly = false;
		o.onclick = function(ev, section_id) {
			var url = uci.get('singbox', section_id, 'url');
			var ua = uci.get('singbox', section_id, 'ua') || 'sing-box';

			if (!url) {
				ui.addNotification(null, E('p', _('Please enter subscription URL first.')));
				return;
			}

			var btn = ev.target;
			btn.disabled = true;
			btn.textContent = _('Updating...');

			return callFetchSubscribe(url, ua).then(function(content) {
				if (!content) {
					ui.addNotification(null, E('p', _('Failed to fetch subscription. Check URL and network.')));
					btn.disabled = false;
					btn.textContent = _('Update Now');
					return;
				}

				return callParseNodes(content).then(function(nodes) {
					if (!nodes || nodes.length === 0) {
						ui.addNotification(null, E('p', _('No valid nodes found in subscription.')));
						btn.disabled = false;
						btn.textContent = _('Update Now');
						return;
					}

					// Delete old nodes from this subscription
					var sections = uci.sections('singbox', 'node');
					var deletePromises = [];
					for (var i = 0; i < sections.length; i++) {
						if (sections[i].subscribe === section_id) {
							deletePromises.push(callUciDelete(sections[i]['.name']));
						}
					}

					return Promise.all(deletePromises).then(function() {
						// Add new nodes
						var addPromises = [];
						for (var i = 0; i < nodes.length; i++) {
							var node = nodes[i];
							var values = {
								type: node.type || '',
								name: node.name || '',
								server: node.server || '',
								server_port: node.server_port || '',
								subscribe: section_id,
								enabled: '1',
							};

							// Add protocol-specific fields
							if (node.type === 'shadowsocks') {
								values.method = node.method || '';
								values.password = node.password || '';
							} else if (node.type === 'vmess') {
								values.uuid = node.uuid || '';
								values.alter_id = node.alter_id || '0';
								values.security = node.security || 'auto';
								values.transport = node.transport || 'tcp';
								values.path = node.path || '';
								values.host = node.host || '';
								values.tls = node.tls || '0';
								values.sni = node.sni || '';
							} else if (node.type === 'vless') {
								values.uuid = node.uuid || '';
								values.flow = node.flow || '';
								values.transport = node.transport || 'tcp';
								values.tls = node.tls || '0';
								values.sni = node.sni || '';
							} else if (node.type === 'trojan') {
								values.password = node.password || '';
								values.transport = node.transport || 'tcp';
								values.sni = node.sni || '';
							} else if (node.type === 'hysteria2') {
								values.password = node.obfs_password || '';
								values.obfs_type = node.obfs_type || '';
								values.sni = node.sni || '';
							}

							addPromises.push(callUciAdd('node', values));
						}

						return Promise.all(addPromises).then(function() {
							// Update last_update timestamp
							callUciSet(section_id, 'last_update', new Date().toISOString());
							callUciCommit();

							ui.addNotification(null, E('p',
								_('Successfully imported %d nodes.').format(nodes.length)));

							btn.disabled = false;
							btn.textContent = _('Update Now');

							// Refresh the page
							location.reload();
						});
					});
				});
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('Error: %s').format(err.message || err)));
				btn.disabled = false;
				btn.textContent = _('Update Now');
			});
		};

		o = s.option(form.DummyValue, 'last_update', _('Last Update'));
		o.textvalue = function(section_id) {
			var val = uci.get('singbox', section_id, 'last_update');
			return val || _('Never');
		};

		o = s.option(form.DummyValue, '_node_count', _('Nodes'));
		o.textvalue = function(section_id) {
			var sections = uci.sections('singbox', 'node');
			var count = 0;
			for (var i = 0; i < sections.length; i++) {
				if (sections[i].subscribe === section_id) count++;
			}
			return String(count);
		};

		return m.render();
	}
});
