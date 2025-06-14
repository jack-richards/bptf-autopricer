// This file is part of the BPTF Autopricer project.
// It is a Node.js application that connects to Backpack.tf's WebSocket API,
const fs = require("fs");
const chokidar = require("chokidar");
const methods = require("./methods");
const Methods = new methods();
const path = require("path");
const { validateConfig } = require("./modules/configValidation");
const CONFIG_PATH = path.resolve(__dirname, "config.json");
const config = validateConfig(CONFIG_PATH);
const PriceWatcher = require("./modules/PriceWatcher"); //outdated price logging
const Schema = require("@tf2autobot/tf2-schema");
const SCHEMA_PATH = "./schema.json";
// Paths to the pricelist and item list files.
const PRICELIST_PATH = "./files/pricelist.json";
const ITEM_LIST_PATH = "./files/item_list.json";
const { listen, socketIO } = require("./API/server.js");
const { startPriceWatcher } = require("./modules/index");
const scheduleTasks = require("./modules/scheduler");

const {
  sendPriceAlert,
  cleanupOldKeyPrices,
  insertKeyPrice,
  adjustPrice,
  checkKeyPriceStability,
} = require("./modules/keyPriceUtils");

const {
  updateMovingAverages,
  updateListingStats,
  initializeListingStats,
} = require("./modules/listingAverages");

const {
  getListings,
  insertListing,
  deleteRemovedListing,
  deleteOldListings,
} = require("./modules/listings");
const logDir = path.join(__dirname, "logs");
const logFile = path.join(logDir, "websocket.log");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// Steam API key is required for the schema manager to work.
const schemaManager = new Schema({
  apiKey: config.steamAPIKey,
});

// Steam IDs of bots that we want to ignore listings from.
const excludedSteamIds = config.excludedSteamIDs;

// Steam IDs of bots that we want to prioritise listings from.
const prioritySteamIds = config.trustedSteamIDs;

// Listing descriptions that we want to ignore.
const excludedListingDescriptions = config.excludedListingDescriptions;

// Blocked attributes that we want to ignore. (Paints, parts, etc.)
const blockedAttributes = config.blockedAttributes;

const fallbackOntoPricesTf = config.fallbackOntoPricesTf;

// Create database instance for pg-promise.
const createDb = require("./modules/db");
const { db, pgp, cs } = createDb(config);

if (fs.existsSync(SCHEMA_PATH)) {
  // A cached schema exists.

  // Read and parse the cached schema.
  const cachedData = JSON.parse(fs.readFileSync(SCHEMA_PATH), "utf8");

  // Set the schema data.
  schemaManager.setSchema(cachedData);
}

// Pricelist doesn't exist.
if (!fs.existsSync(PRICELIST_PATH)) {
  try {
    fs.writeFileSync(PRICELIST_PATH, '{"items": []}', "utf8");
  } catch (err) {
    console.error(err);
  }
}

// Item list doesn't exist.
if (!fs.existsSync(ITEM_LIST_PATH)) {
  try {
    fs.writeFileSync(ITEM_LIST_PATH, '{"items": []}', "utf8");
  } catch (err) {
    console.error(err);
  }
}

// This event is emitted when the schema has been fetched.
schemaManager.on("schema", function (schema) {
  // Writes the schema data to disk.
  fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema.toJSON()));
});

var keyobj;
var external_pricelist;

const updateKeyObject = async () => {
  let key_item;

  try {
    // Primary: Prices.TF API
    key_item = await Methods.getKeyFromExternalAPI();
  } catch (e) {
    console.error("Prices.TF API failed, falling back to autobot.tf pricelist");

    // 2a) fetch the external pricelist
    const externalPricelist = await Methods.getExternalPricelist();

    // 2b) grab the item with the same SKU
    const { pricetfItem } = Methods.getItemPriceFromExternalPricelist(
      "5021;6",
      externalPricelist,
    );

    // 2c) reshape to match the key_item interface
    key_item = {
      name: pricetfItem.name || "Mann Co. Supply Crate Key", // or whatever defaults you prefer
      sku: "5021;6",
      source: "bptf",
      buy: {
        keys: pricetfItem.buy.keys,
        metal: pricetfItem.buy.metal,
      },
      sell: {
        keys: pricetfItem.sell.keys,
        metal: pricetfItem.sell.metal,
      },
      time: Math.floor(Date.now() / 1000),
    };
  }

  // 3) Now key_item is guaranteed to be defined
  Methods.addToPricelist(key_item, PRICELIST_PATH);

  keyobj = {
    metal: key_item.sell.metal,
  };

  socketIO.emit("price", key_item);
};

