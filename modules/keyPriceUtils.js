async function insertKeyPrice(db, keyobj, buyPrice, sellPrice, timestamp) {
  const lowerBound = keyobj.metal * 0.8; // 20% lower than the key's metal value
  const upperBound = keyobj.metal * 1.2; // 20% higher than the key's metal value

  if (
    buyPrice < lowerBound ||
    buyPrice > upperBound ||
    sellPrice < lowerBound ||
    sellPrice > upperBound
  ) {
    console.warn(`Abnormal key price rejected. Buy: ${buyPrice}, Sell: ${sellPrice}`);
    return;
  }

  try {
    await db.none(
      `INSERT INTO key_prices (sku, buy_price_metal, sell_price_metal, timestamp) 
            VALUES ($1, $2, $3, $4)`,
      ['5021;6', buyPrice, sellPrice, timestamp]
    );
  } catch {
    console.error('Error inserting key price');
  }
}

async function cleanupOldKeyPrices(db) {
  try {
    await db.none("DELETE FROM key_prices WHERE created_at < NOW() - INTERVAL '30 days'");
    console.log('Cleaned up key prices older than 30 days.');
  } catch {
    console.error('Error cleaning up old key prices');
  }
}

function sendPriceAlert(message) {
  console.log(`ALERT: ${message}`);
  // Integrate with notification system if needed
}

async function adjustPrice({
  name,
  sku,
  newBuyPrice,
  newSellPrice,
  Methods,
  PRICELIST_PATH,
  socketIO,
}) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const updatedItem = {
      name: name,
      sku: sku,
      source: 'bptf',
      buy: {
        keys: 0,
        metal: newBuyPrice,
      },
      sell: {
        keys: 0,
        metal: newSellPrice,
      },
      time: timestamp,
    };

    Methods.addToPricelist(updatedItem, PRICELIST_PATH);
    socketIO.emit('price', updatedItem);

    console.log(`Price for ${name} updated. Buy: ${newBuyPrice}, Sell: ${newSellPrice}`);
  } catch {
    console.error('Error adjusting price');
  }
}

async function checkKeyPriceStability({ db, Methods, adjustPrice, sendPriceAlert, socketIO }) {
  const CHANGE_THRESHOLD = 0.33;
  const STD_THRESHOLD = 0.66; // You can move this to config if you want
  try {
    const [{ avg_buy: buyA, avg_sell: sellA, std_buy: stdBuyA, std_sell: stdSellA }] =
      await db.any(`
            SELECT
                AVG(buy_price_metal)::float AS avg_buy,
                AVG(sell_price_metal)::float AS avg_sell,
                STDDEV_POP(buy_price_metal)::float AS std_buy,
                STDDEV_POP(sell_price_metal)::float AS std_sell
            FROM key_prices
            WHERE sku = '5021;6'
              AND created_at BETWEEN NOW() - INTERVAL '3 hours' AND NOW();
        `);
    const [{ avg_buy: buyB, avg_sell: sellB }] = await db.any(`
            SELECT
                AVG(buy_price_metal)::float AS avg_buy,
                AVG(sell_price_metal)::float AS avg_sell
            FROM key_prices
            WHERE sku = '5021;6'
              AND created_at BETWEEN NOW() - INTERVAL '6 hours' AND NOW() - INTERVAL '3 hours';
        `);

    // eslint-disable-next-line eqeqeq
    if (buyA == null || sellA == null || buyB == null || sellB == null) {
      console.log('Not enough data in one of the 3-hour windows—skipping volatility check.');
      return;
    }

    // Additional stddev check
    if (stdSellA > STD_THRESHOLD || stdBuyA > STD_THRESHOLD) {
      sendPriceAlert(
        `High key price volatility detected (std sell: ${stdSellA}, std buy: ${stdBuyA})`
      );
      return;
    }

    const sellDelta = sellA - sellB;
    const buyDelta = buyA - buyB;

    let rawSell = sellA;
    let rawBuy = buyA;
    const MIN_STEP = 0.33;

    if (Math.abs(sellDelta) > CHANGE_THRESHOLD) {
      rawSell += sellDelta > 0 ? +0.11 : -0.11;
      let roundedSell = Methods.getRight(rawSell);
      let roundedBuy = Methods.getRight(rawBuy);

      if (roundedSell - roundedBuy < MIN_STEP) {
        rawBuy = rawSell - MIN_STEP;
        roundedBuy = Methods.getRight(rawBuy);
      }

      await adjustPrice({
        name: 'Mann Co. Supply Crate Key',
        sku: '5021;6',
        newBuyPrice: roundedBuy,
        newSellPrice: roundedSell,
        Methods,
        PRICELIST_PATH: './files/pricelist.json',
        socketIO,
      });
      return sendPriceAlert(
        `3h sell avg moved by ${sellDelta.toFixed(2)} → adjusting to ${roundedSell}`
      );
    }

    if (Math.abs(buyDelta) > CHANGE_THRESHOLD) {
      rawBuy += buyDelta > 0 ? -0.11 : +0.11;
      let roundedSell = Methods.getRight(rawSell);
      let roundedBuy = Methods.getRight(rawBuy);

      if (roundedSell - roundedBuy < MIN_STEP) {
        rawBuy = rawSell - MIN_STEP;
        roundedBuy = Methods.getRight(rawBuy);
      }

      await adjustPrice({
        name: 'Mann Co. Supply Crate Key',
        sku: '5021;6',
        newBuyPrice: roundedBuy,
        newSellPrice: roundedSell,
        Methods,
        PRICELIST_PATH: './files/pricelist.json',
        socketIO,
      });
      return sendPriceAlert(
        `3h buy avg moved by ${buyDelta.toFixed(2)} → adjusting to ${roundedBuy}`
      );
    }

    const tempRoundedSell = Methods.getRight(rawSell);
    const tempRoundedBuy = Methods.getRight(rawBuy);

    if (tempRoundedSell - tempRoundedBuy <= MIN_STEP) {
      rawBuy = rawSell - MIN_STEP;
      const roundedBuy = Methods.getRight(rawBuy);
      const roundedSell = Methods.getRight(rawSell);
      await adjustPrice({
        name: 'Mann Co. Supply Crate Key',
        sku: '5021;6',
        newBuyPrice: roundedBuy,
        newSellPrice: roundedSell,
        Methods,
        PRICELIST_PATH: './files/pricelist.json',
        socketIO,
      });
      return sendPriceAlert(
        `Spread too tight (${(roundedSell - Methods.getRight(rawBuy + MIN_STEP)).toFixed(2)}); ` +
          `forcing buy to ${roundedBuy} so buy + ${MIN_STEP.toFixed(2)} ≤ sell (${roundedSell}).`
      );
    }

    const roundedSell = Methods.getRight(rawSell);
    const roundedBuy = Methods.getRight(rawBuy);

    await adjustPrice({
      name: 'Mann Co. Supply Crate Key',
      sku: '5021;6',
      newBuyPrice: roundedBuy,
      newSellPrice: roundedSell,
      Methods,
      PRICELIST_PATH: './files/pricelist.json',
      socketIO,
    });
    console.log(
      `Stable over last 6h (windows avg buy=${roundedBuy}, sell=${roundedSell}). Change delta for buy=${buyDelta} and change delta for sell=${sellDelta}`
    );
  } catch (err) {
    console.error('Error checking key price stability:', err);
  }
}

module.exports = {
  insertKeyPrice,
  cleanupOldKeyPrices,
  sendPriceAlert,
  adjustPrice,
  checkKeyPriceStability,
};
