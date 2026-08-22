'use strict';
'require dom';
'require fs';
'require poll';
'require rpc';
'require ui';
'require validation';
'require view';

var cachedData = [];
var tsHistory = [];
var tsMaxPoints = 120;
var luciConfig = '/etc/luci-hnatwrtmon.conf';
var hostNameFile = '/etc/wrtbwmon.user';
var columns = {
	thClient: _('Clients'),
	thMAC: _('MAC'),
	thDownload: _('Download'),
	thUpload: _('Upload'),
	thTotalDown: _('Total Down'),
	thTotalUp: _('Total Up'),
	thTotal: _('Total'),
	thFirstSeen: _('First Seen'),
	thLastSeen: _('Last Seen')
};

var callLuciDHCPLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} }
});

var callGetDatabaseRaw = rpc.declare({
	object: 'luci.hnatwrtmon',
	method: 'get_db_raw',
	params: [ 'protocol' ]
});

var callGetDatabasePath = rpc.declare({
	object: 'luci.hnatwrtmon',
	method: 'get_db_path',
	params: [ 'protocol' ]
});

var callRemoveDatabase = rpc.declare({
	object: 'luci.hnatwrtmon',
	method: 'remove_db',
	params: [ 'protocol' ]
});

var callGetFlows = rpc.declare({
	object: 'luci.hnatwrtmon',
	method: 'get_flows',
	params: [ 'mac' ]
});

function formatSize(size, useBits, useMultiple) {
	return String.format('%%%s.2m%s'.format(useMultiple, (useBits ? 'bit' : 'B')), useBits ? size * 8 : size);
}

function formatSpeed(speed, useBits, useMultiple) {
	return formatSize(speed, useBits, useMultiple) + '/s';
}

function formatDate(d) {
	var Y = d.getFullYear(), M = d.getMonth() + 1, D = d.getDate(),
	    hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
	return '%04d/%02d/%02d %02d:%02d:%02d'.format(Y, M, D, hh, mm, ss);
}

function drawChart(canvas, points, label, color, fillColor) {
	if (!canvas || points.length < 2) return;
	var dpr = window.devicePixelRatio || 1;
	var rect = canvas.getBoundingClientRect();
	var w = rect.width, h = rect.height;
	if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
	}
	var ctx = canvas.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	var pad = { top: 4, right: 6, bottom: 16, left: 45 };
	var pw = w - pad.left - pad.right;
	var ph = h - pad.top - pad.bottom;

	ctx.clearRect(0, 0, w, h);

	var max = 0;
	for (var i = 0; i < points.length; i++)
		if (points[i][1] > max) max = points[i][1];
	if (max === 0) max = 1;

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
		ctx.fillText(formatSpeed(max * (4 - i) / 4, false, '1000'), pad.left - 4, y + 3);
	}

	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	var stepX = pw / (tsMaxPoints - 1);
	for (var i = 0; i < points.length; i++) {
		var x = pad.left + stepX * i;
		var y = pad.top + ph - (points[i][1] / max * ph);
		if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.stroke();

	if (fillColor) {
		ctx.lineTo(pad.left + stepX * (points.length - 1), pad.top + ph);
		ctx.lineTo(pad.left, pad.top + ph);
		ctx.closePath();
		ctx.fillStyle = fillColor;
		ctx.fill();
	}

	ctx.fillStyle = '#888';
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(label, w / 2, h - 2);

	ctx.fillStyle = color;
	ctx.textAlign = 'right';
	ctx.font = '10px monospace';
	ctx.fillText(formatSpeed(points[points.length - 1][1], false, '1000'), w - pad.right, pad.top + 12);
}

function clickToResetDatabase(settings, table, updated, updating, ev) {
	if (confirm(_('This will delete the database file. Are you sure?'))) {
		return callRemoveDatabase(settings.protocol)
		.then(function() {
			updateData(settings, table, updated, updating, true);
		});
	}
}

