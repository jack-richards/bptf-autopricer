// routes/actions.js
const path = require('path');
const { exec } = require('child_process');
const { loadJson, saveJson } = require('../utils');

module.exports = function(app, config) {
  const pricelistPath = path.resolve(__dirname, '../files/pricelist.json');
  const sellingPricelistPath = path.resolve(
    __dirname,
    config.tf2AutobotDir,
    config.botTradingDir,
    'pricelist.json'
  );
  const itemListPath = path.resolve(__dirname, '../files/item_list.json');

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
        exec(`pm2 restart ${config.pm2ProcessName}`, (err, stdout, stderr) => {
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
      exec(`pm2 restart ${config.pm2ProcessName}`, (err, stdout, stderr) => {
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
};
