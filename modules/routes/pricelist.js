const express = require('express');
const path = require('path');
const { loadJson } = require('../utils');
const renderPage = require('../layout');

module.exports = function (app, config) {
	const router = express.Router();

	const CONFIG_PATH = path.resolve(__dirname, '../../pricerConfig.json');
	const thresholdSec = config.ageThresholdSec;

	const pricelistPath = path.resolve(__dirname, '../../files/pricelist.json');
	const sellingPricelistPath = path.resolve(__dirname, config.tf2AutobotDir, config.botTradingDir, 'pricelist.json');
	const itemListPath = path.resolve(__dirname, '../../files/item_list.json');

	function buildTable(items, showAge) {
	  items.sort((a, b) => a.name.localeCompare(b.name));
	  let tbl = '<table><thead><tr>' +
		'<th>Name</th><th>SKU</th><th>Last Updated</th>' +
		(showAge ? '<th>Age (h)</th>' : '') +
		'<th>Buy</th><th>Sell</th><th>In Bot</th><th>Action</th>' +
		'</tr></thead><tbody>';

	  items.forEach(item => {
		const last = new Date(item.time * 1000).toLocaleString();
		const ageH = (item.age / 3600).toFixed(2);
		const buyUnit = item.buy.keys === 1 ? 'Key' : 'Keys';
		const sellUnit = item.sell.keys === 1 ? 'Key' : 'Keys';
		const inBot = item.inSelling;
		const sku = item.sku;
		const actionBtn = inBot
		  ? `<button onclick="queueAction('remove','${sku}')">❌</button>`
		  : `<button onclick="queueAction('add','${sku}')">✅</button>`;

		const rowClass = showAge
		  ? (item.age > 2 * 24 * 3600 ? 'outdated-2d' : item.age > 24 * 3600 ? 'outdated-1d' : 'outdated-2h')
		  : 'current-row';

		tbl += `<tr class="${rowClass}" data-age="${item.age}" data-inbot="${inBot}">` +
		  `<td class="name">${item.name}</td>` +
		  `<td class="sku">${sku}</td>` +
		  `<td>${last}</td>` +
		  (showAge ? `<td>${ageH}</td>` : '') +
		  `<td>${item.buy.keys} ${buyUnit} & ${item.buy.metal} Refined</td>` +
		  `<td>${item.sell.keys} ${sellUnit} & ${item.sell.metal} Refined</td>` +
		  `<td>${inBot ? '✓' : '✗'}</td>` +
		  `<td>${actionBtn}</td></tr>`;
	  });
	  return tbl + '</tbody></table>';
	}

	function buildMissingTable(names) {
	  names.sort();
	  let tbl = '<table><thead><tr><th>Name</th><th>Action</th></tr></thead><tbody>';
	  names.forEach(name => {
		tbl += `<tr data-age="0" data-inbot="false">` +
		  `<td class="name">${name}</td>` +
		  `<td><button onclick="queueAction('addName', '${encodeURIComponent(name)}')">✅</button></td>` +
		  `</tr>`;
	  });
	  return tbl + '</tbody></table>';
	}

	function loadData() {
	  const main = loadJson(pricelistPath);
	  const sell = loadJson(sellingPricelistPath);
	  const itemList = loadJson(itemListPath).items.map(i => i.name);
	  const now = Math.floor(Date.now() / 1000);
	  const outdated = [], current = [], priced = new Set();

	  main.items.forEach(item => {
		const age = now - item.time;
		const inSelling = Boolean(sell[item.sku]);
		priced.add(item.name);
		const annotated = { ...item, age, inSelling };
		(age > thresholdSec ? outdated : current).push(annotated);
	  });

	  const missing = itemList.filter(n => !priced.has(n));
	  return { outdated, current, missing };
	}

	router.get('/', (req, res) => {
	  const { outdated, current, missing } = loadData();
	  const html = `
		<div class="controls">
		  <input type="text" id="search" placeholder="Search...">
		  <label><input type="checkbox" class="filter" id="filter-notinbot"> Not In Bot</label>
		  <label><input type="checkbox" class="filter" id="filter-2h"> Age ≥2h</label>
		  <label><input type="checkbox" class="filter" id="filter-1d"> Age ≥24h</label>
		  <label><input type="checkbox" class="filter" id="filter-3d"> Age ≥72h</label>
		</div>
		<div id="add-item-section">
		  <h2 id="add-form">Add New Item to item_list.json</h2>
		  <form method="POST" action="/add-item">
			<input type="text" name="name" placeholder="New item name..." required>
			<button type="submit">Add</button>
		  </form>
		</div>
		<div id="queue-panel">
		  <h3>Pending Actions</h3>
		  <ul id="queue-list"></ul>
		  <button onclick="applyQueue()">Apply & Restart</button>
		</div>
		<h1>Outdated Items (≥2h): ${outdated.length}</h1><div>${buildTable(outdated, true)}</div>
		<h1>Current Items: ${current.length}</h1><div>${buildTable(current, false)}</div>
		<h1>Unpriced Items: ${missing.length}</h1><div>${buildMissingTable(missing)}</div>

		<script>
		  let queue = [];
		  function refreshQueue() {
			const ul = document.getElementById('queue-list');
			ul.innerHTML = '';
			queue.forEach(function(q, i) {
			  const li = document.createElement('li');
			  const actionText = (q.action === 'add' || q.action === 'addName') ? 'Add ' : 'Remove ';
			  const nameText = q.sku ? decodeURIComponent(q.sku) : decodeURIComponent(q.name);
			  li.textContent = actionText + nameText;
			  li.dataset.index = i;
			  li.addEventListener('click', function() {
				queue.splice(this.dataset.index, 1);
				refreshQueue();
			  });
			  ul.appendChild(li);
			});
		  }
		  function queueAction(action, value) {
			queue.push({ action: action, sku: (action !== 'addName' ? value : null), name: (action === 'addName' ? value : null) });
			refreshQueue();
		  }
		  async function applyQueue() {
			if (!queue.length) return;
			if (!confirm('Apply ' + queue.length + ' changes and restart bot?')) return;
			for (const q of queue) {
			  if (q.action === 'add') await fetch('/bot/add', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'sku=' + q.sku});
			  if (q.action === 'remove') await fetch('/bot/remove', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'sku=' + q.sku});
			  if (q.action === 'addName') await fetch('/add-item', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'name=' + q.name});
			}
			queue = [];
			refreshQueue();
			location.reload();
		  }
		  function filterRows() {
			const s = document.getElementById('search').value.toLowerCase();
			const fNot = document.getElementById('filter-notinbot').checked;
			const f2h = document.getElementById('filter-2h').checked;
			const f1d = document.getElementById('filter-1d').checked;
			const f3d = document.getElementById('filter-3d').checked;
			document.querySelectorAll('tbody tr').forEach(function(row) {
			  const name = (row.querySelector('.name')?.innerText || '').toLowerCase();
			  const sku = (row.querySelector('.sku')?.innerText || '').toLowerCase();
			  const inb = row.dataset.inbot === 'true';
			  const age = parseInt(row.dataset.age) || 0;
			  let ok = name.includes(s) || sku.includes(s);
			  if (ok && fNot && inb) ok = false;
			  if (ok && f2h && age < 3600 * 2) ok = false;
			  if (ok && f1d && age < 3600 * 24) ok = false;
			  if (ok && f3d && age < 3600 * 72) ok = false;
			  row.style.display = ok ? '' : 'none';
			});
		  }
		  document.getElementById('search').addEventListener('input', filterRows);
		  document.querySelectorAll('.filter').forEach(cb => cb.addEventListener('change', filterRows));
		  filterRows();
		</script>
	  `;

	  res.send(renderPage('Pricelist Status', html));
	});
  app.use('/', router); // Mount the router to root path
};
