/* SPDX-License-Identifier: GPL-3.0-only */
/* Fullcone NAT control page, part of luci-app-turboacc-mtk */

'use strict';
'require form';
'require uci';
'require view';

return view.extend({
	load: function() {
		return uci.load('firewall');
	},

	render: function() {
		let m, s, o;

		m = new form.Map('firewall', _('Fullcone NAT'),
			_('Endpoint-independent mapping and filtering for masqueraded traffic. The kernel keeps a second hash table inside conntrack, keyed by the translated 3-tuple (protocol, source address, source port), so peers can reach a client from an address it never contacted.'));

		/* ---- global gates ---- */
		s = m.section(form.TypedSection, 'defaults', _('Global switches'),
			_('These are master gates. With a gate off, no zone gets fullcone regardless of its own setting.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'fullcone', _('Fullcone NAT (IPv4)'),
			_('Master gate for IPv4 fullcone.'));
		o.default = '0';
		o.rmempty = true;

		o = s.option(form.Flag, 'fullcone6', _('Fullcone NAT (IPv6)'),
			_('Master gate for IPv6. Most IPv6 setups do not need fullcone.'));
		o.default = '0';
		o.rmempty = true;

		/* ---- per-zone control table ---- */
		s = m.section(form.GridSection, 'zone', _('Per-zone control'),
			_('Fullcone only takes effect on zones that masquerade IPv4 traffic, normally just the wan zone.'));
		s.anonymous = true;
		s.addremove = false;
		s.sortable = false;

		o = s.option(form.DummyValue, 'name', _('Zone'));
		o.cfgvalue = function(section_id) {
			return uci.get('firewall', section_id, 'name') || section_id;
		};

		o = s.option(form.DummyValue, 'masq', _('IPv4 masquerading'));
		o.cfgvalue = function(section_id) {
			return uci.get('firewall', section_id, 'masq') == '1' ? _('enabled') : _('disabled');
		};

		o = s.option(form.Flag, 'fullcone', _('Fullcone NAT'),
			_('Enable fullcone for this zone. Uncheck to keep plain masquerading here.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.MultiValue, 'fullcone_proto', _('Protocols'),
			_('Restrict fullcone to the selected L4 protocols; every other protocol keeps plain masquerading. Leave empty to apply fullcone to all protocols.'));
		o.value('udp', _('UDP'));
		o.value('tcp', _('TCP'));
		o.value('udplite', _('UDP-Lite'));
		o.value('sctp', _('SCTP'));
		o.value('dccp', _('DCCP'));
		o.optional = true;

		return m.render();
	}
});
