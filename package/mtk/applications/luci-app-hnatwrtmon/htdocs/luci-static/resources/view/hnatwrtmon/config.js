'use strict';
'require view';

return view.extend({
	render: function() {
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Configuration')),
			E('p', {}, _('Configure the default values for luci-app-hnatwrtmon.'))
		]);
	}
});
