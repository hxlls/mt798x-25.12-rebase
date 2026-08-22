'use strict';
'require dom';
'require rpc';
'require ui';
'require view';

var callGetAggregated = rpc.declare({
	object: 'luci.hnatwrtmon',
	method: 'get_aggregated',
	params: ['granularity']
});

var callGetTopClients = rpc.declare({
	object: 'luci.hnatwrtmon',
	method: 'get_top_clients',
	params: ['date', 'limit']
});

function formatSize(size) {
	if (size > 1073741824) return '%.2f GB'.format(size / 1073741824);
	if (size > 1048576) return '%.2f MB'.format(size / 1048576);
	if (size > 1024) return '%.2f KB'.format(size / 1024);
	return size + ' B';
}

function formatDateStr(dateStr) {
	if (dateStr.indexOf(' ') > 0) {
		var parts = dateStr.split(' ');
		var d = parts[0].split('-');
		return '%s/%s/%s %s'.format(d[0], d[1], d[2], parts[1]);
	}
	var parts = dateStr.split('-');
	return '%s/%s/%s'.format(parts[0], parts[1], parts[2]);
}

function drawTrendChart(canvas, data, title) {
	if (!canvas || !data || data.length === 0) return;
	var dpr = window.devicePixelRatio || 1;
	var rect = canvas.getBoundingClientRect();
	var w = rect.width, h = rect.height;
	if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
	}
	var ctx = canvas.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	var pad = { top: 10, right: 10, bottom: 60, left: 60 };
	var pw = w - pad.left - pad.right;
	var ph = h - pad.top - pad.bottom;

	ctx.clearRect(0, 0, w, h);

	var maxVal = 0;
	for (var i = 0; i < data.length; i++) {
		var v = data[i].download + data[i].upload;
		if (v > maxVal) maxVal = v;
	}
	if (maxVal === 0) maxVal = 1;

	ctx.strokeStyle = '#ccc';
	ctx.lineWidth = 0.5;
	for (var i = 0; i <= 4; i++) {
		var y = pad.top + ph * i / 4;
		ctx.beginPath();
		ctx.moveTo(pad.left, y);
		ctx.lineTo(w - pad.right, y);
		ctx.stroke();
		ctx.fillStyle = '#666';
		ctx.font = '9px monospace';
		ctx.textAlign = 'right';
		ctx.fillText(formatSize(maxVal * (4 - i) / 4), pad.left - 4, y + 3);
	}

	var barW = pw / data.length * 0.7;
	var gap = pw / data.length * 0.3;

	for (var i = 0; i < data.length; i++) {
		var dlH = data[i].download / maxVal * ph;
		var ulH = data[i].upload / maxVal * ph;
		var x = pad.left + i * (barW + gap) + gap / 2;

		ctx.fillStyle = '#2196F3';
		ctx.fillRect(x, pad.top + ph - dlH - ulH, barW, dlH);

		ctx.fillStyle = '#4CAF50';
		ctx.fillRect(x, pad.top + ph - ulH, barW, ulH);

		if (data.length <= 31) {
			ctx.fillStyle = '#444';
			ctx.font = '8px sans-serif';
			ctx.textAlign = 'center';
			ctx.save();
			ctx.translate(x + barW / 2, h - pad.bottom + 8);
			ctx.rotate(-Math.PI / 3);
			var dateLabel = data[i].date.indexOf(' ') > 0 ? data[i].date.split(' ')[1] : data[i].date.slice(5);
			ctx.fillText(dateLabel, 0, 0);
			ctx.restore();
		}
	}

	ctx.fillStyle = '#888';
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(title, w / 2, h - 2);

	var legendY = pad.top + 4;
	ctx.fillStyle = '#2196F3';
	ctx.fillRect(pad.left, legendY, 12, 12);
	ctx.fillStyle = '#333';
	ctx.font = '11px sans-serif';
	ctx.textAlign = 'left';
	ctx.fillText('Download', pad.left + 16, legendY + 10);
	ctx.fillStyle = '#4CAF50';
	ctx.fillRect(pad.left + 80, legendY, 12, 12);
	ctx.fillStyle = '#333';
	ctx.fillText('Upload', pad.left + 96, legendY + 10);
}

