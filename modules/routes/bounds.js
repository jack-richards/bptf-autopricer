const path = require('path');
const express = require('express');
const { loadJson, saveJson } = require('../utils');
const renderPage = require('../layout');

module.exports = function (app) {
  const router = express.Router();
  const itemListPath = path.resolve(__dirname, '../../files/item_list.json');

  function buildBoundsTable(items) {
    let tbl = `<form method="POST" action="/bounds">
        <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Min Buy Keys</th>
                <th>Min Buy Metal</th>
                <th>Max Buy Keys</th>
                <th>Max Buy Metal</th>
                <th>Min Sell Keys</th>
                <th>Min Sell Metal</th>
                <th>Max Sell Keys</th>
                <th>Max Sell Metal</th>
            </tr>
        </thead>
        <tbody>`;
    items.forEach((item, idx) => {
      tbl += `<tr>
                <td>${item.name}</td>
                <td><input type="number" step="1" name="minBuyKeys_${idx}" value="${item.minBuyKeys ?? ''}" style="width:60px"></td>
                <td><input type="number" step="0.01" name="minBuyMetal_${idx}" value="${item.minBuyMetal ?? ''}" style="width:80px"></td>
                <td><input type="number" step="1" name="maxBuyKeys_${idx}" value="${item.maxBuyKeys ?? ''}" style="width:60px"></td>
                <td><input type="number" step="0.01" name="maxBuyMetal_${idx}" value="${item.maxBuyMetal ?? ''}" style="width:80px"></td>
                <td><input type="number" step="1" name="minSellKeys_${idx}" value="${item.minSellKeys ?? ''}" style="width:60px"></td>
                <td><input type="number" step="0.01" name="minSellMetal_${idx}" value="${item.minSellMetal ?? ''}" style="width:80px"></td>
                <td><input type="number" step="1" name="maxSellKeys_${idx}" value="${item.maxSellKeys ?? ''}" style="width:60px"></td>
                <td><input type="number" step="0.01" name="maxSellMetal_${idx}" value="${item.maxSellMetal ?? ''}" style="width:80px"></td>
                <input type="hidden" name="name_${idx}" value="${item.name}">
            </tr>`;
    });
    tbl += `</tbody></table>
        <input type="hidden" name="count" value="${items.length}">
        <button type="submit">Save All Bounds</button>
        </form>`;
    return tbl;
  }

  router.get('/bounds', (req, res) => {
    const itemList = loadJson(itemListPath).items || [];
    const html = `
            <h1>Edit Item Price Bounds</h1>
            ${buildBoundsTable(itemList)}
            <p>Leave a field blank to unset a bound.</p>
        `;
    res.send(renderPage('Edit Bounds', html));
  });

  router.post('/bounds', (req, res) => {
    const itemList = loadJson(itemListPath);
    const count = parseInt(req.body.count) || 0;
    for (let i = 0; i < count; i++) {
      const name = req.body[`name_${i}`];
      const fields = [
        'minBuyKeys',
        'minBuyMetal',
        'maxBuyKeys',
        'maxBuyMetal',
        'minSellKeys',
        'minSellMetal',
        'maxSellKeys',
        'maxSellMetal',
      ];
      const item = itemList.items.find((it) => it.name === name);
      if (item) {
        for (const field of fields) {
          const val = req.body[`${field}_${i}`];
          item[field] = val !== '' && val !== undefined ? parseFloat(val) : undefined;
        }
      }
    }
    saveJson(itemListPath, itemList);
    res.redirect('/bounds');
  });

  app.use('/', router);
};
