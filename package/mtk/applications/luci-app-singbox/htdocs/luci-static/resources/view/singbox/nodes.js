'use strict';
'require form';
'require rpc';
'require uci';
'require view';

var callTestNodeDelay = rpc.declare({
	object: 'luci.singbox',
	method: 'testNodeDelay',
	params: { server: '', port: '' },
	expect: { '': '' }
});

return view.extend({
	load: function() {
		return uci.load('singbox');
	},

	render: function(data) {
		var m, s, o;

		m = new form.Map('singbox', _('Sing-Box'),
			_('Manage proxy nodes. Click on a node to edit its settings.'));

		// Node list
		s = m.section(form.GridSection, 'node', _('Nodes'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.nodescriptions = true;

		s.handleAdd = function(ev) {
			var section_id = uci.add('singbox', 'node');
			uci.set('singbox', section_id, 'enabled', '1');
			uci.set('singbox', section_id, 'type', 'shadowsocks');
			m.addedSection = section_id;
			return this.renderMoreOptionsModal(section_id);
		};

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.DummyValue, '_type', _('Protocol'));
		o.textvalue = function(section_id) {
			var type = uci.get('singbox', section_id, 'type') || '-';
			var labels = {
				'shadowsocks': 'Shadowsocks',
				'vmess': 'VMess',
				'vless': 'VLESS',
				'trojan': 'Trojan',
				'hysteria2': 'Hysteria2',
			};
			return labels[type] || type;
		};

		o = s.option(form.Value, 'name', _('Name'));
		o.rmempty = true;
		o.placeholder = 'Node Name';

		o = s.option(form.ListValue, 'type', _('Protocol'));
		o.value('shadowsocks', 'Shadowsocks');
		o.value('vmess', 'VMess');
		o.value('vless', 'VLESS');
		o.value('trojan', 'Trojan');
		o.value('hysteria2', 'Hysteria2');
		o.default = 'shadowsocks';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'server', _('Server'));
		o.datatype = 'host';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'server_port', _('Port'));
		o.datatype = 'port';
		o.rmempty = false;
		o.modalonly = true;

		// Shadowsocks fields
		o = s.option(form.ListValue, 'method', _('Encryption'));
		o.value('aes-128-gcm', 'AES-128-GCM');
		o.value('aes-256-gcm', 'AES-256-GCM');
		o.value('chacha20-ietf-poly1305', 'ChaCha20-Poly1305');
		o.value('2022-blake3-aes-128-gcm', '2022-blake3-aes-128-gcm');
		o.value('2022-blake3-aes-256-gcm', '2022-blake3-aes-256-gcm');
		o.value('2022-blake3-chacha20-poly1305', '2022-blake3-chacha20-poly1305');
		o.default = 'aes-256-gcm';
		o.depends('type', 'shadowsocks');
		o.modalonly = true;

		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.depends('type', 'shadowsocks');
		o.rmempty = false;
		o.modalonly = true;

		// VMess fields
		o = s.option(form.Value, 'uuid', _('UUID'));
		o.depends('type', 'vmess');
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'uuid', _('UUID'));
		o.depends('type', 'vless');
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'alter_id', _('Alter ID'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.depends('type', 'vmess');
		o.modalonly = true;

		o = s.option(form.ListValue, 'security', _('Encryption'));
		o.value('auto', 'Auto');
		o.value('none', 'None');
		o.value('aes-128-gcm', 'AES-128-GCM');
		o.value('chacha20-poly1305', 'ChaCha20-Poly1305');
		o.value('zero', 'Zero');
		o.default = 'auto';
		o.depends('type', 'vmess');
		o.modalonly = true;

		// VLESS fields
		o = s.option(form.ListValue, 'flow', _('Flow'));
		o.value('', _('None'));
		o.value('xtls-rprx-vision', 'XTLS-RPRX-Vision');
		o.default = '';
		o.depends('type', 'vless');
		o.modalonly = true;

		// Trojan fields
		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.depends('type', 'trojan');
		o.rmempty = false;
		o.modalonly = true;

		// Hysteria2 fields
		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.depends('type', 'hysteria2');
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.ListValue, 'obfs_type', _('Obfs Type'));
		o.value('', _('None'));
		o.value('salamander', 'Salamander');
		o.default = '';
		o.depends('type', 'hysteria2');
		o.modalonly = true;

		o = s.option(form.Value, 'obfs_password', _('Obfs Password'));
		o.depends('obfs_type', 'salamander');
		o.modalonly = true;

		// Transport settings
		o = s.option(form.ListValue, 'transport', _('Transport'));
		o.value('tcp', 'TCP');
		o.value('ws', 'WebSocket');
		o.value('grpc', 'gRPC');
		o.value('http', 'HTTP');
		o.value('quic', 'QUIC');
		o.default = 'tcp';
		o.depends('type', 'vmess');
		o.depends('type', 'vless');
		o.depends('type', 'trojan');
		o.modalonly = true;

		o = s.option(form.Value, 'path', _('Path'));
		o.depends('transport', 'ws');
		o.depends('transport', 'http');
		o.placeholder = '/';
		o.modalonly = true;

		o = s.option(form.Value, 'host', _('Host'));
		o.depends('transport', 'ws');
		o.depends('transport', 'http');
		o.modalonly = true;

		o = s.option(form.Value, 'service_name', _('Service Name'));
		o.depends('transport', 'grpc');
		o.modalonly = true;

		// TLS settings
		o = s.option(form.Flag, 'tls', _('TLS'));
		o.default = o.disabled;
		o.depends('type', 'vmess');
		o.depends('type', 'vless');
		o.depends('type', 'trojan');
		o.modalonly = true;

		o = s.option(form.Value, 'sni', _('SNI'));
		o.depends('tls', '1');
		o.modalonly = true;

		o = s.option(form.Value, 'fingerprint', _('Fingerprint'));
		o.value('', _('Auto'));
		o.value('chrome', 'Chrome');
		o.value('firefox', 'Firefox');
		o.value('safari', 'Safari');
		o.value('ios', 'iOS');
		o.value('android', 'Android');
		o.value('edge', 'Edge');
		o.value('random', 'Random');
		o.default = '';
		o.depends('tls', '1');
		o.modalonly = true;

		// Tag
		o = s.option(form.Value, 'tag', _('Tag'),
			_('Custom tag for this outbound. Leave empty to auto-generate.'));
		o.rmempty = true;
		o.modalonly = true;

		// Test delay button
		o = s.option(form.Button, '_test', _('Test'));
		o.inputstyle = 'action';
		o.inputtitle = _('Test');
		o.modalonly = false;
		o.onclick = function(ev, section_id) {
			var server = uci.get('singbox', section_id, 'server');
			var port = uci.get('singbox', section_id, 'server_port');

			if (!server || !port) {
				ui.addNotification(null, E('p', _('Please configure server and port first.')));
				return;
			}

			var btn = ev.target;
			btn.disabled = true;
			btn.textContent = _('Testing...');

			var start = Date.now();
			callTestNodeDelay(server, port).then(function(result) {
				var elapsed = Date.now() - start;
				if (result === 0 || result === '0') {
					btn.textContent = '%dms'.format(elapsed);
					btn.style.color = '#28a745';
				} else {
					btn.textContent = _('Failed');
					btn.style.color = '#dc3545';
				}
				setTimeout(function() {
					btn.disabled = false;
					btn.textContent = _('Test');
					btn.style.color = '';
				}, 3000);
			}).catch(function() {
				btn.textContent = _('Error');
				btn.style.color = '#dc3545';
				setTimeout(function() {
					btn.disabled = false;
					btn.textContent = _('Test');
					btn.style.color = '';
				}, 3000);
			});
		};

		return m.render();
	}
});