function clickToSelectInterval(settings, updating, ev) {
	if (ev.target.value > 0) {
		settings.interval = parseInt(ev.target.value);
		if (!poll.active()) poll.start();
	}
	else {
		poll.stop();
		setUpdateMessage(updating, -1);
	}
}

function clickToSelectProtocol(settings, table, updated, updating, ev) {
	settings.protocol = ev.target.value;
	tsHistory = [];
	updateData(settings, table, updated, updating, true);
}

function displayTable(tb, settings) {
	var elm, elmID, col, sortedBy, flag, IPVer;

	elm = tb.querySelector('.th.sorted');
	elmID = elm ? elm.id : 'thTotal';
	sortedBy = elm && elm.classList.contains('ascent') ? 'asc' : 'desc';

	col = Object.keys(columns).indexOf(elmID);
	IPVer = col == 0 ? settings.protocol : null;
	flag = sortedBy == 'desc' ? 1 : -1;

	if (!cachedData || !cachedData[0]) return;
	cachedData[0].sort(sortTable.bind(this, col, IPVer, flag));

	updateTable(tb, cachedData, '<em>%s</em>'.format(_('Collecting data...')), settings);
	progressbar('downstream', cachedData[1][0], settings.downstream, settings.interval, settings.useBits, settings.useMultiple);
	progressbar('upstream', cachedData[1][1], settings.upstream, settings.interval, settings.useBits, settings.useMultiple);

	var dlCanvas = document.getElementById('tsChartDl');
	var ulCanvas = document.getElementById('tsChartUl');
	if (dlCanvas && tsHistory.length > 0) {
		var dlPoints = [], ulPoints = [];
		for (var i = 0; i < tsHistory.length; i++) {
			dlPoints.push([i, tsHistory[i].dl]);
			ulPoints.push([i, tsHistory[i].ul]);
		}
		if (dlPoints.length > tsMaxPoints) dlPoints = dlPoints.slice(-tsMaxPoints);
		if (ulPoints.length > tsMaxPoints) ulPoints = ulPoints.slice(-tsMaxPoints);
		drawChart(dlCanvas, dlPoints, _('Download Rate'), '#2196F3', 'rgba(33,150,243,0.1)');
		drawChart(ulCanvas, ulPoints, _('Upload Rate'), '#4CAF50', 'rgba(76,175,80,0.1)');
	}
}

function parseDatabase(raw, hosts, showZero, hideMACs, keepSeconds) {
	var values = [],
	    totals = [0, 0, 0, 0, 0],
	    rows = raw.trim().split(/\r?\n|\r/g),
	    rowIndex = [1, 0, 3, 4, 5, 6, 7, 8, 9, 0],
	    now = Math.floor(Date.now() / 1000);

	rows.shift();

	for (var i = 0; i < rows.length; i++) {
		var row = rows[i].split(',');
		if ((!showZero && row[7] == 0) || hideMACs.indexOf(row[0]) >= 0) continue;
		if (keepSeconds > 0 && now - parseInt(row[9]) > keepSeconds) continue;

		for (var j = 0; j < totals.length; j++) {
			totals[j] += parseInt(row[3 + j]);
		}

		var newRow = rowIndex.map(function(i) { return row[i] });
		if (newRow[1].toLowerCase() in hosts) {
			newRow[9] = hosts[newRow[1].toLowerCase()];
		}
		values.push(newRow);
	}

	return [values, totals];
}

function parseDefaultSettings(file) {
	var defaultColumns = ['thClient', 'thDownload', 'thUpload', 'thTotalDown', 'thTotalUp', 'thTotal'],
	    keylist = ['protocol', 'interval', 'showColumns', 'showZero', 'useBits', 'useMultiple', 'useDSL', 'upstream', 'downstream', 'hideMACs', 'keepMinutes'],
	    valuelist = ['ipv4', '5', defaultColumns, true, false, '1000', false, '100', '1000', [], '0'];

	return fs.read_direct(file, 'json').then(function(oldSettings) {
		var settings = {};
		for (var i = 0; i < keylist.length; i++) {
			if (!(keylist[i] in oldSettings))
				settings[keylist[i]] = valuelist[i];
			else
				settings[keylist[i]] = oldSettings[keylist[i]];
		}
		return settings;
	})
	.catch(function() { return {}; });
}