const { initBptfWebSocket } = require("./websocket/bptfWebSocket");

// Load item names and bounds from item_list.json
const createItemListManager = require("./modules/itemList");
const itemListManager = createItemListManager(ITEM_LIST_PATH);
const { loadNames, watchItemList, getAllowedItemNames, getItemBounds } =
  itemListManager;
watchItemList();

const calculateAndEmitPrices = async () => {
  // Delete old listings from database.
  await deleteOldListings(db);
  // If the allowedItemNames is empty, we skip the pricing process.
  let item_objects = [];
  for (const name of getAllowedItemNames()) {
    try {
      // Get sku of item via the item name.
      let sku = schemaManager.schema.getSkuFromName(name);
      // Start process of pricing item.
      let arr = await determinePrice(name, sku);
      let item = await finalisePrice(arr, name, sku);
      // If the item is undefined, we skip it.
      if (!item) {
        continue;
      }
      // If item is priced at 0, we skip it. Autobot cache of the prices.tf pricelist can sometimes have items set as such.
      if (
        (item.buy.keys === 0 && item.buy.metal === 0) ||
        (item.sell.keys === 0 && item.sell.metal === 0)
      ) {
        throw new Error(
          "Autobot cache of prices.tf pricelist has marked item with price of 0.",
        );
      }

      // If it's a key (sku 5021;6), insert the price into the key_prices table
      if (sku === "5021;6") {
        const buyPrice = item.buy.metal;
        const sellPrice = item.sell.metal;
        const timestamp = Math.floor(Date.now() / 1000);
        await insertKeyPrice(db, keyobj, buyPrice, sellPrice, timestamp);
        continue;
      }

      // Save item to pricelist. Pricelist.json is mainly used by the pricing API.
      Methods.addToPricelist(item, PRICELIST_PATH);
      // Instead of emitting item here, we store it in a array, so we can emit all items at once.
      // This allows us to control the speed at which we emit items to the client.
      // Up to your own discretion whether this is needed or not.
      item_objects.push(item);
    } catch (e) {
      console.log("Couldn't create a price for " + name);
    }
  }
  // Emit all items within extremely quick succession of eachother.
  // With a 0.3 second gap between each.
  for (const item of item_objects) {
    // Emit item object.
    await Methods.waitXSeconds(0.3);
    socketIO.emit("price", item);
  }
};

// When the schema manager is ready we proceed.
schemaManager.init(async function (err) {
  if (err) throw err;

  // Start watching pricelist.json for “old” entries
  // pricelist.json lives in ./files/pricelist.json relative to this file:
  const pricelistPath = path.resolve(__dirname, "./files/pricelist.json");
  // You can pass a custom ageThresholdSec (default is 2*3600) and intervalSec (default is 300)
  PriceWatcher.watchPrices(pricelistPath /*, ageThresholdSec, intervalSec */);

  // Get external pricelist.
  external_pricelist = await Methods.getExternalPricelist();
  // Update key object.
  await updateKeyObject();
  // Get external pricelist.
  //external_pricelist = await Methods.getExternalPricelist();
  // Calculate and emit prices on startup.
  await calculateAndEmitPrices();
  // Call this once at startup if needed
  await initializeListingStats(db);
  //InitialKeyPricingContinued
  await checkKeyPriceStability({
    db,
    Methods,
    keyobj,
    adjustPrice,
    sendPriceAlert,
    PRICELIST_PATH,
    socketIO,
  });

  // Start scheduled tasks after everything is ready
  scheduleTasks({
    updateExternalPricelist: async () => {
      external_pricelist = await Methods.getExternalPricelist();
    },
    calculateAndEmitPrices,
    cleanupOldKeyPrices: async (db) => {
      await cleanupOldKeyPrices(db);
    },
    checkKeyPriceStability: async () => {
      await checkKeyPriceStability({
        db,
        Methods,
        keyobj,
        adjustPrice,
        sendPriceAlert,
        PRICELIST_PATH,
        socketIO,
      });
    },
    updateMovingAverages: async (db, pgp) => {
      await updateMovingAverages(db, pgp);
    },
    db,
    pgp,
  });

  startPriceWatcher();
});

