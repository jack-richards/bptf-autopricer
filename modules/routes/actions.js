// routes/actions.js
const path = require('path');
const { exec } = require('child_process');
const { loadJson, saveJson } = require('../utils');

module.exports = function(app, config) {
  const pricelistPath = path.resolve(__dirname, '../../files/pricelist.json');
  const sellingPricelistPath = path.resolve(
    __dirname,
    config.tf2AutobotDir,
    config.botTradingDir,
    'pricelist.json'
  );
  const itemListPath = path.resolve(__dirname, '../../files/item_list.json');

  app.post('/bot/add', (req, res) => {
    const sell = loadJson(sellingPricelistPath);
    const main = loadJson(pricelistPath);
    const sku = req.body.sku;
    const min = parseInt(req.body.min) || 1;
    const max = parseInt(req.body.max) || 1;

    if (!sell[sku]) {
      const item = main.items.find(i => i.sku === sku);
      if (item) {
        sell[sku] = {
          sku: item.sku,
          name: item.name,
          enabled: true,
          autoprice: true,
          min: min,
          max: max,
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
    const { name } = req.body;
    if (!name) return res.redirect('back');

    const itemList = loadJson(itemListPath);
    if (!itemList.items.some(i => i.name === name)) {
      itemList.items.push({ name });
      saveJson(itemListPath, itemList);
    }

    // Optionally log or store min/max for use elsewhere
    console.log(`Added item: ${name}`);

    res.redirect('back');
  });

  app.post('/bot/edit', (req, res) => {
    const { sku, min, max } = req.body;
    if (!sku || isNaN(min) || isNaN(max)) return res.status(400).send('Invalid edit');

    const pricelist = loadJson(sellingPricelistPath);
    if (!pricelist[sku]) return res.status(404).send('Item not found');

    pricelist[sku].min = parseInt(min);
    pricelist[sku].max = parseInt(max);

    saveJson(sellingPricelistPath, pricelist);

    // Optional: trigger PM2 restart
    exec('pm2 restart tf2autobot', (err, stdout, stderr) => {
      if (err) console.error('PM2 restart error:', stderr);
      else console.log('Bot restarted after edit:', stdout);
    });

    res.send('Updated');
  });
};