function progressbar(query, v, m, interval, useBits, useMultiple) {
	var pg = document.getElementById(query),
	    vn = (v * 8) || 0,
	    mn = (m || 100) * Math.pow(1000, 2) * Math.max(parseInt(interval) || 5, 1),
	    fv = formatSpeed(v / Math.max(parseInt(interval) || 5, 1), useBits, useMultiple),
	    pc = '%.2f'.format((100 / mn) * vn),
	    wt = Math.floor(pc > 100 ? 100 : pc),
	    bgc = (pc >= 95 ? 'red' : (pc >= 80 ? 'darkorange' : (pc >= 60 ? 'yellow' : 'lime')));
	if (pg) {
		pg.firstElementChild.style.width = wt + '%';
		pg.firstElementChild.style.background = bgc;
		pg.setAttribute('title', '%s (%f%%)'.format(fv, pc));
	}
}

function setUpdateMessage(e, sec) {
	e.innerHTML = sec < 0 ? '' : _('Updating again in %s second(s).').format('<b>' + sec + '</b>');
}

function resolveCustomizedHostName() {
	return fs.stat(hostNameFile).then(function() {
		return fs.read_direct(hostNameFile).then(function(raw) {
			var arr = raw.trim().split(/\r?\n/), hosts = {}, row;
			for (var i = 0; i < arr.length; i++) {
				row = arr[i].split(',');
				if (row.length == 2 && row[0])
					hosts[row[0].toLowerCase()] = row[1];
			}
			return hosts;
		})
	})
	.catch(function() { return {}; });
}

function resolveHostNameByMACAddr() {
	return Promise.all([
		resolveCustomizedHostName(),
		callLuciDHCPLeases()
	]).then(function(res) {
		var hosts = res[0];
		for (var key in res[1]) {
			var leases = Array.isArray(res[1][key]) ? res[1][key] : [];
			for (var i = 0; i < leases.length; i++) {
				if(leases[i].macaddr) {
					var macaddr = leases[i].macaddr.toLowerCase();
					if (!(macaddr in hosts) && Boolean(leases[i].hostname))
						hosts[macaddr] = leases[i].hostname;
				}
			}
		}
		return hosts;
	});
}

function setSortedColumn(sorting) {
	var sorted = document.querySelector('.th.sorted') || document.getElementById('thTotal');

	if (sorting.isSameNode(sorted)) {
		sorting.classList.toggle('ascent');
	}
	else {
		sorting.classList.add('sorted');
		sorted.classList.remove('sorted', 'ascent');
	}
}

function sortTable(col, IPVer, flag, x, y) {
	var a = x[col], b = y[col];

	if (!IPVer || col != 0) {
		if (!(a.match(/\D/g) || b.match(/\D/g)))
			a = parseInt(a), b = parseInt(b);
	}
	else {
		IPVer == 'ipv4'
		? (a = validation.parseIPv4(a) || [0, 0, 0, 0], b = validation.parseIPv4(b) || [0, 0, 0, 0])
		: (a = validation.parseIPv6(a) || [0, 0, 0, 0, 0, 0, 0, 0], b = validation.parseIPv6(b) || [0, 0, 0, 0, 0, 0, 0, 0]);
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		for (var i = 0; i < a.length; i++) {
			if (a[i] != b[i]) {
				return (b[i] - a[i]) * flag;
			}
		}
		return 0;
	}

	return a == b ? 0 : (a < b ? 1 : -1) * flag;
}

