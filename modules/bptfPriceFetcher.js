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
  // eslint-disable-next-line spellcheck/spell-checker
  // SKU (defindex;quality;Effect;...;australium)
  const parts = sku.split(';');
  const defindex = parts[0];
  const quality = parts[1];
  const effectPart = parts[2];
  const effect = effectPart && effectPart.startsWith('u') ? effectPart.slice(1) : null;
  const isAustralium = parts.includes('australium');

  // Find all items with this defindex
  const candidates = Object.entries(items).filter(
    // eslint-disable-next-line spellcheck/spell-checker
    // eslint-disable-next-line no-unused-vars
    ([name, item]) => item.defindex && item.defindex.includes(Number(defindex))
  );

  // eslint-disable-next-line spellcheck/spell-checker
  // Prefer Australium-named item if SKU has australium
  let itemEntry;
  if (isAustralium) {
    itemEntry = candidates.find(([name]) => name.toLowerCase().includes('australium'));
  }
  // Otherwise, prefer non-Australium
  if (!itemEntry) {
    itemEntry = candidates.find(([name]) => !name.toLowerCase().includes('australium'));
  }
  // Fallback to first candidate
  if (!itemEntry && candidates.length > 0) {
    itemEntry = candidates[0];
  }
  if (!itemEntry) {
    return null;
  }

  const item = itemEntry[1];
  if (!item.prices || !item.prices[quality]) {
    return null;
  }

  const tradable = item.prices[quality].Tradable;
  if (!tradable || !tradable.Craftable) {
    return null;
  }

  // For unusuals, find the correct effect
  if (quality === '5' && effect) {
    if (Array.isArray(tradable.Craftable)) {
      // Craftable is an array for unusuals (rare, but handle just in case)
      const effectObj = tradable.Craftable.find(
        (e) => String(e.effect) === effect && (!isAustralium || e.australium)
      );
      if (effectObj) {
        return effectObj;
      }
      // fallback to just effect match
      const fallbackEffectObj = tradable.Craftable.find((e) => String(e.effect) === effect);
      return fallbackEffectObj || tradable.Craftable[0];
    } else {
      // Craftable is an object keyed by effect ID
      const craftableArr = Object.entries(tradable.Craftable).map(([effectId, obj]) => ({
        ...obj,
        effect: effectId, // inject effect ID as property
      }));
      const effectObj = craftableArr.find(
        (e) => String(e.effect) === effect && (!isAustralium || e.australium)
      );
      if (effectObj) {
        return effectObj;
      }
      // fallback to just effect match
      const fallbackEffectObj = craftableArr.find((e) => String(e.effect) === effect);
      return fallbackEffectObj;
    }
  }

  // For australium, pick the entry with australium: true if present
  if (isAustralium && Array.isArray(tradable.Craftable)) {
    const aussieEntry = tradable.Craftable.find((e) => e.australium === true);
    if (aussieEntry) {
      return aussieEntry;
    }
  }

  // Otherwise, just return the first
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
            // Only add effect name for Unusuals (qualityId === '5')
            if (qualityId === '5') {
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
            } else {
              // For non-unusuals, do NOT prepend effect name
              for (const ks of killstreakTiers) {
                const ksPrefix = ks ? ks + ' ' : '';
                const prefix = qualityId !== '6' && qualityId !== '5' ? qualityName + ' ' : '';
                names.push(`${ksPrefix}${prefix}${itemName}`.trim());
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