async function isPriceSwingAcceptable(prev, next, sku) {
  // Fetch last 5 prices from DB
  const history = await db.any(
    "SELECT buy_metal, sell_metal FROM price_history WHERE sku = $1 ORDER BY timestamp DESC LIMIT 5",
    [sku],
  );
  if (history.length === 0) return true; // No history, allow

  const avgBuy =
    history.reduce((sum, p) => sum + Number(p.buy_metal), 0) / history.length;
  const avgSell =
    history.reduce((sum, p) => sum + Number(p.sell_metal), 0) / history.length;

  const nextBuy = Methods.toMetal(next.buy, keyobj.metal);
  const nextSell = Methods.toMetal(next.sell, keyobj.metal);

  const maxBuyIncrease = config.priceSwingLimits?.maxBuyIncrease ?? 0.1;
  const maxSellDecrease = config.priceSwingLimits?.maxSellDecrease ?? 0.1;

  if (nextBuy > avgBuy && (nextBuy - avgBuy) / avgBuy > maxBuyIncrease) {
    return false;
  }
  if (nextSell < avgSell && (avgSell - nextSell) / avgSell > maxSellDecrease) {
    return false;
  }
  return true;
}

const determinePrice = async (name, sku) => {
  // Delete listings based on moving averages.
  await deleteOldListings(db);

  var buyListings = await getListings(db, name, "buy");
  var sellListings = await getListings(db, name, "sell");

  // Get the price of the item from the in-memory external pricelist.
  var data;
  try {
    data = Methods.getItemPriceFromExternalPricelist(sku, external_pricelist);
  } catch (e) {
    throw new Error(
      `| UPDATING PRICES |: Couldn't price ${name}. Issue with Prices.tf.`,
    );
  }

  var pricetfItem = data.pricetfItem;

  if (
    (pricetfItem.buy.keys === 0 && pricetfItem.buy.metal === 0) ||
    (pricetfItem.sell.keys === 0 && pricetfItem.sell.metal === 0)
  ) {
    throw new Error(`| UPDATING PRICES |: Couldn't price ${name}. Item is not priced on prices.tf, therefore we can't
        compare our average price to it's average price.`);
  }

  try {
    // Check for undefined. No listings.
    if (!buyListings || !sellListings) {
      throw new Error(`| UPDATING PRICES |: ${name} not enough listings...`);
    }

    if (buyListings.rowCount === 0 || sellListings.rowCount === 0) {
      throw new Error(`| UPDATING PRICES |: ${name} not enough listings...`);
    }
  } catch (e) {
    if (fallbackOntoPricesTf) {
      const final_buyObj = {
        keys: pricetfItem.buy.keys,
        metal: pricetfItem.buy.metal,
      };
      const final_sellObj = {
        keys: pricetfItem.sell.keys,
        metal: pricetfItem.sell.metal,
      };
      // Return prices.tf price.
      return [final_buyObj, final_sellObj];
    }
    // If we don't fallback onto prices.tf, re-throw the error.
    throw e;
  }

  // Sort buyListings into descending order of price.
  var buyFiltered = buyListings.rows.sort((a, b) => {
    let valueA = Methods.toMetal(a.currencies, keyobj.metal);
    let valueB = Methods.toMetal(b.currencies, keyobj.metal);

    return valueB - valueA;
  });

  // Sort sellListings into ascending order of price.
  var sellFiltered = sellListings.rows.sort((a, b) => {
    let valueA = Methods.toMetal(a.currencies, keyobj.metal);
    let valueB = Methods.toMetal(b.currencies, keyobj.metal);

    return valueA - valueB;
  });

  // We prioritise using listings from bots in our prioritySteamIds list.
  // I.e., we move listings by those trusted steamids to the front of the
  // array, to be used as a priority over any others.

  buyFiltered = buyListings.rows.sort((a, b) => {
    // Custom sorting logic to prioritize specific Steam IDs
    const aIsPrioritized = prioritySteamIds.includes(a.steamid);
    const bIsPrioritized = prioritySteamIds.includes(b.steamid);

    if (aIsPrioritized && !bIsPrioritized) {
      return -1; // a comes first
    } else if (!aIsPrioritized && bIsPrioritized) {
      return 1; // b comes first
    } else {
      return 0; // maintain the original order (no priority)
    }
  });

  sellFiltered = sellListings.rows.sort((a, b) => {
    // Custom sorting logic to prioritize specific Steam IDs
    const aIsPrioritized = prioritySteamIds.includes(a.steamid);
    const bIsPrioritized = prioritySteamIds.includes(b.steamid);

    if (aIsPrioritized && !bIsPrioritized) {
      return -1; // a comes first
    } else if (!aIsPrioritized && bIsPrioritized) {
      return 1; // b comes first
    } else {
      return 0; // maintain the original order (no priority)
    }
  });

  try {
    // If the buyFiltered or sellFiltered arrays are empty, we throw an error.
    let arr = getAverages(name, buyFiltered, sellFiltered, sku, pricetfItem);
    return arr;
  } catch (e) {
    throw new Error(e);
  }
};