function updateData(settings, table, updated, updating, once) {
	var tick = poll.tick,
	    interval = settings.interval,
	    sec = (interval - tick % interval) % interval;
	if (!sec || once) {
		callGetDatabasePath()
		.then(function(res) {
			var params = settings.protocol == 'ipv4' ? '-4' : '-6';
			var file = settings.protocol == 'ipv4' ? res.file_4 : res.file_6;
			return fs.exec_direct('/usr/sbin/wrtbwmon', [params, '-f', file])
		})
		.then(function() {
			return Promise.all([
				callGetDatabaseRaw(settings.protocol),
				resolveHostNameByMACAddr()
			]);
		})
		.then(function(res) {
			cachedData = parseDatabase(res[0].data || '', res[1], settings.showZero, settings.hideMACs, parseInt(settings.keepMinutes || 0) * 60);
			displayTable(table, settings);
			updated.textContent = _('Last updated at %s.').format(formatDate(new Date()));

			tsHistory.push({ ts: Date.now(), dl: cachedData[1][0] || 0, ul: cachedData[1][1] || 0 });
			if (tsHistory.length > tsMaxPoints) tsHistory = tsHistory.slice(-tsMaxPoints);
		});
	}

	setUpdateMessage(updating, sec);
	if (!sec)
		setTimeout(setUpdateMessage.bind(this, updating, interval), 100);
}

function updateTable(tb, values, placeholder, settings) {
	var fragment = document.createDocumentFragment(), nodeLen = tb.childElementCount - 2;
	var formData = values[0], tbTitle = tb.firstElementChild, newNode, childTD;

	for (var i = 0; i < formData.length; i++) {
		if (i < nodeLen) {
			newNode = tbTitle.nextElementSibling;
		}
		else {
			if (nodeLen > 0) {
				newNode = fragment.firstChild.cloneNode(true);
			}
			else {
				newNode = document.createElement('tr');
				childTD = document.createElement('td');
				for (var j = 0; j < tbTitle.children.length; j++) {
					childTD.className = 'td' + (settings.showColumns.indexOf(tbTitle.children[j].id) >= 0 ? '' : ' hide');
					childTD.setAttribute('data-title', tbTitle.children[j].textContent);
					newNode.appendChild(childTD.cloneNode(true));
				}
			}
			newNode.className = 'tr cbi-rowstyle-%d'.format(i % 2 ? 2 : 1);
		}

		childTD = newNode.firstElementChild;
		childTD.title = formData[i].slice(-1);
		for (var j = 0; j < tbTitle.childElementCount; j++, childTD = childTD.nextElementSibling) {
			switch (j) {
				case 2:
				case 3:
					childTD.textContent = formatSpeed(formData[i][j], settings.useBits, settings.useMultiple);
					break;
				case 4:
				case 5:
				case 6:
					childTD.textContent = formatSize(formData[i][j], settings.useBits, settings.useMultiple);
					break;
				case 7:
				case 8:
					childTD.textContent = formatDate(new Date(formData[i][j] * 1000));
					break;
				default:
					childTD.textContent = formData[i][j];
			}
		}
		fragment.appendChild(newNode);
		(function(mac, host, s) {
			newNode.style.cursor = 'pointer';
			newNode.addEventListener('click', function() { showFlowsForClient(s, mac, host); });
		})(formData[i][1], formData[i][9] || formData[i][1], settings);
	}

	while (tb.childElementCount > 1) {
		tb.removeChild(tbTitle.nextElementSibling);
	}

	if (formData.length == 0) {
		newNode = document.createElement('tr');
		newNode.className = 'tr placeholder';
		childTD = document.createElement('td');
		childTD.className = 'td';
		childTD.innerHTML = placeholder;
		newNode.appendChild(childTD);
	}
	else{
		newNode = fragment.firstChild.cloneNode(true);
		newNode.className = 'tr table-totals';

		newNode.children[0].textContent = _('TOTAL') + (settings.showColumns.indexOf('thMAC') >= 0 ? '' : ': ' + formData.length);
		newNode.children[1].textContent = formData.length + ' ' + _('Clients');

		for (var j = 0; j < tbTitle.childElementCount; j++) {
			switch(j) {
				case 0:
				case 1:
					newNode.children[j].removeAttribute('title');
					newNode.children[j].style.fontWeight = 'bold';
					break;
				case 2:
				case 3:
					newNode.children[j].textContent = formatSpeed(values[1][j - 2], settings.useBits, settings.useMultiple);
					break;
				case 4:
				case 5:
				case 6:
					newNode.children[j].textContent = formatSize(values[1][j - 2], settings.useBits, settings.useMultiple);
					break;
				default:
					newNode.children[j].textContent = '';
					newNode.children[j].removeAttribute('data-title');
			}
		}
	}

	fragment.appendChild(newNode);
	tb.appendChild(fragment);
}

