var Methods = function() {};
var fs = require('fs');

const axios = require('axios');

const config = require('./config.json');

Methods.prototype.halfScrapToRefined = function(halfscrap) {
    var refined = parseFloat((halfscrap / 18).toString().match(/^-?\d+(?:\.\d{0,2})?/)[0]);
    return refined;
};

Methods.prototype.refinedToHalfScrap = function(refined) {
    var halfScrap = parseFloat((refined * 18).toString().match(/^-?\d+(?:\.\d{0,2})?/)[0]);
    return halfScrap;
};

// Rounds the metal value to the nearest scrap.
Methods.prototype.getRight = function(v) {
    var i = Math.floor(v),
        f = Math.round((v - i) / 0.11);
    return parseFloat((i + (f === 9 || f * 0.11)).toFixed(2));
};

// This method first takes the amount of keys the item costs and multiplies it by
// the current key metal sell price. This gives us the amount of metal the key cost
// is worth in terms of a keys current sell price. Then it adds this result onto
// the metal cost. It's then rounded down to the nearest 0.11.

// From here, the metal (being both the worth of the keys and the metal value), is
// divided into the sell price of a key. Totalling the amount of keys that could be
// afforded with the pure metal value. The metal component is calculated by taking the
// remainder of the rounded total value divided by keyPrice. This gives the amount of
// metal that couldn't be converted into a whole key.

// This method ensures we make prices that take into account the current price of the key.
Methods.prototype.parsePrice = function(original, keyPrice) {
    var metal = this.getRight(original.keys * keyPrice) + original.metal;
    return {
        keys: Math.trunc(metal / keyPrice),
        metal: this.getRight(metal % keyPrice)
    };
};

Methods.prototype.toMetal = function(obj, keyPriceInMetal) {
    var metal = 0;
    metal += obj.keys * keyPriceInMetal;
    metal += obj.metal;
    return this.getRight(metal);
};

Methods.prototype.calculatePercentageDifference = function(value1, value2) {
    if (value1 === 0) {
        return value2 === 0 ? 0 : 100; // Handle division by zero
    }
    return ((value2 - value1) / Math.abs(value1)) * 100;
};

Methods.prototype.getItemPriceFromExternalPricelist = function(sku, external_pricelist) {
    let items = external_pricelist.items;

    for (const item of items) {
        if (item.sku === sku) {
            var pricetfItem = item;
            // Source is autobot, no real formatting needed.
            return {
                pricetfItem
            };
        }
    }
    throw new Error('Item not found in external pricelist.');
};

// Calculate percentage differences and decide on rejecting or accepting the autopricers price
// based on limits defined in config.json.
Methods.prototype.calculatePricingAPIDifferences = function(pricetfItem, final_buyObj, final_sellObj, keyobj) {
    var percentageDifferences = {};

    var sell_Price_In_Metal = this.toMetal(final_sellObj, keyobj.metal);
    var buy_Price_In_Metal = this.toMetal(final_buyObj, keyobj.metal);

    var priceTFSell = {};
    priceTFSell.keys = pricetfItem.sell.keys;
    priceTFSell.metal = pricetfItem.sell.metal;

    var priceTFBuy = {};
    priceTFBuy.keys = pricetfItem.buy.keys;
    priceTFBuy.metal = pricetfItem.buy.metal;

    var priceTF_Sell_Price_In_Metal = this.toMetal(priceTFSell, keyobj.metal);
    var priceTF_Buy_Price_In_Metal = this.toMetal(priceTFBuy, keyobj.metal);

    var results = {};
    results.priceTFSellPrice = priceTF_Sell_Price_In_Metal;
    results.autopricerSellPrice = sell_Price_In_Metal;
    results.priceTFBuyPrice = priceTF_Buy_Price_In_Metal;
    results.autopricerBuyPrice = buy_Price_In_Metal;

    percentageDifferences.buyDifference = this.calculatePercentageDifference(
        results.priceTFBuyPrice,
        results.autopricerBuyPrice
    );
    percentageDifferences.sellDifference = this.calculatePercentageDifference(
        results.priceTFSellPrice,
        results.autopricerSellPrice
    );

    // Ensures that data we're going to use in comparison are numbers. If not we throw an error.
    if (isNaN(percentageDifferences.buyDifference) || isNaN(percentageDifferences.sellDifference)) {
        // Can't compare percentages because the external API likely returned malformed data.
        throw new Error('External API returned NaN. Critical error.');
    }
    // Calls another method that uses this percentage difference object to make decision on whether to use our autopricers price or not.
    try {
        var usePrice = this.validatePrice(percentageDifferences);
        // We should use this price, resolves as true.
        return usePrice;
    } catch (e) {
        // We should not use this price.
        throw new Error(e);
    }
};

