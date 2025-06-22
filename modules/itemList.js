const fs = require('fs');
const chokidar = require('chokidar');

function createItemListManager(ITEM_LIST_PATH, config) {
  let allowedItemNames = new Set();
  let itemBounds = new Map();

  function loadNames() {
    try {
      const jsonContent = JSON.parse(fs.readFileSync(ITEM_LIST_PATH, 'utf8'));
      if (jsonContent && jsonContent.items && Array.isArray(jsonContent.items)) {
        allowedItemNames = new Set(jsonContent.items.map((item) => item.name));
        itemBounds = new Map();
        for (const item of jsonContent.items) {
          itemBounds.set(item.name, {
            minBuyKeys: typeof item.minBuyKeys === 'number' ? item.minBuyKeys : undefined,
            minBuyMetal: typeof item.minBuyMetal === 'number' ? item.minBuyMetal : undefined,
            maxBuyKeys: typeof item.maxBuyKeys === 'number' ? item.maxBuyKeys : undefined,
            maxBuyMetal: typeof item.maxBuyMetal === 'number' ? item.maxBuyMetal : undefined,
            minSellKeys: typeof item.minSellKeys === 'number' ? item.minSellKeys : undefined,
            minSellMetal: typeof item.minSellMetal === 'number' ? item.minSellMetal : undefined,
            maxSellKeys: typeof item.maxSellKeys === 'number' ? item.maxSellKeys : undefined,
            maxSellMetal: typeof item.maxSellMetal === 'number' ? item.maxSellMetal : undefined,
          });
        }
        console.log('Updated allowed item names and bounds.');
      }
    } catch (error) {
      console.error('Error reading and updating allowed item names', error);
    }
  }

  function watchItemList() {
    const watcher = chokidar.watch(ITEM_LIST_PATH);
    watcher.on('change', () => loadNames());
  }

  // Initial load
  loadNames();

  return {
    loadNames,
    watchItemList,
    getAllowedItemNames: () => allowedItemNames,
    getItemBounds: () => itemBounds,
    allowAllItems: () => config.priceAllItems === true,
  };
}

module.exports = createItemListManager;
