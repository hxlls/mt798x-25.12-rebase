'use strict';
'require form';
'require rpc';
'require uci';
'require view';

var callGetStatus = rpc.declare({
	object: 'luci.singbox',
	method: 'getStatus',
	expect: { '': {} }
});

var callGetGlobal = rpc.declare({
	object: 'luci.singbox',
	method: 'getGlobal',
	expect: { '': {} }
});

var callStartService = rpc.declare({
	object: 'luci.singbox',
	method: 'startService',
	expect: { '': '' }
});

var callStopService = rpc.declare({
	object: 'luci.singbox',
	method: 'stopService',
	expect: { '': '' }
});

var callRestartService = rpc.declare({
	object: 'luci.singbox',
	method: 'restartService',
	expect: { '': '' }
});

var callGetLog = rpc.declare({
	object: 'luci.singbox',
	method: 'getLog',
	params: { lines: 50 },
	expect: { '': '' }
});

return view.extend({
	load: function() {
		return Promise.all([
			callGetStatus(),
			callGetGlobal(),
			callGetLog()
		]);
	},

	render: function(data) {
		var status = data[0] || {};
		var global = data[1] || {};
		var log = data[2] || '';

		var running = status.running || false;
		var version = status.version || '-';
		var pid = status.pid || '-';
		var uptime = status.uptime || '-';

		var statusBadge = running
			? E('span', { 'class': 'badge success' }, [ _('Running') ])
			: E('span', { 'class': 'badge danger' }, [ _('Stopped') ]);

		var m, s, o;

		m = new form.Map('singbox', _('Sing-Box'),
			_('Sing-Box proxy service overview and management.'));

		// Status section
		s = m.section(form.NamedSection, 'global', 'singbox', _('Service Status'));
		s.anonymous = true;

		o = s.option(form.DummyValue, '_status', _('Status'));
		o.textvalue = function() { return statusBadge; };

		o = s.option(form.DummyValue, '_version', _('Version'));
		o.textvalue = function() { return version; };

		o = s.option(form.DummyValue, '_pid', _('PID'));
		o.textvalue = function() { return running ? pid : '-'; };

		o = s.option(form.DummyValue, '_uptime', _('Uptime'));
		o.textvalue = function() { return running ? uptime : '-'; };

		// Quick settings
		s = m.section(form.NamedSection, 'global', 'singbox', _('Quick Settings'));
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enable'),
			_('Enable Sing-Box proxy service.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'log_level', _('Log Level'));
		o.value('trace', 'Trace');
		o.value('debug', 'Debug');
		o.value('info', 'Info');
		o.value('warn', 'Warn');
		o.value('error', 'Error');
		o.default = 'info';

		o = s.option(form.Value, 'mixed_port', _('Mixed Port'),
			_('HTTP/SOCKS5 mixed proxy port.'));
		o.datatype = 'port';
		o.default = '2080';
		o.rmempty = false;

		o = s.option(form.Flag, 'tun_enabled', _('TUN Mode'),
			_('Enable TUN for transparent proxy.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'tun_stack', _('TUN Stack'));
		o.value('system', 'System');
		o.value('gvisor', 'gVisor');
		o.value('mixed', 'Mixed');
		o.default = 'system';
		o.depends('tun_enabled', '1');

		o = s.option(form.Flag, 'clash_api_enabled', _('Clash API'),
			_('Enable Clash-compatible API for external controllers.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'clash_api_port', _('Clash API Port'));
		o.datatype = 'port';
		o.default = '9090';
		o.depends('clash_api_enabled', '1');

		o = s.option(form.Value, 'clash_api_secret', _('Clash API Secret'));
		o.depends('clash_api_enabled', '1');
		o.rmempty = true;

		// Log section
		s = m.section(form.NamedSection, 'global', 'singbox', _('Service Log'));
		s.anonymous = true;

		o = s.option(form.DummyValue, '_log', _('Recent Log'));
		o.textvalue = function() {
			var lines = log.split('\n').slice(-20);
			return E('pre', { style: 'max-height:300px;overflow:auto;font-size:12px;' },
				lines.join('\n'));
		};

		return m.render();
	}
});
