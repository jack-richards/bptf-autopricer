const path = require('path');
const fs = require('fs');
const renderPage = require('../layout');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = function (app, config) {
  app.get('/trades', (req, res) => {
    const pollDataPath = path.resolve(
      __dirname,
      config.tf2AutobotDir,
      config.botTradingDir,
      'polldata.json',
    );
    const pricelistPath = path.resolve(__dirname, '../../files/pricelist.json');
    const pricelist = loadJson(pricelistPath);
    const keyPrice =
      pricelist.items.find((i) => i.sku === '5021;6')?.sell?.metal || 68.11;

    const currencyMap = {
      '5000;6': 'Scrap Metal',
      '5001;6': 'Reclaimed Metal',
      '5002;6': 'Refined Metal',
      '5021;6': 'Mann Co. Supply Crate Key',
    };
    const skuToName = {
      ...currencyMap,
      ...Object.fromEntries(
        pricelist.items.map((item) => [item.sku, item.name]),
      ),
    };

    let trades = [];
    let cumulativeProfit = 0;
    try {
      const raw = fs.readFileSync(pollDataPath, 'utf8');
      const parsed = JSON.parse(raw);
      const data = parsed.offerData;

      trades = Object.entries(data)
        .map(([id, trade]) => {
          const accepted =
            trade.action?.action === 'accept' || trade.isAccepted;
          const profileUrl = trade.partner
            ? `https://steamcommunity.com/profiles/${trade.partner}`
            : '#';
          const name = trade.partner || 'Unknown';
          const timeRaw = trade.time || trade.actionTimestamp || Date.now();
          const timestamp =
            timeRaw > 2000000000 ? new Date(timeRaw) : new Date(timeRaw * 1000);
          const time = timestamp.toLocaleString();

          const itemsOur = trade.dict?.our || {};
          const itemsTheir = trade.dict?.their || {};
          const valueOur = trade.value?.our || { keys: 0, metal: 0 };
          const valueTheir = trade.value?.their || { keys: 0, metal: 0 };

          const metalOut = valueOur.keys * keyPrice + valueOur.metal;
          const metalIn = valueTheir.keys * keyPrice + valueTheir.metal;
          const profit = metalIn - metalOut;

          if (accepted) {
            cumulativeProfit += profit;
          }

          const statusFlags = [];
          if (trade.isAccepted) {statusFlags.push('✅ Accepted');}
          if (trade.isDeclined) {statusFlags.push('❌ Declined');}
          if (trade.isInvalid) {statusFlags.push('⚠️ Invalid');}
          if (trade.action?.action?.toLowerCase().includes('counter'))
          {statusFlags.push('↩️ Countered');}
          if (trade.action?.action === 'skip') {statusFlags.push('⏭️ Skipped');}

          return {
            id,
            profileUrl,
            name,
            time,
            timestamp: timestamp.getTime(), // Add this line
            accepted,
            itemsOur,
            itemsTheir,
            valueOur,
            valueTheir,
            profit,
            action: trade.action?.action || 'unknown',
            reason: trade.action?.reason || '',
            status: statusFlags.join('<br>') || '⚠️ Unmarked',
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, descending
    } catch (e) {
      console.error('Error loading polldata:', e);
      return res.status(500).send('Failed to load trade history');
    }

    const rows = trades
      .map(
        (t) => `
      <tr data-status="${t.action}">
        <td><a href="${t.profileUrl}" target="_blank">${t.id}</a><br><small>${t.name}</small></td>
        <td>${t.time}</td>
        <td><strong>Sent:</strong><br>${Object.entries(t.itemsOur)
    .map(
      ([sku, qty]) => `${qty}× ${skuToName[sku] || 'Unknown'} (${sku})`,
    )
    .join('<br>')}<br>
          <strong>Value:</strong> ${t.valueOur.keys} Keys, ${t.valueOur.metal} Ref
        </td>
        <td><strong>Received:</strong><br>${Object.entries(t.itemsTheir)
    .map(
      ([sku, qty]) => `${qty}× ${skuToName[sku] || 'Unknown'} (${sku})`,
    )
    .join('<br>')}<br>
          <strong>Value:</strong> ${t.valueTheir.keys} Keys, ${t.valueTheir.metal} Ref
        </td>
        <td>${t.action}<br><small>${t.reason}</small></td>
        <td>${t.status}</td>
        <td style="color:${t.profit > 0 ? 'green' : t.profit < 0 ? 'red' : 'gray'}">
          ${t.accepted ? `${t.profit > 0 ? '+' : ''}${t.profit.toFixed(2)} Ref` : '-'}
        </td>
      </tr>
    `,
      )
      .join('');

    const html = `
      <h1>Trade History</h1>
      <label for="statusFilter"><strong>Filter by Status:</strong></label>
      <select id="statusFilter" onchange="filterTrades()">
        <option value="">All</option>
        <option value="accept">Accepted</option>
        <option value="decline">Declined</option>
        <option value="counter">Countered</option>
        <option value="skip">Skipped</option>
        <option value="invalid">Invalid</option>
      </select>
      <p><strong>Total Net Profit:</strong> ${cumulativeProfit >= 0 ? '+' : ''}${cumulativeProfit.toFixed(2)} Ref</p>
      <table>
        <thead>
          <tr><th>Trade ID</th><th>Time</th><th>Sent</th><th>Received</th><th>Action</th><th>Status</th><th>Profit</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f0f0f0; }
        td a { color: #0366d6; text-decoration: none; }
        td a:hover { text-decoration: underline; }
        select { margin-bottom: 20px; padding: 5px; }
      </style>
      <script>
        function filterTrades() {
          const filter = document.getElementById('statusFilter').value.toLowerCase();
          document.querySelectorAll('tbody tr').forEach(row => {
            const status = row.dataset.status.toLowerCase();
            row.style.display = !filter || status.includes(filter) ? '' : 'none';
          });
        }
      </script>
    `;

    res.send(renderPage('Trade History', html));
  });
};
