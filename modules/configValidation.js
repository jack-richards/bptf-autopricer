const fs = require('fs');

const DEFAULTS = {
  bptfAPIKey: '',
  bptfToken: '',
  steamAPIKey: '',
  database: {
    schema: 'tf2',
    host: 'localhost',
    port: 5432,
    name: 'bptf-autopricer',
    user: 'postgres',
    password: '',
  },
  pricerPort: 3456,
  maxPercentageDifferences: {
    buy: 5,
    sell: -8,
  },
  alwaysQuerySnapshotAPI: false,
  fallbackOntoPricesTf: false,
  excludedSteamIDs: [],
  trustedSteamIDs: [],
  excludedListingDescriptions: [],
  blockedAttributes: {},
  minSellMargin: 0.11,
  priceSwingLimits: {
    maxBuyIncrease: 0.1,
    maxSellDecrease: 0.1,
  },
};

function deepMerge(target, src) {
  for (const key in src) {
    if (typeof src[key] === 'object' && src[key] !== null && !Array.isArray(src[key])) {
      if (!target[key]) {
        target[key] = {};
      }
      deepMerge(target[key], src[key]);
    } else if (target[key] === undefined) {
      target[key] = src[key];
    }
  }
  return target;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const REQUIRED_FIELDS = ['bptfAPIKey', 'bptfToken', 'steamAPIKey', 'database', 'pricerPort'];

function validateConfig(configPath) {
  let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const original = deepClone(config);

  // Add missing defaults
  const merged = deepMerge(config, DEFAULTS);

  // If any keys were added, save the config
  if (JSON.stringify(original) !== JSON.stringify(merged)) {
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  }

  // Check for required top-level fields
  for (const field of REQUIRED_FIELDS) {
    if (merged[field] === undefined) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }
  // Check for required database fields
  const db = merged.database;
  const dbRequired = ['schema', 'host', 'port', 'name', 'user', 'password'];
  for (const field of dbRequired) {
    if (db[field] === undefined) {
      throw new Error(`Missing required database config field: ${field}`);
    }
  }

  return merged;
}

module.exports = { validateConfig };
