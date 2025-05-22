const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Configuration
const CONFIG_PATH = path.resolve(__dirname, '../pricerConfig.json');
// Load or initialize config
let config;
try {
  config = loadJson(CONFIG_PATH);
} catch (e) {
  // create default config
  config = {
    pm2ProcessName: 'tf2autobot',
    tf2AutobotDir: '../../tf2autobot-5.13.0',
    botTradingDir: 'files/bot',
    port: process.env.PRICE_WATCHER_PORT || 3000,
    ageThresholdSec: 7200
  };
  saveJson(CONFIG_PATH, config);
}

const PORT = config.port;
const thresholdSec = config.ageThresholdSec;
const pricelistPath = path.resolve(__dirname, '../files/pricelist.json');
const sellingPricelistPath = path.resolve(__dirname, config.tf2AutobotDir, config.botTradingDir, 'pricelist.json');
const itemListPath = path.resolve(__dirname, '../files/item_list.json');(__dirname, '../files/item_list.json');

// In-memory queue of actions
let queue = [];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function saveJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function buildTable(items, showAge) {
  items.sort((a, b) => a.name.localeCompare(b.name));
  let tbl = '<table><thead><tr>' +
            '<th>Name</th><th>SKU</th><th>Last Updated</th>' +
            (showAge ? '<th>Age (h)</th>' : '') +
            '<th>Buy</th><th>Sell</th><th>In Bot</th><th>Action</th>' +
            '</tr></thead><tbody>';
  items.forEach(item => {
    const last = new Date(item.time * 1000).toLocaleString();
    const ageH = (item.age/3600).toFixed(2);
    const buyUnit = item.buy.keys===1?'Key':'Keys';
    const sellUnit = item.sell.keys===1?'Key':'Keys';
    const inBot = item.inSelling;
    const sku = item.sku;
    const actionBtn = inBot
      ? `<button onclick="queueAction('remove','${sku}')">❌</button>`
      : `<button onclick="queueAction('add','${sku}')">✅</button>`;
    const rowClass = showAge
      ? (item.age>2*24*3600?'outdated-2d':item.age>24*3600?'outdated-1d':'outdated-2h')
      : 'current-row';
    tbl += `<tr class="${rowClass}" data-age="${item.age}" data-inbot="${inBot}">` +
           `<td class="name">${item.name}</td>` +
           `<td class="sku">${sku}</td>` +
           `<td>${last}</td>` +
           (showAge?`<td>${ageH}</td>`:'') +
           `<td>${item.buy.keys} ${buyUnit} & ${item.buy.metal} Refined</td>` +
           `<td>${item.sell.keys} ${sellUnit} & ${item.sell.metal} Refined</td>` +
           `<td>${inBot?'✓':'✗'}</td>` +
           `<td>${actionBtn}</td></tr>`;
  });
  return tbl+'</tbody></table>';
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
  return tbl+'</tbody></table>';
}

function loadData() {
  const main = loadJson(pricelistPath);
  const sell = loadJson(sellingPricelistPath);
  const itemList = loadJson(itemListPath).items.map(i=>i.name);
  const now = Math.floor(Date.now()/1000);
  const outdated=[], current=[], priced=new Set();
  main.items.forEach(item=>{
    const age=now-item.time;
    const inSelling=Boolean(sell[item.sku]);
    priced.add(item.name);
    const annotated={...item,age,inSelling};
    (age>thresholdSec?outdated:current).push(annotated);
  });
  const missing=itemList.filter(n=>!priced.has(n));
  return { outdated, current, missing };
}