function initOption(options, selected) {
	var res = [], attr = {};
	for (var idx in options) {
		attr.value = idx;
		attr.selected = idx == selected ? '' : null;
		res.push(E('option', attr, options[idx]));
	}
	return res;
}

function clickToSaveConfig(keylist, cstrs) {
	var data = {};
	for (var i = 0; i < keylist.length; i++) {
		data[keylist[i]] = cstrs[keylist[i]].getValue();
	}
	ui.showModal(_('Configuration'), [
		E('p', { 'class': 'spinning' }, _('Saving configuration data...'))
	]);

	return fs.write(luciConfig, JSON.stringify(data, undefined, '\t') + '\n')
	.catch(function(err) {
		ui.addNotification(null, E('p', {}, [ _('Unable to save %s: %s').format(luciConfig, err) ]));
	})
	.then(ui.hideModal)
	.then(function() { document.location.reload(); });
}

function showFlowsForClient(settings, mac, hostname) {
	var protoNames = { 1: 'ICMP', 2: 'IGMP', 6: 'TCP', 17: 'UDP', 47: 'GRE', 50: 'ESP', 58: 'ICMPv6' };

	ui.showModal(_('Connection Details'), [
		E('p', { 'class': 'spinning' }, _('Loading flow data...'))
	]);

	callGetFlows(mac).then(function(res) {
		var flows = res.flows || [];
		var rows = [];

		for (var i = 0; i < flows.length; i++) {
			var f = flows[i];
			rows.push(E('tr', { 'class': 'cbi-rowstyle-%d'.format(i % 2 ? 2 : 1) }, [
				E('td', {}, protoNames[f.proto] || f.proto),
				E('td', {}, '%s:%d'.format(f.sip, f.sport)),
				E('td', {}, '%s:%d'.format(f.dip, f.dport)),
				E('td', {}, formatSize(f.bytes, settings.useBits, settings.useMultiple)),
				E('td', {}, f.direction == 'down' ? '\u2193' : '\u2191')
			]));
		}

		var body = [
			E('p', {}, _('Client: %s').format(hostname)),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Protocol')),
					E('th', { 'class': 'th' }, _('Source')),
					E('th', { 'class': 'th' }, _('Destination')),
					E('th', { 'class': 'th' }, _('Bytes')),
					E('th', { 'class': 'th' }, _('Direction'))
				])
			].concat(flows.length ? rows : [
				E('tr', { 'class': 'tr placeholder' }, [
					E('td', { 'class': 'td', 'colspan': 5 }, E('em', {}, _('No active flows found.')))
				])
			])),
			E('div', { 'class': 'right' }, [
				E('div', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, _('Close'))
			])
		];

		ui.showModal(_('Connection Details'), body);
	}).catch(function(err) {
		ui.showModal(_('Error'), [
			E('p', {}, _('Failed to load flow data: %s').format(err.message || err)),
			E('div', { 'class': 'right' }, [
				E('div', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, _('Close'))
			])
		]);
	});
}

