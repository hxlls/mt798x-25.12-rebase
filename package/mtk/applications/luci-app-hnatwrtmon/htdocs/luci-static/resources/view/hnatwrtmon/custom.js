'use strict';
'require fs';
'require ui';
'require view';

var hostNameFile = '/etc/wrtbwmon.user';

return view.extend({
	load: function() {
		return fs.read_direct(hostNameFile).then(function(raw) {
			return raw || '';
		}).catch(function() { return ''; });
	},

	render: function(data) {
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Usage - Custom User File')),
			E('p', {}, _('Each line must have the following format:') + ' MAC,hostname'),
			E('textarea', { 'id': 'hostnames', 'style': 'width:100%;height:300px' }, data || ''),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn cbi-button-positive', 'click': function() {
					return fs.write(hostNameFile, document.getElementById('hostnames').value)
						.catch(function(err) {
							ui.addNotification(null, E('p', {}, [ _('Unable to load the customized hostname file: %s').format(err) ]));
						});
				} }, _('Save'))
			])
		]);
	}
});
