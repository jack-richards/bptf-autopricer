const pLimit = require('p-limit').default;

async function updateMovingAverages(db, pgp, alpha = 0.35) {
  if (alpha <= 0 || alpha > 1) {
    throw new Error('Alpha must be between 0 (exclusive) and 1 (inclusive).');
  }
  const stats = await db.any(`
        SELECT sku, current_count, moving_avg_count,
               current_buy_count, moving_avg_buy_count,
               current_sell_count, moving_avg_sell_count
        FROM listing_stats
    `);
  if (stats.length === 0) {
    return;
  }

  // clampAndRound ensures all moving averages:
  // - are rounded to 2 decimal places (e.g., 1.2345 -> 1.23)
  // - never go below the minimum value (default 0.05, which is already very small for item averages)
  // This prevents extremely small values that could cause database errors with float columns.
  const clampAndRound = (val, min = 0.05) => Math.max(min, Math.round(val * 100) / 100);

  const updates = stats
    .map((row) => {
      const prevAvg = row.moving_avg_count ?? row.current_count;
      const prevBuyAvg = row.moving_avg_buy_count ?? row.current_buy_count;
      const prevSellAvg = row.moving_avg_sell_count ?? row.current_sell_count;
      // Calculate new averages
      let newAvg = alpha * row.current_count + (1 - alpha) * prevAvg;
      let newBuyAvg = alpha * row.current_buy_count + (1 - alpha) * prevBuyAvg;
      let newSellAvg = alpha * row.current_sell_count + (1 - alpha) * prevSellAvg;
      // Clamp and round to 2 decimals, minimum 0.05
      newAvg = clampAndRound(newAvg);
      newBuyAvg = clampAndRound(newBuyAvg);
      newSellAvg = clampAndRound(newSellAvg);
      return {
        sku: row.sku,
        moving_avg_count: newAvg,
        moving_avg_buy_count: newBuyAvg,
        moving_avg_sell_count: newSellAvg,
      };
    })
    .filter((u) => {
      const orig = stats.find((r) => r.sku === u.sku);
      return (
        Math.abs((orig.moving_avg_count ?? orig.current_count) - u.moving_avg_count) > 1e-6 ||
        Math.abs((orig.moving_avg_buy_count ?? orig.current_buy_count) - u.moving_avg_buy_count) >
          1e-6 ||
        Math.abs(
          (orig.moving_avg_sell_count ?? orig.current_sell_count) - u.moving_avg_sell_count
        ) > 1e-6
      );
    });

  if (updates.length === 0) {
    console.log('No moving averages changed.');
    return;
  }

  const cs = new pgp.helpers.ColumnSet(
    ['sku', 'moving_avg_count', 'moving_avg_buy_count', 'moving_avg_sell_count'],
    { table: 'tmp' }
  );
  const values = pgp.helpers.values(updates, cs);

  try {
    await db.none(`
            UPDATE listing_stats AS ls
            SET moving_avg_count = tmp.moving_avg_count,
                moving_avg_buy_count = tmp.moving_avg_buy_count,
                moving_avg_sell_count = tmp.moving_avg_sell_count,
                last_updated = NOW()
            FROM (VALUES ${values}) AS tmp(sku, moving_avg_count, moving_avg_buy_count, moving_avg_sell_count)
            WHERE ls.sku = tmp.sku
        `);

    // Fetch and log updated rows for validation
    const updatedSkus = updates.map((u) => u.sku);
    const updatedRows = await db.any(
      'SELECT sku, moving_avg_count, moving_avg_buy_count, moving_avg_sell_count FROM listing_stats WHERE sku IN ($1:csv) ORDER BY sku',
      [updatedSkus]
    );
    console.log('Updated moving averages:', updatedRows);
  } catch (err) {
    console.error('Error updating moving averages:', err);
  }
}

async function updateListingStats(db, sku) {
  const { overall, buy, sell } = await db.one(
    `SELECT
            COUNT(*) AS overall,
            COUNT(*) FILTER (WHERE intent = 'buy') AS buy,
            COUNT(*) FILTER (WHERE intent = 'sell') AS sell
         FROM listings WHERE sku = $1`,
    [sku]
  );
  await db.none(
    `
        INSERT INTO listing_stats (sku, current_count, current_buy_count, current_sell_count, last_updated)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (sku) DO UPDATE SET
            current_count = $2,
            current_buy_count = $3,
            current_sell_count = $4,
            last_updated = NOW()
    `,
    [sku, overall, buy, sell]
  );
  //console.log(`Updated stats for SKU ${sku}: overall=${overall}, buy=${buy}, sell=${sell}`);
}

async function initializeListingStats(db) {
  const skus = await db.any('SELECT DISTINCT sku FROM listings');
  console.log(`Initializing listing stats for ${skus.length} SKUs...`);
  const limit = pLimit(10);
  await Promise.all(skus.map(({ sku }) => limit(() => updateListingStats(db, sku))));
  console.log('Listing stats initialized.');
}

module.exports = {
  updateMovingAverages,
  updateListingStats,
  initializeListingStats,
};