Methods.prototype.validatePrice = function(percentageDifferences) {
    // If the percentage difference in how much our pricer has determined we should buy an item
    // for compared to prices.tf is greater than the limit set in the config, we reject the price.

    // And if the percentage difference in how much our pricer has determined we should sell an item
    // for compared to prices.tf is less than the limit set in the config, we reject the price.

    // A greater percentage difference for buying, means that our pricer is buying for more than prices.tf.
    // A lesser percentage difference for selling, means that our pricer is selling for less than prices.tf.
    if (percentageDifferences.buyDifference > config.maxPercentageDifferences.buy) {
        throw new Error('Autopricer is buying for too much.');
    } else if (percentageDifferences.sellDifference < config.maxPercentageDifferences.sell) {
        throw new Error('Autopricer is selling for too cheap.');
    }
    return true;
};

Methods.prototype.waitXSeconds = async function(seconds) {
    return new Promise(resolve => {
        // Convert to miliseconds and then set timeout.
        setTimeout(resolve, seconds * 1000);
    });
};

Methods.prototype.validateObject = function(obj) {
    if (Object.keys(obj).length !== 2 || !obj.hasOwnProperty('metal') || !obj.hasOwnProperty('keys')) {
        // The object contains unexpected keys or is missing the expected key.
        return false;
    }
    // The object is valid and only contains the expected key.
    return true;
};

const comparePrices = (item1, item2) => {
    return item1.keys === item2.keys && item1.metal === item2.metal;
};

Methods.prototype.addToPricelist = function(item, PRICELIST_PATH) {
    try {
        const data = fs.readFileSync(PRICELIST_PATH, 'utf8');

        // Parse the existing JSON content into a JavaScript object
        let existingData = JSON.parse(data);
        let items = existingData.items;

        // Ensure the existing data is an array (if it's not, create an array)
        if (!Array.isArray(existingData.items)) {
            items = [];
        }

        const existingIndex = items.findIndex(pricelist_item => pricelist_item.sku === item.sku);

        if (existingIndex !== -1) {
            let pl_item = items[existingIndex];
            if (item.buy && item.sell && pl_item.buy && pl_item.sell) {
                if (comparePrices(pl_item.buy, item.buy) && comparePrices(pl_item.sell, item.sell)) {
                    // Prices are the same, no need to update.
                    return;
                } else {
                    // Prices are different, update.
                    items[existingIndex] = item;
                }
            } else if (item.buy && item.sell && (!pl_item.buy || !pl_item.sell)) {
                // We have a buy and sell price, but the pricelist item doesn't.
                items[existingIndex] = item;
            } else {
                // Data is missing, don't update.
                return;
            }
        } else {
            // If the item doesn't exist, add it to the end of the array
            items.push(item);
        }

        // Stringify the updated data back to JSON
        const updatedData = JSON.stringify(existingData, null, 2); // 2 is for indentation

        // Write the updated JSON back to the file synchronously
        fs.writeFileSync(PRICELIST_PATH, updatedData, 'utf8');
    } catch (error) {
        console.error('Error:', error);
    }
};

// Request related methods.