function generateHtml(outdated,current,missing) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="120">
  <title>Pricelist Status</title><style>
  body{font-family:sans-serif;margin:0;padding:20px;}nav{position:fixed;top:20px;right:20px;background:#444;color:#fff;padding:10px;border-radius:5px;}
  nav a{color:#fff;text-decoration:none;margin:5px;display:inline-block;padding:5px 10px;border-radius:3px;}nav a:hover{background:rgba(255,255,255,0.2);} 
  .controls{margin-bottom:20px;} .controls input[type=text]{padding:5px;width:200px;margin-right:10px;} .controls label{margin-right:15px;}
  #queue-panel{position:fixed;top:100px;right:0;width:200px;background:#f9f9f9;border:1px solid #ccc;padding:10px;max-height:80vh;overflow:auto;}
  table{width:100%;border-collapse:collapse;margin-bottom:30px;table-layout:fixed;}th,td{border:1px solid #ccc;padding:8px;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}th{background:#f0f0f0;}button{cursor:pointer;border:none;background:none;font-size:1em;}
  .outdated-2h{background:#ffffe0;} .outdated-1d{background:#ffe5b4;} .outdated-2d{background:#f4cccc;} .current-row{background:#e0ffe0;}
  </style></head><body>
<nav><a href="#add-form">Add</a><a href="#outdated-section">Outdated</a><a href="#current-section">Current</a><a href="#unpriced-section">Unpriced</a></nav>
<div class="controls"><input type="text" id="search" placeholder="Search..."><label><input type="checkbox" class="filter" id="filter-notinbot"> Not In Bot</label><label><input type="checkbox" class="filter" id="filter-2h"> Age ≥2h</label><label><input type="checkbox" class="filter" id="filter-1d"> Age ≥24h</label><label><input type="checkbox" class="filter" id="filter-3d"> Age ≥72h</label></div>
<div id="add-item-section"><h2 id="add-form">Add New Item to item_list.json</h2><p>Appends given name to <code>item_list.json</code></p><form method="POST" action="/add-item"><input type="text" name="name" placeholder="New item name..." required><button type="submit">Add</button></form></div>
<div id="queue-panel"><h3>Pending Actions</h3><ul id="queue-list"></ul><button onclick="applyQueue()">Apply & Restart</button></div>
<h1 id="outdated-section">Outdated Items (≥2h): ${outdated.length}</h1><div id="outdated-section-table">${buildTable(outdated,true)}</div>
<h1 id="current-section">Current Items: ${current.length}</h1><div id="current-section-table">${buildTable(current,false)}</div>
<h1 id="unpriced-section">Unpriced Items: ${missing.length}</h1><div id="unpriced-section-table">${buildMissingTable(missing)}</div>
<script>
// Client-side queue
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
    // remove on click
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
// Filtering
function filterRows() {
  const s = document.getElementById('search').value.toLowerCase();
  const fNot = document.getElementById('filter-notinbot').checked;
  const f2h = document.getElementById('filter-2h').checked;
  const f1d = document.getElementById('filter-1d').checked;
  const f3d = document.getElementById('filter-3d').checked;
  ['outdated-section-table','current-section-table','unpriced-section-table'].forEach(function(sec) {
    document.querySelectorAll('#' + sec + ' tbody tr').forEach(function(row) {
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
  });
}
document.getElementById('search').addEventListener('input', filterRows);
document.querySelectorAll('.filter').forEach(function(cb) { cb.addEventListener('change', filterRows); });
filterRows();
</script>
</body></html>`;
}

// Mount routes
function mountRoutes() {
  app.get('/', (req, res) => {
    const { outdated, current, missing } = loadData();
    res.send(generateHtml(outdated, current, missing));
  });

  app.post('/bot/add', (req, res) => {
    const sell = loadJson(sellingPricelistPath);
    const main = loadJson(pricelistPath);
    const sku = req.body.sku;
    if (!sell[sku]) {
      const item = main.items.find(i => i.sku === sku);
      if (item) {
        sell[sku] = {
          sku: item.sku,
          name: item.name,
          enabled: true,
          autoprice: true,
          min: 0,
          max: 1,
          intent: 2,
          buy: item.buy,
          sell: item.sell,
          time: Math.floor(Date.now() / 1000),
          promoted: 0,
          group: 'all',
          note: { buy: null, sell: null },
          isPartialPriced: false
        };
        saveJson(sellingPricelistPath, sell);
        exec('pm2 restart tf2autobot', (err, stdout, stderr) => {
          if (err) console.error('PM2 restart error:', stderr);
          else console.log('Restarted tf2autobot:', stdout);
        });
      }
    }
    res.redirect('back');
  });

  app.post('/bot/remove', (req, res) => {
    const sell = loadJson(sellingPricelistPath);
    const sku = req.body.sku;
    if (sell[sku]) {
      delete sell[sku];
      saveJson(sellingPricelistPath, sell);
      exec('pm2 restart tf2autobot', (err, stdout, stderr) => {
        if (err) console.error('PM2 restart error:', stderr);
        else console.log('Restarted tf2autobot:', stdout);
      });
    }
    res.redirect('back');
  });

  app.post('/add-item', (req, res) => {
    const name = req.body.name;
    if (name) {
      const jl = loadJson(itemListPath);
      if (!jl.items.some(i => i.name === name)) {
        jl.items.push({ name });
        saveJson(itemListPath, jl);
      }
    }
    res.redirect('back');
  });
}

// Exported start function
function startPriceWatcher() {
  mountRoutes();
  app.listen(PORT, () => {
    console.log(`PriceWatcher web server running on http://localhost:${PORT}`);
  });
}

// Auto-start if this file is run directly
if (require.main === module) {
  startPriceWatcher();
}

module.exports = { startPriceWatcher };
