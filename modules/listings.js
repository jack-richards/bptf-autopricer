const getListings = async (db, name, intent) => {
  return await db.result('SELECT * FROM listings WHERE name = $1 AND intent = $2', [name, intent]);
};

const insertListingsBatch = async (
  pgp,
  db,
  updateListingStats,
  listings // Array of [response_item, sku, currencies, intent, steamid]
) => {
  if (listings.length === 0) {
    return;
  }

  // De-duplicate: keep only the last occurrence for each unique key
  const dedupedMap = new Map();
  for (const entry of listings) {
    const [response_item, sku, intent, steamid] = entry;
    const key = `${response_item.name}|${sku}|${intent}|${steamid}`;
    dedupedMap.set(key, entry); // overwrites previous, so last wins
  }
  const dedupedListings = Array.from(dedupedMap.values());

  const timestamp = Math.floor(Date.now() / 1000);
  const values = dedupedListings.map(([response_item, sku, currencies, intent, steamid]) => [
    response_item.name,
    sku,
    JSON.stringify(currencies),
    intent,
    timestamp,
    steamid,
  ]);

  // Use pg-promise helpers for batch insert
  const cs = new pgp.helpers.ColumnSet(
    ['name', 'sku', 'currencies', 'intent', 'updated', 'steamid'],
    { table: 'listings' }
  );
  const query =
    pgp.helpers.insert(
      values.map((v) => ({
        name: v[0],
        sku: v[1],
        currencies: v[2],
        intent: v[3],
        updated: v[4],
        steamid: v[5],
      })),
      cs
    ) +
    ` ON CONFLICT (name, sku, intent, steamid)
      DO UPDATE SET currencies = EXCLUDED.currencies, updated = EXCLUDED.updated;`;

  await db.none(query);

  // Optionally, update stats for all unique skus
  const uniqueSkus = [...new Set(values.map((v) => v[1]))];
  await Promise.all(uniqueSkus.map((sku) => updateListingStats(db, sku)));
};

const insertListing = async (
  db,
  updateListingStats,
  response_item,
  sku,
  currencies,
  intent,
  steamid
) => {
  let timestamp = Math.floor(Date.now() / 1000);
  const result = await db.none(
    `INSERT INTO listings (name, sku, currencies, intent, updated, steamid)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name, sku, intent, steamid)
         DO UPDATE SET currencies = $3, updated = $5;`,
    [response_item.name, sku, JSON.stringify(currencies), intent, timestamp, steamid]
  );
  await updateListingStats(db, sku);
  return result;
};

const deleteRemovedListing = async (db, updateListingStats, steamid, name, intent) => {
  const sku = (
    await db.oneOrNone(
      'SELECT sku FROM listings WHERE steamid = $1 AND name = $2 AND intent = $3 LIMIT 1',
      [steamid, name, intent]
    )
  )?.sku;
  const result = await db.any(
    'DELETE FROM listings WHERE steamid = $1 AND name = $2 AND intent = $3;',
    [steamid, name, intent]
  );
  if (sku) {
    await updateListingStats(db, sku);
  }
  return result;
};

const HARD_MAX_AGE_SECONDS = 5 * 24 * 60 * 60; // 5 days

const deleteOldListings = async (db) => {
  const stats = await db.any(
    'SELECT sku, moving_avg_buy_count, moving_avg_sell_count FROM listing_stats'
  );
  const buyBands = {
    veryActive: [],
    active: [],
    moderatelyActive: [],
    somewhatActive: [],
    lowActive: [],
    rare: [],
  };
  const sellBands = {
    veryActive: [],
    active: [],
    moderatelyActive: [],
    somewhatActive: [],
    lowActive: [],
    rare: [],
  };

  for (const row of stats) {
    // Buy bands
    if (row.moving_avg_buy_count > 10) {
      buyBands.veryActive.push(row.sku);
    } else if (row.moving_avg_buy_count > 8) {
      buyBands.active.push(row.sku);
    } else if (row.moving_avg_buy_count > 6) {
      buyBands.moderatelyActive.push(row.sku);
    } else if (row.moving_avg_buy_count > 4) {
      buyBands.somewhatActive.push(row.sku);
    } else if (row.moving_avg_buy_count > 2) {
      buyBands.lowActive.push(row.sku);
    } else {
      buyBands.rare.push(row.sku);
    }

    // Sell bands
    if (row.moving_avg_sell_count > 10) {
      sellBands.veryActive.push(row.sku);
    } else if (row.moving_avg_sell_count > 8) {
      sellBands.active.push(row.sku);
    } else if (row.moving_avg_sell_count > 6) {
      sellBands.moderatelyActive.push(row.sku);
    } else if (row.moving_avg_sell_count > 4) {
      sellBands.somewhatActive.push(row.sku);
    } else if (row.moving_avg_sell_count > 2) {
      sellBands.lowActive.push(row.sku);
    } else {
      sellBands.rare.push(row.sku);
    }
  }

  // Now delete buy listings by their bands
  for (const [band, skus] of Object.entries(buyBands)) {
    if (skus.length === 0) {
      continue;
    }
    let age;
    switch (band) {
      case 'veryActive':
        age = 35 * 60;
        break;
      case 'active':
        age = 2 * 3600;
        break;
      case 'moderatelyActive':
        age = 6 * 3600;
        break;
      case 'somewhatActive':
        age = 24 * 3600;
        break;
      case 'lowActive':
        age = 3 * 24 * 3600;
        break;
      case 'rare':
        age = 5 * 24 * 3600;
        break;
    }
    await db.none(
      "DELETE FROM listings WHERE sku IN ($1:csv) AND intent = 'buy' AND EXTRACT(EPOCH FROM NOW() - to_timestamp(updated)) >= $2",
      [skus, age]
    );
  }

  // Now delete sell listings by their bands
  for (const [band, skus] of Object.entries(sellBands)) {
    if (skus.length === 0) {
      continue;
    }
    let age;
    switch (band) {
      case 'veryActive':
        age = 35 * 60;
        break;
      case 'active':
        age = 2 * 3600;
        break;
      case 'moderatelyActive':
        age = 6 * 3600;
        break;
      case 'somewhatActive':
        age = 24 * 3600;
        break;
      case 'lowActive':
        age = 3 * 24 * 3600;
        break;
      case 'rare':
        age = 5 * 24 * 3600;
        break;
    }
    await db.none(
      "DELETE FROM listings WHERE sku IN ($1:csv) AND intent = 'sell' AND EXTRACT(EPOCH FROM NOW() - to_timestamp(updated)) >= $2",
      [skus, age]
    );
  }

  // Fail safe: delete any listing older than the hard max age
  await db.none(
    'DELETE FROM listings WHERE EXTRACT(EPOCH FROM NOW() - to_timestamp(updated)) >= $1',
    [HARD_MAX_AGE_SECONDS]
  );
};

module.exports = {
  getListings,
  insertListing,
  insertListingsBatch,
  deleteRemovedListing,
  deleteOldListings,
};