// Function to calculate the Z-score for a given value.
// The Z-score is a measure of how many standard deviations a value is from the mean.
const calculateZScore = (value, mean, stdDev) => {
  if (stdDev === 0) {
    throw new Error("Standard deviation cannot be zero.");
  }
  return (value - mean) / stdDev;
};

const filterOutliers = (listingsArray) => {
  // Calculate mean and standard deviation of listings.
  const prices = listingsArray.map((listing) =>
    Methods.toMetal(listing.currencies, keyobj.metal),
  );
  const mean = Methods.getRight(
    prices.reduce((acc, curr) => acc + curr, 0) / prices.length,
  );
  const stdDev = Math.sqrt(
    prices.reduce((acc, curr) => acc + Math.pow(curr - mean, 2), 0) /
      prices.length,
  );

  // Filter out listings that are 3 standard deviations away from the mean.
  // To put it plainly, we're filtering out listings that are paying either
  // too little or too much compared to the mean.
  const filteredListings = listingsArray.filter((listing) => {
    const zScore = calculateZScore(
      Methods.toMetal(listing.currencies, keyobj.metal),
      mean,
      stdDev,
    );
    return zScore <= 3 && zScore >= -3;
  });

  if (filteredListings.length < 3) {
    throw new Error("Not enough listings after filtering outliers.");
  }
  // Get the first 3 buy listings from the filtered listings and calculate the mean.
  // The listings here should be free of outliers. It's also sorted in order of
  // trusted steamids (when applicable).
  var filteredMean = 0;
  for (var i = 0; i <= 2; i++) {
    filteredMean += +Methods.toMetal(
      filteredListings[i].currencies,
      keyobj.metal,
    );
  }
  filteredMean /= 3;

  // Validate the mean.
  if (!filteredMean || isNaN(filteredMean) || filteredMean === 0) {
    throw new Error("Mean calculated is invalid.");
  }

  return filteredMean;
};

