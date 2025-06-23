const fs = require('fs');
const express = require('express');

const router = express.Router();

const PRICELIST_PATH = './files/pricelist.json';
const ITEM_LIST_PATH = './files/item_list.json';

// Get item price by SKU.
router.get('/:sku', async (req, res) => {
  let item_found = false;
  let item_object = {};

  fs.readFile(PRICELIST_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(400).json({ error: 'Failed to load pricelist.' });
    }

    let sku = req.params.sku;
    data = JSON.parse(data);

    // Iterate over each item in the items JSON array.
    for (const item of data.items) {
      // Find the requested item.
      if (item.sku === sku) {
        item_found = true;
        item_object = item;
        break;
      }
    }

    // Item found, send item object as response.
    if (item_found) {
      return res.status(200).json(item_object);
    } else {
      // Item was not found in the pricelist.
      return res.sendStatus(404);
    }
  });
});

// Get pricelist.
router.get('/', (req, res) => {
  // Read pricelist into memory and send.
  fs.readFile(PRICELIST_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(400).json({ error: 'Failed to load pricelist.' });
    }

    data = JSON.parse(data);

    // Send pricelist to requester.
    return res.status(200).json(data);
  });
});

// Request check endpoint. For now this will do
// nothing but return a status code of 200.
router.post('/:sku', (req, res) => {
  return res.status(200).json({ sku: req.params.sku });
});

// Routes for adding/removing items.
router.post('/add/:name', (req, res) => {
  let name = req.params.name;
  let item_found = false;
  let new_item = { name: name };

  // Check if item exists already.
  fs.readFile(ITEM_LIST_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(400).json({ error: 'Failed to load item list.' });
    }

    try {
      data = JSON.parse(data);
      // Iterate over each item in the items JSON array.
      for (const item of data.items) {
        // Find the requested item.
        if (item.name === name) {
          item_found = true;
          break;
        }
      }
    } catch {
      return res.sendStatus(400);
    }

    // Item found, shouldn't add item again.
    if (item_found) {
      return res.sendStatus(400);
    } else {
      // Item was not found in the item list. Adding item.
      data.items.push(new_item);

      fs.writeFile(ITEM_LIST_PATH, JSON.stringify(data), 'utf8', (err) => {
        if (err) {
          return res.sendStatus(400);
        }
        return res.sendStatus(200);
      });
    }
  });
});

router.post('/delete/:name', (req, res) => {
  let name = req.params.name;
  let item_found = false;

  // Check if item exists.
  fs.readFile(ITEM_LIST_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(400).json({ error: 'Failed to load item list.' });
    }
    try {
      data = JSON.parse(data);
      let items = data.items;
      // Iterate over each item in the items JSON array.
      for (var i = 0; i < items.length; i++) {
        let item = items[i];
        if (item.name === name) {
          item_found = true;
          items.splice(i, 1); // Remove the item from the JSON array.
          break;
        }
      }
    } catch {
      return res.sendStatus(400);
    }

    // Item found, saving version of item list with the item deleted.
    if (item_found) {
      fs.writeFile(ITEM_LIST_PATH, JSON.stringify(data), 'utf8', (err) => {
        if (err) {
          return res.sendStatus(400);
        }
        return res.sendStatus(200);
      });
    } else {
      return res.sendStatus(400);
    }
  });
});

module.exports = router;