Methods.prototype.getListingsFromSnapshots = async function(name) {
    try {
        // Endpoint is limited to 1 request per 60 seconds.
        await this.waitXSeconds(1);
        const response = await axios.get(`https://backpack.tf/api/classifieds/listings/snapshot`, {
            params: {
                sku: name,
                appid: 440,
                token: config.bptfToken
            }
        });
        if (response.status === 200) {
            const listings = response.data.listings;
            return listings;
        } else {
            throw new Error("Rate limited.");
        }
    } catch (error) {
        throw error;
    }
};

Methods.prototype.getJWTFromPricesTF = async function(page, limit) {
    let tries = 1;

    while (tries <= 5) {
        try {
            const response = await axios.post('https://api2.prices.tf/auth/access');
            if (response.status === 200) {
                const axiosConfig = {
                    headers: {
                        Authorization: `Bearer ${response.data.accessToken}`
                    },
                    params: {
                        page: page,
                        limit: limit
                    }
                };
                return axiosConfig;
            }
        } catch (error) {
            // Added in rare case we get rate limited requesting a JWT.
            if (error?.status === 429 || error?.response?.data.statusCode === 429) {
                // Retry in 60 seconds.
                await this.waitXSeconds(60);
            }
            console.log('Error occurred getting auth token from prices.tf, retrying...');
        }

        tries++;
    }

    throw new Error('An error occurred while getting authenticated with Prices.tf');
};

Methods.prototype.getKeyPriceFromPricesTF = async function() {
    try {
        const axiosConfig = await this.getJWTFromPricesTF(1, 100);

        let tries = 1;
        while (tries <= 5) {
            const response = await axios.get('https://api2.prices.tf/prices/5021;6', axiosConfig);

            if (response.status === 200) {
                const sellMetal = Methods.halfScrapToRefined(response.data.sellHalfScrap);
                return {
                    metal: sellMetal
                };
            }

            tries++;
        }

        throw new Error('Failed to get key price from Prices.TF. It is either down or we are being rate-limited.');
    } catch (error) {
        throw error;
    }
};

Methods.prototype.getKeyFromExternalAPI = async function() {
    let key_object = {};

    try {
        const axiosConfig = await this.getJWTFromPricesTF(1, 100);

        let tries = 1;
        while (tries <= 5) {
            const response = await axios.get('https://api2.prices.tf/prices/5021;6', axiosConfig);

            if (response.status === 200) {
                key_object.name = 'Mann Co. Supply Crate Key';
                key_object.sku = '5021;6';
                key_object.source = 'bptf';

                let buyKeys = Object.is(response.data.buyKeys, undefined) ? 0 : response.data.buyKeys;

                let buyMetal = this.halfScrapToRefined(
                    Object.is(response.data.buyHalfScrap, undefined) ? 0 : response.data.buyHalfScrap
                );

                key_object.buy = {
                    keys: buyKeys,
                    metal: buyMetal
                };

                let sellKeys = Object.is(response.data.sellKeys, undefined) ? 0 : response.data.sellKeys;

                let sellMetal = this.halfScrapToRefined(
                    Object.is(response.data.sellHalfScrap, undefined) ? 0 : response.data.sellHalfScrap
                );

                key_object.sell = {
                    keys: sellKeys,
                    metal: sellMetal
                };

                key_object.time = Math.floor(Date.now() / 1000);

                return key_object;
            }

            // Wait 10 seconds between retries. I want to ensure that this succeeds as the key price is very important.
            await this.waitXSeconds(10);
            tries++;
        }

        throw new Error('Failed to get key price from Prices.TF. It is either down or we are being rate-limited.');
    } catch (error) {
        throw error;
    }
};

Methods.prototype.getExternalPricelist = async function() {
    // We attempt to get the cached version
    // of the prices.tf list from autobot.tf
    try {
        const autobotResponse = await axios.get('https://autobot.tf/json/pricelist-array');
        if (autobotResponse.data.items.length > 0) {
            // The response has actually provided prices.
            var pricesTF_Pricelist = autobotResponse.data;
            return pricesTF_Pricelist;
        } else {
            throw new Error("No items in external pricelist.");
        }
    } catch (e) {
        throw new Error("Couldn't fetch external pricelist from autobot.tf", e);
    }
};

module.exports = Methods;