function handleConfig(ev) {
	ui.showModal(_('Configuration'), [
			E('p', { 'class': 'spinning' }, _('Loading configuration data...'))
	]);

	parseDefaultSettings(luciConfig)
	.then(function(settings) {
		var arglist, keylist = Object.keys(settings), res, cstrs = {}, node = [];

		arglist = [
			[ui.Select, _('Default Protocol'), {'ipv4': _('ipv4'), 'ipv6': _('ipv6')}, {}, ''],
			[ui.Select, _('Default Refresh Interval'), {'-1': _('Disabled'), '3': _('3 seconds'), '5': _('5 seconds'), '10': _('10 seconds'), '30': _('30 seconds')}, {sort: ['-1', '3', '5', '10', '30']}, ''],
			[ui.Dropdown, _('Default Columns'), columns, {multiple: true, sort: false, custom_placeholder: '', dropdown_items: 3}, ''],
			[ui.Checkbox, _('Show Zeros'), {value_enabled: true, value_disabled: false}, ''],
			[ui.Checkbox, _('Transfer Speed in Bits'), {value_enabled: true, value_disabled: false}, ''],
			[ui.Select, _('Multiple of Unit'), {'1000': _('SI - 1000'), '1024': _('IEC - 1024')}, {}, ''],
			[ui.Checkbox, _('Use DSL Bandwidth'), {value_enabled: true, value_disabled: false}, ''],
			[ui.Textfield, _('Upstream Bandwidth'), {datatype: 'ufloat'}, _('Mbit/s')],
			[ui.Textfield, _('Downstream Bandwidth'), {datatype: 'ufloat'}, _('Mbit/s')],
			[ui.DynamicList, _('Hide MAC Addresses'), '', {datatype: 'macaddr'}, ''],
			[ui.Select, _('Keep Inactive Clients'), { '0': _('Forever'), '1': _('1 minute'), '3': _('3 minutes'), '5': _('5 minutes'), '10': _('10 minutes'), '15': _('15 minutes'), '30': _('30 minutes') }, {sort: ['0', '1', '3', '5', '10', '15', '30']}, '']
		];

		for (var i = 0; i < keylist.length; i++) {
			res = (function(args, val) {
				var widget = args.length == 4 ? new args[0](val, args[2]) : new args[0](val, args[2], args[3]);
				var frame = E('div', {'class': 'cbi-value'}, [
					E('label', {'class': 'cbi-value-title'}, args[1]),
					E('div', {'class': 'cbi-value-field'}, E('div', {}, widget.render()))
				]);
				return [widget, frame];
			})(arglist[i], settings[keylist[i]]);
			cstrs[keylist[i]] = res[0];
			node.push(res[1]);
		}

		var body = [
			E('p', {}, _('Configure the default values for luci-app-hnatwrtmon.')),
			E('div', {}, node),
			E('div', { 'class': 'right' }, [
				E('div', {
					'class': 'btn cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('div', {
					'class': 'btn cbi-button-positive',
					'click': clickToSaveConfig.bind(this, keylist, cstrs),
					'disabled': (L.hasViewPermission ? !L.hasViewPermission() : null) || null
				}, _('Save'))
			])
		];
		ui.showModal(_('Configuration'), body);
	})
}

function setupThisDOM(settings, table) {
	var onPollStop = function() {
		document.getElementById('selectInterval').value = -1;
	};
	var onPollStart = function() {
		document.getElementById('selectInterval').value = settings.interval;
	};
	document.removeEventListener('poll-stop', onPollStop);
	document.removeEventListener('poll-start', onPollStart);
	document.addEventListener('poll-stop', onPollStop);
	document.addEventListener('poll-start', onPollStart);

	table.querySelectorAll('.th').forEach(function(e) {
		if (e) {
			e.addEventListener('click', function (ev) {
				setSortedColumn(ev.target);
				displayTable(table, settings);
			});

			if (settings.showColumns.indexOf(e.id) >= 0)
				e.classList.remove('hide');
			else
				e.classList.add('hide');
		}
	});
}

function loadCss(path) {
	if (document.querySelector('link[href="' + path + '"]')) return;
	var head = document.head || document.getElementsByTagName('head')[0];
	var link = E('link', {
		'rel': 'stylesheet',
		'href': path,
		'type': 'text/css'
	});
	head.appendChild(link);
}