const getAverages = (name, buyFiltered, sellFiltered, sku, pricetfItem) => {
  // Initialse two objects to contain the items final buy and sell prices.
  var final_buyObj = {
    keys: 0,
    metal: 0,
  };
  var final_sellObj = {
    keys: 0,
    metal: 0,
  };

  try {
    if (buyFiltered.length < 3) {
      throw new Error(
        `| UPDATING PRICES |: ${name} not enough buy listings...`,
      );
    } else if (buyFiltered.length > 3 && buyFiltered.length < 10) {
      var totalValue = {
        keys: 0,
        metal: 0,
      };
      // If there are more than 3 buy listings, we take the first 3 and calculate the mean average price.
      for (var i = 0; i <= 2; i++) {
        // If the keys or metal value is undefined, we set it to 0.
        totalValue.keys += Object.is(buyFiltered[i].currencies.keys, undefined)
          ? 0
          : buyFiltered[i].currencies.keys;
        // If the metal value is undefined, we set it to 0.
        totalValue.metal += Object.is(
          buyFiltered[i].currencies.metal,
          undefined,
        )
          ? 0
          : buyFiltered[i].currencies.metal;
      }
      final_buyObj = {
        keys: Math.trunc(totalValue.keys / i),
        metal: totalValue.metal / i,
      };
    } else {
      // Filter out outliers from set, and calculate a mean average price in terms of metal value.
      let filteredMean = filterOutliers(buyFiltered);
      // Caclulate the maximum amount of keys that can be made with the metal value returned.
      let keys = Math.trunc(filteredMean / keyobj.metal);
      // Calculate the remaining metal value after the value of the keys has been removed.
      let metal = Methods.getRight(filteredMean - keys * keyobj.metal);
      // Create the final buy object.
      final_buyObj = {
        keys: keys,
        metal: metal,
      };
    }
    // Decided to pick the very first sell listing as it's ordered by the lowest sell price. I.e., the most competitive.
    // However, I decided to prioritise 'trusted' listings by certain steamids. This may result in a very high sell price, instead
    // of a competitive one.
    if (sellFiltered.length > 0) {
      final_sellObj.keys = Object.is(sellFiltered[0].currencies.keys, undefined)
        ? 0
        : sellFiltered[0].currencies.keys;
      final_sellObj.metal = Object.is(
        sellFiltered[0].currencies.metal,
        undefined,
      )
        ? 0
        : sellFiltered[0].currencies.metal;
    } else {
      throw new Error(
        `| UPDATING PRICES |: ${name} not enough sell listings...`,
      ); // Not enough
    }

    var usePrices = false;
    try {
      // Will return true or false. True if we are ok with the autopricers price, false if we are not.
      // We use prices.tf as a baseline.
      usePrices = Methods.calculatePricingAPIDifferences(
        pricetfItem,
        final_buyObj,
        final_sellObj,
        keyobj,
      );
    } catch (e) {
      // Create an error object with a message detailing this difference.
      throw new Error(`| UPDATING PRICES |: Our autopricer determined that name ${name} should sell for : ${final_sellObj.keys} keys and 
            ${final_sellObj.metal} ref, and buy for ${final_buyObj.keys} keys and ${final_buyObj.metal} ref. Prices.tf
            determined I should sell for ${pricetfItem.sell.keys} keys and ${pricetfItem.sell.metal} ref, and buy for
            ${pricetfItem.buy.keys} keys and ${pricetfItem.buy.metal} ref. Message returned by the method: ${e.message}`);
    }

    // if-else statement probably isn't needed, but I'm just being cautious.
    if (usePrices) {
      // The final averages are returned here. But work is still needed to be done. We can't assume that the buy average is
      // going to be lower than the sell average price. So we need to check for this later.
      return [final_buyObj, final_sellObj];
    } else {
      throw new Error(`| UPDATING PRICES |: ${name} pricing average generated by autopricer is too dramatically
            different to one returned by prices.tf`);
    }
  } catch (error) {
    // If configured, we fallback onto prices.tf for the price.
    if (fallbackOntoPricesTf) {
      const final_buyObj = {
        keys: pricetfItem.buy.keys,
        metal: pricetfItem.buy.metal,
      };
      const final_sellObj = {
        keys: pricetfItem.sell.keys,
        metal: pricetfItem.sell.metal,
      };
      return [final_buyObj, final_sellObj];
    } else {
      // We rethrow the error.
      throw error;
    }
  }
};

function clamp(val, min, max) {
  // If min is not a number, we don't clamp the value.
  // If max is not a number, we don't clamp the value.
  if (typeof min === "number" && val < min) return min;
  if (typeof max === "number" && val > max) return max;
  return val;
}

