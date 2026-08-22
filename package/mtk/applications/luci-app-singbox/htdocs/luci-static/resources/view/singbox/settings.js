'use strict';
'require form';
'require rpc';
'require uci';
'require view';

var callGenerateConfig = rpc.declare({
	object: 'luci.singbox',
	method: 'generateConfig',
	expect: { '': '' }
});

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('singbox'),
			callGenerateConfig()
		]);
	},

	render: function(data) {
		var configPreview = data[1] || '';
		var m, s, o;

		m = new form.Map('singbox', _('Sing-Box'),
			_('Advanced settings and configuration preview.'));

		// Inbound settings
		s = m.section(form.NamedSection, 'global', 'singbox', _('Inbound Settings'));
		s.anonymous = true;

		o = s.option(form.Value, 'mixed_port', _('Mixed Port'),
			_('HTTP and SOCKS5 mixed proxy port. Clients connect to this port.'));
		o.datatype = 'port';
		o.default = '2080';
		o.rmempty = false;

		o = s.option(form.Value, 'socks_port', _('SOCKS5 Port'),
			_('Dedicated SOCKS5 proxy port. Set 0 to disable.'));
		o.datatype = 'port';
		o.default = '1081';
		o.rmempty = true;

		o = s.option(form.Value, 'http_port', _('HTTP Port'),
			_('Dedicated HTTP proxy port. Set 0 to disable.'));
		o.datatype = 'port';
		o.default = '1082';
		o.rmempty = true;

		// TUN settings
		s = m.section(form.NamedSection, 'global', 'singbox', _('TUN Settings'));
		s.anonymous = true;

		o = s.option(form.Flag, 'tun_enabled', _('Enable TUN'),
			_('Enable TUN device for transparent proxy. Requires root privileges.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'tun_address', _('TUN Address'),
			_('TUN device address in CIDR notation.'));
		o.default = '172.19.0.1/30';
		o.depends('tun_enabled', '1');

		o = s.option(form.Flag, 'tun_auto_route', _('Auto Route'),
			_('Automatically configure routes for transparent proxy.'));
		o.default = o.enabled;
		o.depends('tun_enabled', '1');

		o = s.option(form.ListValue, 'tun_stack', _('Stack'));
		o.value('system', 'System');
		o.value('gvisor', 'gVisor');
		o.value('mixed', 'Mixed');
		o.default = 'system';
		o.depends('tun_enabled', '1');

		o = s.option(form.Flag, 'tun_strict_route', _('Strict Route'),
			_('Enable strict route to prevent routing loops.'));
		o.default = o.disabled;
		o.depends('tun_enabled', '1');

		// Clash API settings
		s = m.section(form.NamedSection, 'global', 'singbox', _('Clash API'));
		s.anonymous = true;

		o = s.option(form.Flag, 'clash_api_enabled', _('Enable Clash API'),
			_('Enable Clash-compatible RESTful API. Allows using yacd/metacubexd dashboard.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'clash_api_port', _('API Port'));
		o.datatype = 'port';
		o.default = '9090';
		o.depends('clash_api_enabled', '1');

		o = s.option(form.Value, 'clash_api_secret', _('API Secret'),
			_('Secret for API authentication. Leave empty for no auth.'));
		o.depends('clash_api_enabled', '1');
		o.rmempty = true;

		o = s.option(form.Value, 'external_controller', _('External Controller'),
			_('Address to serve the API. Default: 0.0.0.0:9090'));
		o.default = '0.0.0.0:9090';
		o.depends('clash_api_enabled', '1');

		// Log settings
		s = m.section(form.NamedSection, 'global', 'singbox', _('Log Settings'));
		s.anonymous = true;

		o = s.option(form.ListValue, 'log_level', _('Log Level'));
		o.value('trace', 'Trace');
		o.value('debug', 'Debug');
		o.value('info', 'Info');
		o.value('warn', 'Warn');
		o.value('error', 'Error');
		o.default = 'info';

		o = s.option(form.Value, 'log_output', _('Log Output'),
			_('Log file path. Leave empty for stdout only.'));
		o.default = '/tmp/singbox.log';
		o.rmempty = true;

		// Config preview
		s = m.section(form.NamedSection, 'global', 'singbox', _('Configuration Preview'));
		s.anonymous = true;

		o = s.option(form.DummyValue, '_config', _('Generated Config'));
		o.textvalue = function() {
			var formatted = '';
			try {
				formatted = JSON.stringify(JSON.parse(configPreview), null, 2);
			} catch (e) {
				formatted = configPreview;
			}
			return E('pre', {
				style: 'max-height:500px;overflow:auto;font-size:11px;background:#f5f5f5;padding:10px;border-radius:4px;'
			}, formatted || _('No configuration generated. Enable the service first.'));
		};

		return m.render();
	}
});