return view.extend({
	load: function() {
		return Promise.all([
			parseDefaultSettings(luciConfig),
			loadCss(L.resource('view/hnatwrtmon/hnatwrtmon.css'))
		]);
	},

	render: function(data) {
		var settings = data[0],
		    labelUpdated = E('label'),
		    labelUpdating = E('label'),
		    table = E('table', { 'class': 'table', 'id': 'traffic' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th', 'id': 'thClient' }, _('Clients')),
					E('th', { 'class': 'th hide', 'id': 'thMAC' }, _('MAC')),
					E('th', { 'class': 'th', 'id': 'thDownload' }, _('Download')),
					E('th', { 'class': 'th', 'id': 'thUpload' }, _('Upload')),
					E('th', { 'class': 'th', 'id': 'thTotalDown' }, _('Total Down')),
					E('th', { 'class': 'th', 'id': 'thTotalUp' }, _('Total Up')),
					E('th', { 'class': 'th sorted', 'id': 'thTotal' }, _('Total')),
					E('th', { 'class': 'th hide', 'id': 'thFirstSeen' }, _('First Seen')),
					E('th', { 'class': 'th hide', 'id': 'thLastSeen' }, _('Last Seen'))
				]),
				E('tr', {'class': 'tr placeholder'}, [
					E('td', { 'class': 'td' }, E('em', {}, _('Collecting data...')))
				])
			]);

		poll.add(updateData.bind(this, settings, table, labelUpdated, labelUpdating, false), 1);
		setupThisDOM(settings, table);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('HNAT Traffic Monitor')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Bandwidth Chart')),
				E('div', { 'class': 'chart-stack' }, [
					E('div', { 'class': 'chart-container-lg' }, [
						E('canvas', { 'id': 'tsChartDl', 'width': '640', 'height': '100' })
					]),
					E('div', { 'class': 'chart-container-lg' }, [
						E('canvas', { 'id': 'tsChartUl', 'width': '640', 'height': '100' })
					])
				]),
				E('div', { 'id': 'progressbar_panel' }, [
					E('div', {}, [
						E('label', {},  _('Downstream:')),
						E('div', {
							'id': 'downstream',
							'class': 'cbi-progressbar',
							'title': '-'
							}, E('div')
						)
					]),
					E('div', {}, [
						E('label', {}, _('Upstream:')),
						E('div', {
							'id': 'upstream',
							'class': 'cbi-progressbar',
							'title': '-'
							}, E('div')
						)
					]),
				]),
				E('hr'),
				E('h3', {}, _('Device Details')),
				E('div', { 'id': 'control_panel' }, [
					E('div', {}, [
						E('label', {}, _('Protocol:')),
						E('select', {
							'id': 'selectProtocol',
							'change': clickToSelectProtocol.bind(this, settings, table, labelUpdated, labelUpdating)
							}, initOption({
								'ipv4': 'ipv4',
								'ipv6': 'ipv6'
								}, settings.protocol))
					]),
					E('div', {}, [
						E('button', {
							'class': 'btn cbi-button cbi-button-reset important',
							'id': 'resetDatabase',
							'click': clickToResetDatabase.bind(this, settings, table, labelUpdated, labelUpdating)
						}, _('Reset Database')),
						' ',
						E('button', {
							'class': 'btn cbi-button cbi-button-neutral',
							'click': handleConfig
						}, _('Configure Options'))
					])
				]),
				E('div', {}, [
					E('div', {}, [ labelUpdated, labelUpdating ]),
					E('div', {}, [
						E('label', { 'for': 'selectInterval' }, _('Auto update every:')),
						E('select', {
							'id': 'selectInterval',
							'change': clickToSelectInterval.bind(this, settings, labelUpdating)
							}, initOption({
								'-1': _('Disabled'),
								'3': _('3 seconds'),
								'5': _('5 seconds'),
								'10': _('10 seconds'),
								'30': _('30 seconds')
								}, settings.interval))
					])
				]),
				table
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