const finalisePrice = async (arr, name, sku) => {
  let item = {};
  try {
    if (!arr) {
      console.log(
        `| UPDATING PRICES |:${name} couldn't be updated. CRITICAL, something went wrong in the getAverages logic.`,
      );
      throw new Error(
        "Something went wrong in the getAverages() logic. DEVELOPER LOOK AT THIS.",
      );
      // Will ensure that neither the buy, nor sell side is completely unpriced. If it is, this means we couldn't get
      // enough listings to create a price, and we also somehow bypassed our prices.tf safety check. So instead, we
      // just skip this item, disregarding the price.
    } else if (
      (arr[0].metal === 0 && arr[0].keys === 0) ||
      (arr[1].metal === 0 && arr[1].keys === 0)
    ) {
      throw new Error("Missing buy and/or sell side.");
    } else {
      // Creating item fields/filling in details.
      // Name of the item. Left as it was.
      item.name = name;
      // Add sku to item object.
      item.sku = sku;
      // If the source isn't provided as bptf it's ignored by tf2autobot.
      item.source = "bptf";
      // Generates a UNIX timestamp of the present time, used to show a client when the prices were last updated.
      item.time = Math.floor(Date.now() / 1000);

      // We're taking the buy JSON and getting the metal price from it, then rounding down to the nearest .11.
      arr[0].metal = Methods.getRight(arr[0].metal);
      // We're taking the sell JSON and getting the metal price from it, then rounding down to the nearest .11.
      arr[1].metal = Methods.getRight(arr[1].metal);

      // We are taking the buy array price as a whole, and also passing in the current selling price
      // for a key into the parsePrice method.
      // We are taking the sell array price as a whole, and also passing in the current selling price
      // for a key into the parsePrice method.
      arr[0] = Methods.parsePrice(arr[0], keyobj.metal);
      arr[1] = Methods.parsePrice(arr[1], keyobj.metal);

      // Enforce minSellMargin from config
      const minSellMargin = config.minSellMargin ?? 0.11;
      var buyInMetal = Methods.toMetal(arr[0], keyobj.metal);
      var sellInMetal = Methods.toMetal(arr[1], keyobj.metal);

      if (buyInMetal >= sellInMetal) {
        item.buy = {
          keys: arr[0].keys,
          metal: Methods.getRight(arr[0].metal),
        };
        item.sell = {
          keys: arr[0].keys,
          metal: Methods.getRight(arr[0].metal + minSellMargin),
        };
      } else {
        item.buy = {
          keys: arr[0].keys,
          metal: Methods.getRight(arr[0].metal),
        };
        item.sell = {
          keys: arr[1].keys,
          metal: Methods.getRight(arr[1].metal),
        };
      }

      // Clamp prices to bounds if set
      const bounds = getItemBounds().get(name) || {};
      // Clamp the buy and sell prices to the bounds set in the config.
      // If the bounds are not set, it will just use the default values of 0 and Infinity.
      arr[0].keys = clamp(arr[0].keys, bounds.minBuyKeys, bounds.maxBuyKeys);
      arr[0].metal = clamp(
        arr[0].metal,
        bounds.minBuyMetal,
        bounds.maxBuyMetal,
      );
      arr[1].keys = clamp(arr[1].keys, bounds.minSellKeys, bounds.maxSellKeys);
      arr[1].metal = clamp(
        arr[1].metal,
        bounds.minSellMetal,
        bounds.maxSellMetal,
      );

      // Load previous price from pricelist if available
      const pricelist = JSON.parse(fs.readFileSync(PRICELIST_PATH, "utf8"));
      const prev = pricelist.items.find((i) => i.sku === sku);

      // Only check if previous price exists
      if (prev) {
        const prevObj = { buy: prev.buy, sell: prev.sell };
        const nextObj = { buy: item.buy, sell: item.sell };
        const swingOk = await isPriceSwingAcceptable(prevObj, nextObj, sku);
        if (!swingOk) {
          console.log(
            `Price swing too large for ${name} (${sku}), skipping update.`,
          );
          return;
        }
      }

      // Save to price history
      await db.none(
        "INSERT INTO price_history (sku, buy_metal, sell_metal, timestamp) VALUES ($1, $2, $3, NOW())",
        [
          sku,
          Methods.toMetal(item.buy, keyobj.metal),
          Methods.toMetal(item.sell, keyobj.metal),
        ],
      );

      // Return the new item object with the latest price.
      return item;
    }
  } catch (err) {
    // If the autopricer failed to price the item, we don't update the items price.
    return;
  }
};

// Initialize the websocket and pass in dependencies
const rws = initBptfWebSocket({
  getAllowedItemNames,
  schemaManager,
  Methods,
  insertListing: (...args) => insertListing(db, updateListingStats, ...args),
  deleteRemovedListing: (...args) =>
    deleteRemovedListing(db, updateListingStats, ...args),
  excludedSteamIds,
  excludedListingDescriptions,
  blockedAttributes,
  logFile,
});

listen();

module.exports = { db };
