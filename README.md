# bliss-autopricer
<div align="center"><img src="https://github.com/jack-richards/bptf-autopricer/assets/58331725/203fe808-30ff-4d7d-868c-a3ef6d31497d" alt="logo" style="width: 280px; height: 320px; display: block; margin-left: auto; margin-right: auto;"></div>

A custom pricer that generates item prices by analysing live and snapshot data from [backpack.tf](https://backpack.tf), applies sanity checks, and integrates seamlessly with TF2 Autobot. Modified and forked from Jacks Auto Pricer!

Features
--------

-   **Automated Pricing:** Automatically generates item prices using both real-time and snapshot [backpack.tf](https://backpack.tf/) listing data, ensuring a profit margin and performing various sanity checks.

-   **Baseline Comparison:** Compares generated prices against those from [Prices.tf](https://github.com/prices-tf) - disregarding prices that go over percentage thresholds configured.

-   **Trusted/Blacklisted Steam IDs:** Prioritises listings from trusted bots, and filters out untrusted bots when calculating prices. Fully configurable.

-   **Excluded Listing Descriptions:** Filters out listings with descriptions containing configured keywords. Useful for removing listings from calculations that include special attributes, such as spells.

-   **Filters Outliers:** With a sufficient number of listings, filters out outliers from the mean. Removes listings with prices that deviate too much from the average.

-   **API Functionality:**

    -   *Add and Delete Items:* The API can be used to add or remove items for the auto pricer to track.

    -   *Retrieve Prices:* Prices can be requested and retrieved through the API.

-   **Socket.IO Server:**

    -   Emits item prices to any listeners using a Socket.IO server.

    -   Prices are stored and emitted in a format fully supported by the [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) custom-pricer interface.

-   **Price Watcher Web Interface:** Provides a dashboard to monitor item data freshness, view outdated entries, and manage your bot's selling pricelist via add/remove actions.

Requirements
------------

-   **Node.js & npm**

-   **PostgreSQL**

-   **TF2 Auto Bot**

Setup & Installation
--------------------

1.  Clone this repository and install dependencies:

    ```
    git clone https://github.com/OliverPerring/bliss-autopricer.git
    cd bptf-autopricer
    npm install
    ```

2.  Copy and configure both `config.json` and `pricerConfig.json` at the project root.

### Database Initialization

Create your database/schema and the `listings` and `key_prices` table or alternativly follow the instructions within the [INITIALIZE-DB.md](https://github.com/jack-richards/bptf-autopricer/blob/main/INITIALIZE-DB.md) for a quick start.

```SQL
CREATE SCHEMA schemaname AUTHORIZATION postgres;
CREATE TABLE schemaname.listings
(
    name character varying NOT NULL,
    sku character varying NOT NULL,
    currencies json NOT NULL,
    intent character varying NOT NULL,
    updated bigint NOT NULL,
    steamid character varying NOT NULL,
    PRIMARY KEY (name, sku, intent, steamid)
);
CREATE TABLE schemaname.key_prices (
    id SERIAL PRIMARY KEY,
    sku TEXT NOT NULL,
    buy_price_metal DECIMAL NOT NULL,
    sell_price_metal DECIMAL NOT NULL,
    timestamp INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE schemaname.listing_stats (
    sku TEXT PRIMARY KEY,
    current_count INTEGER DEFAULT 0,
    moving_avg_count REAL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
    current_buy_count integer DEFAULT 0,
    moving_avg_buy_count real DEFAULT 0,
    current_sell_count integer DEFAULT 0,
    moving_avg_sell_count real DEFAULT 0;
);
```

### Database Schema Updates

**If you are upgrading from a previous version, you must update your database schema to add new columns to `schemaname.listing_stats`.**

Run the following SQL to update your database:

```SQL
ALTER TABLE schemaname.listing_stats
    ADD COLUMN current_buy_count integer DEFAULT 0,
    ADD COLUMN moving_avg_buy_count real DEFAULT 0,
    ADD COLUMN current_sell_count integer DEFAULT 0,
    ADD COLUMN moving_avg_sell_count real DEFAULT 0;
```

Alternatively, run the provided `update-listing-stats.sql` file.

Configuration
-------------

### `config.json`

Holds core pricer settings:

```JSON
{
  "bptfAPIKey": "<your backpack.tf API key>",
  "bptfToken": "<your backpack.tf token>",
  "steamAPIKey": "<your Steam API key>",
  "database": {
    "schema": "schemaname",
    "host": "localhost",
    "port": 5432,
    "name": "bptf-autopricer",
    "user": "postgres",
    "password": "<db password>"
  },
  "pricerPort": 3456,                      // HTTP & Socket.IO port for API
  "maxPercentageDifferences": {           // Reject if autopricer & Prices.tf differ too much
    "buy": 5,                             // e.g., will buy up to +5% more than Prices.tf
    "sell": -8                            // e.g., will sell no less than -8% compared to Prices.tf
  },
  "alwaysQuerySnapshotAPI": true,         // Force snapshot API call per item
  "fallbackOntoPricesTf": false,         // Fallback to Prices.tf if listings are insufficient
  "excludedSteamIDs": [                  // SteamID64 to ignore in pricing
    "76561199384015307",
    "..."
  ],
  "trustedSteamIDs": [                    // SteamID64 to prioritise
    "76561199110778355",
    "..."
  ],
  "excludedListingDescriptions": [       // Keywords to filter out special listings
    "exorcism", "spell", "spelled"
  ],
  "blockedAttributes": {                  // Paint/attribute float_values to exclude
    "Australium Gold": 15185211,
    "Team Spirit": 12073019,
    "..."
  }
}
```

### `pricerConfig.json`

Controls the Price Watcher web UI and integration with TF2AutoBot's selling pricelist:

```JSON
{
  "pm2ProcessName": "tf2autobot",     // Name for PM2 restart on changes
  "tf2AutobotDir": "../../tf2autobot-5.13.0", // Path to TF2 Autobot root
  "botTradingDir": "files/bot",       // Subdirectory containing bot's pricelist.json
  "port": 3000,                        // Port to serve the Price Watcher UI
  "ageThresholdSec": 7200              // Threshold in seconds to mark prices outdated
}
```

API Routes & Socket IO
----------------------

The socket io server will emit events called 'price' with an item object as the value. The item objects are structured like the following:

```JSON
{
  "name": "Strange Australium Minigun",
  "sku": "202;11;australium",
  "source": "bptf",
  "time": 1700403492,
  "buy": {
    "keys": 25,
    "metal": 21.33
  },
  "sell": {
    "keys": 26,
    "metal": 61.77
  }
}
```

-   Note that the same JSON structure is used when an item or an array of items is returned by the API.

-   This JSON format is fully compatible with what [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) requires for a custom pricer implementation.

Now I'll highlight the different API routes you can make queries to, and what responses you can expect to receive.\
Please note that both the Socket IO server and API run locally (localhost) on the port defined in `config.json`.

```
GET /items/:sku
```

Retrieves a particular item object from the pricelist using the Stock Keeping Unit (SKU) provided. Item object returned contains the prices for the item.

**Request:**

-   **Parameters:**

    -   `sku` (String): The Stock Keeping Unit of the item. E.g., Mann Co. Supply Crate Key has an SKU of 5021;6.

**Response:**

-   **Success (200):**

    -   JSON item object containing information about the item, including the prices.

-   **Failure (404):**

    -   If the requested item is not found in the pricelist.

-   **Failure (400):**

    -   Where 5021;6 is the SKU provided and there is an issue with fetching the key price from Prices.tf.

```
GET /items/
```

Retrieves the entire pricelist.

**Response:**

-   **Success (200):**

    -   JSON object containing the entire pricelist. An array of JSON item objects.

-   **Failure (400):**

    -   If there is an issue loading the pricelist.

```
POST /items/:sku
```

An endpoint that returns a status code of 200 for each request. Exists so there's no issue in integrating with TF2 Auto Bot.

**Request:**

-   **Parameters:**

    -   `sku` (String): The Stock Keeping Unit of the item.

**Response:**

-   **Success (200):**

    -   JSON object indicating the SKU.

```
POST /items/add/:name
```

Adds the item to the list of items to auto price.

**Request:**

-   **Parameters:**

    -   `name` (String): The name of the item to add.

**Response:**

-   **Success (200):**

    -   Item successfully added. Will now be automatically priced.

-   **Failure (400):**

    -   If the item already exists in the item list.

```
POST /items/delete/:name
```

Deletes an item from the list of items to automatically price.

**Request:**

-   **Parameters:**

    -   `name` (String): The name of the item to delete.

**Response:**

-   **Success (200):**

    -   Item successfully deleted.

-   **Failure (400):**

    -   If the item does not exist in the item list.

Running
-------

Start the pricer (includes API, Socket.IO & Web Interface):

```
node bptf-autopricer.js
```

**Tip:** Run under PM2 to keep alive:

```
npm install -g pm2
pm2 start bptf-autopricer.js --name bptf-autopricer
```

Web Interface
-------------

The bliss-autopricer includes a built-in web dashboard for managing and monitoring your pricing bot. This interface is available at `http://localhost:<pricerConfig.port>` (default: 3000).

### Main Features

- **Dashboard Overview**
  - View and filter items by status: **Outdated**, **Current**, and **Unpriced**.
  - Outdated items are color-coded by how long their price has not been updated (e.g., ≥2h, ≥24h, ≥72h).
  - Search and filter items by name or pricelist status.

- **Pricelist Management**
  - Add new items to be auto-priced by entering their name.
  - Remove items from the auto-pricer.
  - Edit min/max buy/sell bounds for each item directly in the table.
  - All add/remove/edit actions are queued for review before being applied.

- **Queue System**
  - Pending actions (add, remove, edit) are shown in a queue panel.
  - Click "Apply & Restart" to apply all queued changes and automatically restart your TF2Autobot process via PM2.

- **Navigation Bar**
  - **Price List:** Main dashboard for item status and actions.
  - **Edit Bounds:** Adjust min/max buy/sell bounds for tracked items.
  - **Key Graph:** Visualize key price history.
  - **Profit/Loss:** View profit over time and trade summaries.
  - **Trade History:** Inspect past trades with details and filtering.
  - **Logs:** View recent output and error logs from the bot process.

### How to Use

1. **Start the pricer** (see "Running" section above).
2. **Open your browser** to `http://localhost:<pricerConfig.port>`.
3. **Interact with the dashboard:**
   - Use search and filter controls to find items.
   - Add new items using the "Add New Item" form.
   - Remove or edit items using action buttons in the table.
   - Review pending actions in the queue panel and click "Apply & Restart" to commit changes.
4. **Explore additional pages** using the navigation bar for bounds editing, key price graphs, profit/loss, trade history, and logs.

### Notes

- All changes to your bot’s pricelist are applied atomically and will trigger a PM2 restart of your TF2Autobot process for changes to take effect.
- The web interface reads and writes to `files/item_list.json` and your bot’s `pricelist.json` as configured in `pricerConfig.json`.
- Outdated prices are detected using the `ageThresholdSec` setting in `pricerConfig.json`.

---

FAQ
---

-   Q: How do I connect this to TF2AutoBot?

    A: See: [jack-richards#11](https://github.com/jack-richards/bptf-autopricer/issues/11)

-   Q: I am getting a 429 error in the console what does this mean?

    A: See: [jack-richards#17](https://github.com/jack-richards/bptf-autopricer/issues/17)

-   Q: I am being shown 'error: relation "listings" does not exist' when running the pricer.

    A: See: [jack-richards#14](https://github.com/jack-richards/bptf-autopricer/issues/14)

-   Q: Why is the pricer giving a 'Not valid JSON error'?

    A: Your JSON isn't valid - you likely have a `item_list.json` file that does not follow the expected format. Refer to [this example](https://github.com/jack-richards/bptf-autopricer/blob/main/files/item_list.json) of what a valid `item_list.json` file should look like.

-   Q: There are loads of 'Couldn't price item' errors, is everything broken?!

    A: Nope! Everything is fine :D it's typically just the pricer protecting you by discarding prices that deviate too much from the prices.tf baseline (which is configurable). In time, you should get a set of baseline prices for nearly all of your items which will be updated as regularly as possible thereafter.

* * * * *

*Built with ❤️ for TF2 trading*
