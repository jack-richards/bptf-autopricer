const fs = require('fs');
const path = require('path');

/**
 * Reads a pricelist JSON file and logs items whose timestamp is older than the given threshold.
 * @param {string} pricelistPath - Absolute or relative path to pricelist.json
 * @param {number} ageThresholdSec - Age threshold in seconds (e.g. 2*3600 for 2 hours)
 */
function checkOldPrices(pricelistPath, ageThresholdSec = 2 * 3600) {
  fs.readFile(pricelistPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading pricelist file at ${pricelistPath}:`, err);
      return;
    }
    let json;
    try {
      json = JSON.parse(data);
    } catch (parseErr) {
      console.error('Error parsing pricelist JSON:', parseErr);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const oldItems = json.items.filter((item) => now - item.time > ageThresholdSec);
    const totalItems = json.items;

    if (oldItems.length > 0) {
      console.log(
        `Found ${oldItems.length} out of ${totalItems.length} items older than ${ageThresholdSec / 3600} hours:`,
      );
      oldItems.forEach((item) => {
        const ageHr = ((now - item.time) / 3600).toFixed(2);
        console.log(
          ` - ${item.name} (SKU: ${item.sku}) is ${ageHr} hours old (timestamp: ${item.time})`,
        );
      });
    } else {
      console.log(`No items older than ${ageThresholdSec / 3600} hours.`);
    }
  });
}

/**
 * Watch the file for changes and re-run the check when it updates.
 * @param {string} pricelistPath
 * @param {number} intervalSec - Periodic check interval in seconds (optional)
 */
function watchPrices(pricelistPath, intervalSec = 86400) {
  //Default 24 hours
  const fullPath = path.resolve(pricelistPath);

  // Initial check
  checkOldPrices(fullPath);

  // Also periodic fallback check
  setInterval(() => {
    console.log(`\n[Periodic check] ${new Date().toLocaleTimeString()}`);
    checkOldPrices(fullPath);
  }, intervalSec * 1000);
}

// If run directly, watch the default pricelist.json in this directory
if (require.main === module) {
  const file = path.join(__dirname, 'pricelist.json');
  watchPrices(file);
}

module.exports = { checkOldPrices, watchPrices };