function loadPage(granularity) {
	var canvas = document.getElementById('trendChart');
	var tableBody = document.getElementById('dailyTableBody');
	var topBody = document.getElementById('topClientsBody');

	if (tableBody) tableBody.innerHTML = '<tr><td colspan="5"><em>%s</em></td></tr>'.format(_('Loading...'));
	if (topBody) topBody.innerHTML = '<tr><td colspan="4"><em>%s</em></td></tr>'.format(_('Loading...'));

	var tabs = document.querySelectorAll('.tab-btn');
	for (var i = 0; i < tabs.length; i++) {
		tabs[i].style.fontWeight = tabs[i].getAttribute('data-granularity') === granularity ? 'bold' : 'normal';
		tabs[i].style.color = tabs[i].getAttribute('data-granularity') === granularity ? '#2196F3' : '#666';
	}

	callGetAggregated(granularity).then(function(res) {
		var data = res.data || [];
		if (canvas) drawTrendChart(canvas, data, granularity === 'hourly' ? _('Cumulative Total by Hour') : granularity === 'daily' ? _('Cumulative Total by Day') : granularity === 'weekly' ? _('Cumulative Total by Week') : _('Cumulative Total by Month'));

		if (tableBody) {
			if (data.length === 0) {
				tableBody.innerHTML = '<tr><td colspan="5"><em>%s</em></td></tr>'.format(_('No historical data available.'));
			} else {
				var html = '';
				for (var i = 0; i < data.length; i++) {
					html += '<tr class="cbi-rowstyle-%d">'.format(i % 2 ? 2 : 1);
					html += '<td>%s</td>'.format(formatDateStr(data[i].date));
					html += '<td>%s</td>'.format(formatSize(data[i].download));
					html += '<td>%s</td>'.format(formatSize(data[i].upload));
					html += '<td>%s</td>'.format(formatSize((data[i].download || 0) + (data[i].upload || 0)));
					html += '<td>%d</td></tr>'.format(data[i].clients);
				}
				tableBody.innerHTML = html;
			}
		}

		var latestDate = (data.length > 0 && data[0] && data[0].date) ? data[0].date : '';
		var topDate = latestDate.indexOf(' ') > 0 ? latestDate.split(' ')[0] : latestDate;
		if (topDate) {
			callGetTopClients(topDate, 10).then(function(r) {
				var clients = r.clients || [];
				if (topBody) {
					if (clients.length === 0) {
						topBody.innerHTML = '<tr><td colspan="4"><em>%s</em></td></tr>'.format(_('No data'));
					} else {
						var topH = '';
						for (var i = 0; i < clients.length; i++) {
							topH += '<tr class="cbi-rowstyle-%d">'.format(i % 2 ? 2 : 1);
							topH += '<td>%s</td>'.format(clients[i].hostname !== '-' ? clients[i].hostname : clients[i].mac);
							topH += '<td>%s</td>'.format(formatSize(clients[i].download));
							topH += '<td>%s</td>'.format(formatSize(clients[i].upload));
							topH += '<td>%s</td></tr>'.format(formatSize(clients[i].total));
						}
						topBody.innerHTML = topH;
					}
				}
			}).catch(function() {
				if (topBody) topBody.innerHTML = '<tr><td colspan="4"><em>%s</em></td></tr>'.format(_('No data'));
			});
		} else if (topBody) {
			topBody.innerHTML = '<tr><td colspan="4"><em>%s</em></td></tr>'.format(_('No data'));
		}
	}).catch(function(err) {
		if (tableBody) tableBody.innerHTML = '<tr><td colspan="5"><em>%s</em></td></tr>'.format(_('Failed to load data.'));
		if (topBody) topBody.innerHTML = '<tr><td colspan="4"><em>%s</em></td></tr>'.format(_('No data'));
	});
}

return view.extend({
	load: function() {
		return Promise.resolve();
	},

	render: function() {
		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Historical Traffic Statistics')),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'tab-bar', 'style': 'margin:10px 0' }, [
					E('button', { 'class': 'btn tab-btn', 'data-granularity': 'hourly',
						'click': function() { loadPage('hourly'); } }, _('Hourly')),
					' ',
					E('button', { 'class': 'btn tab-btn', 'data-granularity': 'daily',
						'click': function() { loadPage('daily'); } }, _('Daily')),
					' ',
					E('button', { 'class': 'btn tab-btn', 'data-granularity': 'weekly',
						'click': function() { loadPage('weekly'); } }, _('Weekly')),
					' ',
					E('button', { 'class': 'btn tab-btn', 'data-granularity': 'monthly',
						'click': function() { loadPage('monthly'); } }, _('Monthly'))
				]),
				E('h3', {}, _('Traffic Trend')),
				E('div', { 'class': 'chart-container', 'style': 'width:100%' }, [
					E('canvas', { 'id': 'trendChart', 'width': '760', 'height': '280' })
				]),
				E('div', { 'class': 'history-grid' }, [
					E('div', { 'class': 'history-col' }, [
						E('h3', {}, _('Daily Breakdown')),
						E('table', { 'class': 'table' }, [
							E('tr', { 'class': 'tr table-titles' }, [
								E('th', { 'class': 'th' }, _('Date')),
								E('th', { 'class': 'th' }, _('Download')),
								E('th', { 'class': 'th' }, _('Upload')),
								E('th', { 'class': 'th' }, _('Total')),
								E('th', { 'class': 'th' }, _('Clients'))
							]),
							E('tbody', { 'id': 'dailyTableBody' }, [
								E('tr', {}, [ E('td', { 'colspan': '5' }, E('em', {}, _('Loading...'))) ])
							])
						])
					]),
					E('div', { 'class': 'history-col' }, [
						E('h3', {}, _('Top Devices')),
						E('table', { 'class': 'table' }, [
							E('tr', { 'class': 'tr table-titles' }, [
								E('th', { 'class': 'th' }, _('Client')),
								E('th', { 'class': 'th' }, _('Download')),
								E('th', { 'class': 'th' }, _('Upload')),
								E('th', { 'class': 'th' }, _('Total'))
							]),
							E('tbody', { 'id': 'topClientsBody' }, [
								E('tr', {}, [ E('td', { 'colspan': '4' }, E('em', {}, _('Loading...'))) ])
							])
						])
					])
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	addFooter: function() {
		var attempts = 0;
		var tryLoad = function() {
			if (document.getElementById('trendChart')) {
				loadPage('daily');
			} else if (attempts < 10) {
				attempts++;
				setTimeout(tryLoad, 200);
			}
		};
		setTimeout(tryLoad, 200);
	}
});
