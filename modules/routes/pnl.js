// routes/pnl.js
const express = require('express');
const path = require('path');
const { loadJson } = require('../utils');
const renderPage = require('../layout');
const fs = require('fs');

module.exports = function (app, config) {
  const router = express.Router();
  const pollDataPath = path.resolve(__dirname, config.tf2AutobotDir, config.botTradingDir, 'polldata.json');
  const pricelistPath = path.resolve(__dirname, '../../files/pricelist.json');
  const keyPrice = loadJson(pricelistPath).items.find(i => i.sku === '5021;6')?.sell?.metal;

  router.get('/pnl', (req, res) => {
    let parsed;
    try {
      const raw = fs.readFileSync(pollDataPath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(500).send(renderPage('P&L Dashboard', '<p>Error loading trade data.</p>'));
    }

    const history = Object.values(parsed.offerData || {}).filter(t => t.isAccepted);
    const summary = {};
    const profitPoints = [];
    let totalProfit = 0;

    for (const t of history) {
      const skuList = Object.entries(t.dict?.our || {}).concat(Object.entries(t.dict?.their || {}));
      const valueOur = t.value?.our || { keys: 0, metal: 0 };
      const valueTheir = t.value?.their || { keys: 0, metal: 0 };
      const profit = (valueTheir.keys * keyPrice + valueTheir.metal) - (valueOur.keys * keyPrice + valueOur.metal);
      totalProfit += profit;

      let timestamp = t.time || t.actionTimestamp || Date.now();

      // Fix: Convert from seconds to ms if it's a 10-digit number (Unix time)
      // Otherwise treat as ISO or already ms
      if (typeof timestamp === 'number' && timestamp < 1e12) {
        timestamp *= 1000;
      }

      const date = new Date(timestamp);
      if (isNaN(date.getTime())) continue; // Skip bad timestamp

      const timeISO = date.toISOString();


      profitPoints.push({ x: timeISO, y: parseFloat(totalProfit.toFixed(2)) });

      for (const [sku, qty] of skuList) {
        if (!summary[sku]) summary[sku] = { qty: 0, profit: 0 };
        summary[sku].qty += qty;
        summary[sku].profit += profit;
      }
    }

    const sortedByProfit = Object.entries(summary)
      .sort(([, a], [, b]) => b.profit - a.profit)
      .slice(0, 10);

    const sortedByQty = Object.entries(summary)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .slice(0, 10);

    const breakdownTable = sortedByProfit.map(([sku, data]) =>
      `<tr><td>${sku}</td><td>${data.qty}</td><td>${data.profit.toFixed(2)} Ref</td></tr>`).join('');

    const html = `
        <h1>Profit & Loss Dashboard</h1>
        <div class="chart-fullscreen">
            <canvas id="profitOverTime"></canvas>
        </div>
        <!-- Load correct versions -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.3/build/global/luxon.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.umd.min.js"></script>

        <script>
        // ✅ Don't re-register the adapter manually at all.
        // Chart.js will pick it up automatically with correct script order.

        const ctxProfit = document.getElementById('profitOverTime').getContext('2d');
        new Chart(ctxProfit, {
            type: 'line',
            data: {
            datasets: [{
                label: 'Cumulative Profit',
                data: ${JSON.stringify(profitPoints)},
                borderColor: 'green',
                backgroundColor: 'rgba(0,255,0,0.1)',
                fill: true,
                parsing: {
                xAxisKey: 'x',
                yAxisKey: 'y'
                },
                tension: 0.2
            }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day' },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    title: { display: true, text: 'Refined Metal' }
                }
                },
                plugins: {
                legend: { display: true, position: 'top' }
                }
            }
        });
        </script>
    `;

    res.send(renderPage('P&L Dashboard', html));
  });

  app.use('/', router);
};
