/* eslint-disable spellcheck/spell-checker */
const { db } = require('../../bptf-autopricer');
const renderPage = require('../layout');

module.exports = (app) => {
  app.get('/key-prices', async (req, res) => {
    try {
      const data = await db.any(`
        SELECT timestamp, buy_price_metal, sell_price_metal
        FROM key_prices
        WHERE created_at > NOW() - INTERVAL '14 days'
        ORDER BY created_at ASC
      `);

      const timestamps = data.map((p) => new Date(p.timestamp * 1000).toLocaleString());
      const buyPrices = data.map((p) => parseFloat(p.buy_price_metal));
      const sellPrices = data.map((p) => parseFloat(p.sell_price_metal));

      const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const stdDev = (arr) => {
        const avg = mean(arr);
        return Math.sqrt(arr.map((x) => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / arr.length);
      };

      const stats = {
        buy: {
          mean: mean(buyPrices).toFixed(3),
          std: stdDev(buyPrices).toFixed(3),
        },
        sell: {
          mean: mean(sellPrices).toFixed(3),
          std: stdDev(sellPrices).toFixed(3),
        },
      };

      res.send(
        renderPage(
          'Key Prices (Last 14 Days)',
          `
        <body>
          <h1>Key Prices (Last 14 Days)</h1>
          <canvas id="priceChart" width="1000" height="400"></canvas>
          <p><strong>Buy Price Mean:</strong> ${stats.buy.mean}, <strong>Std Dev:</strong> ${stats.buy.std}</p>
          <p><strong>Sell Price Mean:</strong> ${stats.sell.mean}, <strong>Std Dev:</strong> ${stats.sell.std}</p>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
		  <script>
            const ctx = document.getElementById('priceChart').getContext('2d');
            new Chart(ctx, {
              type: 'line',
              data: {
                labels: ${JSON.stringify(timestamps)},
                datasets: [
                  {
                    label: 'Buy Price',
                    data: ${JSON.stringify(buyPrices)},
                    borderColor: 'green',
                    fill: false,
                    tension: 0.3
                  },
                  {
                    label: 'Sell Price',
                    data: ${JSON.stringify(sellPrices)},
                    borderColor: 'red',
                    fill: false,
                    tension: 0.3
                  }
                ]
              },
              options: {
                responsive: true,
                plugins: {
                  title: {
                    display: true,
                    text: 'Key Price Trends'
                  }
                },
                scales: {
                  y: {
                    title: {
                      display: true,
                      text: 'Metal'
                    }
                  },
                  x: {
                    title: {
                      display: true,
                      text: 'Time'
                    }
                  }
                }
              }
            });
          </script>
        </body>
      `
        )
      );
    } catch (err) {
      console.error('Failed to load key prices:', err);
      res.status(500).send('Could not retrieve key price data.');
    }
  });
};
