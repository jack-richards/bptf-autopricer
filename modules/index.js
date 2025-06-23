// index.js
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { loadJson, saveJson } = require('./utils');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const CONFIG_PATH = path.resolve(__dirname, '../pricerConfig.json');
let config;
try {
  config = loadJson(CONFIG_PATH);
} catch {
  config = {
    pm2ProcessName: 'tf2autobot',
    tf2AutobotDir: '../../tf2autobot-5.13.0',
    botTradingDir: 'files/bot',
    port: process.env.PRICE_WATCHER_PORT || 3000,
    ageThresholdSec: 7200,
  };
  saveJson(CONFIG_PATH, config);
}

const PORT = config.port;

function mountRoutes() {
  require('./routes/pricelist')(app, config);
  require('./routes/trades')(app, config);
  require('./routes/key-prices')(app, config);
  require('./routes/actions')(app, config);
  require('./routes/logs')(app, config);
  require('./routes/pnl')(app, config);
  require('./routes/bounds')(app, config); // <-- add this line
}

function startPriceWatcher() {
  mountRoutes();
  app.listen(PORT, () => {
    console.log(`PriceWatcher web server running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startPriceWatcher();
}

module.exports = { startPriceWatcher };
