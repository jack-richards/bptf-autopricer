const express = require('express');
const path = require('path');
const { loadJson, saveJson } = require('../utils');
const renderPage = require('../layout');

module.exports = function (app, config) {
    const router = express.Router();
    const itemListPath = path.resolve(__dirname, '../../files/item_list.json');

    function buildBoundsTable(items) {
        let tbl = `<form method="POST" action="/bounds">
        <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Min Buy</th>
                <th>Max Buy</th>
                <th>Min Sell</th>
                <th>Max Sell</th>
            </tr>
        </thead>
        <tbody>`;
        items.forEach((item, idx) => {
            tbl += `<tr>
                <td>${item.name}</td>
                <td><input type="number" step="0.01" name="minBuy_${idx}" value="${item.minBuy ?? ''}" style="width:80px"></td>
                <td><input type="number" step="0.01" name="maxBuy_${idx}" value="${item.maxBuy ?? ''}" style="width:80px"></td>
                <td><input type="number" step="0.01" name="minSell_${idx}" value="${item.minSell ?? ''}" style="width:80px"></td>
                <td><input type="number" step="0.01" name="maxSell_${idx}" value="${item.maxSell ?? ''}" style="width:80px"></td>
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
            const minBuy = req.body[`minBuy_${i}`];
            const maxBuy = req.body[`maxBuy_${i}`];
            const minSell = req.body[`minSell_${i}`];
            const maxSell = req.body[`maxSell_${i}`];
            const item = itemList.items.find(it => it.name === name);
            if (item) {
                item.minBuy = minBuy !== '' ? parseFloat(minBuy) : undefined;
                item.maxBuy = maxBuy !== '' ? parseFloat(maxBuy) : undefined;
                item.minSell = minSell !== '' ? parseFloat(minSell) : undefined;
                item.maxSell = maxSell !== '' ? parseFloat(maxSell) : undefined;
            }
        }
        saveJson(itemListPath, itemList);
        res.redirect('/bounds');
    });

    app.use('/', router);
};