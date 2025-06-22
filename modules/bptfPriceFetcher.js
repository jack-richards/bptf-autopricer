const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const CACHE_PATH = path.resolve(__dirname, '../bptf-prices.json');

// Fetch all prices from backpack.tf
async function getBptfPrices(force = false) {
  let cacheValid = false;
  if (fs.existsSync(CACHE_PATH)) {
    const stats = fs.statSync(CACHE_PATH);
    const age = (Date.now() - stats.mtimeMs) / 1000;
    if (age < (config.bptfPriceCacheSeconds || 7200) && !force) {
      cacheValid = true;
    }
  }
  if (cacheValid) {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  }
  // Fetch from API (no raw param)
  const response = await axios.get('https://api.backpack.tf/api/IGetPrices/v4', {
    params: { key: config.bptfAPIKey },
  });
  if (response.data && response.data.response && response.data.response.items) {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(response.data.response.items, null, 2), 'utf8');
    return response.data.response.items;
  }
  throw new Error('Failed to fetch backpack.tf prices');
}

// Helper to get price for a specific SKU (handles unusuals and effects)
function getBptfItemPrice(items, sku) {
  // SKU: "524;5;u13" (defindex;quality;uEffect)
  const [defindex, quality, effectPart] = sku.split(';');
  const effect = effectPart && effectPart.startsWith('u') ? effectPart.slice(1) : null;

  // Find item by defindex (as number)
  const item = Object.values(items).find(i => i.defindex && i.defindex.includes(Number(defindex)));
  if (!item || !item.prices || !item.prices[quality]) return null;

  const tradable = item.prices[quality].Tradable;
  if (!tradable || !tradable.Craftable) return null;

  // For unusuals, find the correct effect
  if (quality === '5' && effect) {
    // Craftable is an array for unusuals
    const effectObj = tradable.Craftable.find(e => String(e.effect) === effect);
    return effectObj || tradable.Craftable[0];
  }

  // For non-unusuals, Craftable is an array or object
  if (Array.isArray(tradable.Craftable)) {
    return tradable.Craftable[0];
  } else {
    // Sometimes it's an object keyed by priceindex
    return Object.values(tradable.Craftable)[0];
  }
}

module.exports = { getBptfPrices, getBptfItemPrice };