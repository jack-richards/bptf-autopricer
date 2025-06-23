const path = require('path');
const fs = require('fs');
const axios = require('axios');
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
  // SKU (defindex;quality;Effect)
  const [defindex, quality, effectPart] = sku.split(';');
  const effect = effectPart && effectPart.startsWith('u') ? effectPart.slice(1) : null;

  // Find item by defindex (as number)
  const item = Object.values(items).find(
    (i) => i.defindex && i.defindex.includes(Number(defindex))
  );
  if (!item || !item.prices || !item.prices[quality]) {
    return null;
  }

  const tradable = item.prices[quality].Tradable;
  if (!tradable || !tradable.Craftable) {
    return null;
  }

  // For unusuals, find the correct effect
  if (quality === '5' && effect) {
    // Craftable is an array for unusuals
    const effectObj = tradable.Craftable.find((e) => String(e.effect) === effect);
    return effectObj || tradable.Craftable[0];
  }

  // For non-unusuals, Craftable is an array or object
  if (Array.isArray(tradable.Craftable)) {
    return tradable.Craftable[0];
  } else {
    // Sometimes it's an object keyed by price index
    return Object.values(tradable.Craftable)[0];
  }
}

function getAllPricedItemNamesWithEffects(external_pricelist, schemaManager) {
  const names = [];
  const qualities = schemaManager.schema.qualities || {};
  const qualitiesById = {};
  for (const [name, id] of Object.entries(qualities)) {
    qualitiesById[id] = name.charAt(0).toUpperCase() + name.slice(1);
  }
  // Build effect ID -> name map using getUnusualEffects()
  const effectArray = schemaManager.schema.getUnusualEffects();
  const effects = {};
  for (const { id, name } of effectArray) {
    effects[id] = name;
  }

  const killstreakTiers = [
    null, //,//Temp removal while looking for a better way to handle killstreak items basically fuck this rn
    //'Killstreak',
    //'Specialized Killstreak',
    //'Professional Killstreak'
  ];

  for (const itemName in external_pricelist) {
    const item = external_pricelist[itemName];
    for (const qualityId in item.prices) {
      const qualityObj = item.prices[qualityId];
      const qualityName = qualitiesById[qualityId] || '';
      if (qualityObj.Tradable) {
        for (const craftType in qualityObj.Tradable) {
          const arrOrObj = qualityObj.Tradable[craftType];
          // Unusuals and rare qualities: Craftable is an object keyed by effect ID
          if (typeof arrOrObj === 'object' && !Array.isArray(arrOrObj)) {
            for (const effectId in arrOrObj) {
              const effectName = effects[effectId] || effectId;
              for (const ks of killstreakTiers) {
                const ksPrefix = ks ? ks + ' ' : '';
                // Only add quality if not Unique (6) and not Unusual (5)
                const prefix = qualityId !== '6' && qualityId !== '5' ? qualityName + ' ' : '';
                // Compose: "Professional Killstreak Burning Flames Strange Item"
                names.push(`${ksPrefix}${effectName} ${prefix}${itemName}`.trim());
              }
            }
          } else if (Array.isArray(arrOrObj)) {
            for (const ks of killstreakTiers) {
              const ksPrefix = ks ? ks + ' ' : '';
              // Only add quality if not Unique (6) and not Unusual (5)
              const prefix = qualityId !== '6' && qualityId !== '5' ? qualityName + ' ' : '';
              names.push(`${ksPrefix}${prefix}${itemName}`.trim());
            }
          }
        }
      }
    }
  }
  return [...new Set(names)];
}

module.exports = { getBptfPrices, getBptfItemPrice, getAllPricedItemNamesWithEffects };
