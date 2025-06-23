# bliss-autopricer

[![npm version](https://img.shields.io/npm/v/pg-promise?label=pg-promise)](https://www.npmjs.com/package/pg-promise)
[![Node.js](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%3E=12-blue)](https://www.postgresql.org/)
[![ESLint](https://img.shields.io/badge/code_style-ESLint-blueviolet)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/code_style-Prettier-ff69b4)](https://prettier.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<div align="center">
  <img src="https://github.com/jack-richards/bptf-autopricer/assets/58331725/203fe808-30ff-4d7d-868c-a3ef6d31497d" alt="logo" style="width: 280px; height: 320px; display: block; margin-left: auto; margin-right: auto;">
</div>

A custom pricer that generates item prices by analysing live and snapshot data from [backpack.tf](https://backpack.tf), applies sanity checks, and integrates seamlessly with TF2 Autobot. Modified and forked from Jack's Auto Pricer!

---

## Features

- **Automated Pricing:** Generates item prices using real-time and snapshot [backpack.tf](https://backpack.tf/) listing data, ensuring a profit margin and performing various sanity checks.
- **Baseline Comparison:** Compares generated prices against [Prices.tf](https://github.com/prices-tf) and disregards prices that exceed configured percentage thresholds.
- **Trusted/Blacklisted Steam IDs:** Prioritises listings from trusted bots and filters out untrusted bots when calculating prices. Fully configurable.
- **Excluded Listing Descriptions:** Filters out listings with descriptions containing configured keywords (e.g., spells).
- **Outlier Filtering:** Removes listings with prices that deviate too much from the average.
- **API Functionality:** Add/delete items for auto-pricing and retrieve prices via the API.
- **Socket.IO Server:** Emits item prices to listeners in a format compatible with [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot).
- **Price Watcher Web Interface:** Dashboard to monitor item data freshness, view outdated entries, and manage your bot's selling pricelist.

---

## Requirements

- **Node.js** (v18 or newer)
- **npm**
- **PostgreSQL** (v12 or newer)
- **TF2 Auto Bot**

---

## Setup & Installation

### 1. Clone and Install Dependencies

```sh
git clone https://github.com/OliverPerring/bliss-autopricer.git
cd bliss-autopricer
npm install
```

### 2. Configure Application

Copy and configure both `config.json` and `pricerConfig.json` at the project root.  
See the **Configuration** section below for details.

---

## PostgreSQL Setup

### 1. Install PostgreSQL

- Download and install from [postgresql.org](https://www.postgresql.org/download/).
- Ensure the PostgreSQL service is running.

### 2. Create Database and Schema

Open a terminal and run:

```sh
psql -U postgres
```

Then, in the psql prompt:

```sql
CREATE DATABASE "bptf-autopricer";
\c bptf-autopricer
CREATE SCHEMA tf2 AUTHORIZATION postgres;
```

### 3. Create Tables

You can use the provided [`initialize-db.sql`](initialize-db.sql):

```sh
psql -U postgres -d bptf-autopricer -f initialize-db.sql
```

Or run the following SQL manually:

```sql
CREATE TABLE tf2.listings (
  name character varying NOT NULL,
  sku character varying NOT NULL,
  currencies json NOT NULL,
  intent character varying NOT NULL,
  updated bigint NOT NULL,
  steamid character varying NOT NULL,
  PRIMARY KEY (name, sku, intent, steamid)
);

CREATE TABLE tf2.key_prices (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  buy_price_metal DECIMAL NOT NULL,
  sell_price_metal DECIMAL NOT NULL,
  timestamp INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tf2.listing_stats (
  sku TEXT PRIMARY KEY,
  current_count INTEGER DEFAULT 0,
  moving_avg_count REAL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW (),
  current_buy_count integer DEFAULT 0,
  moving_avg_buy_count real DEFAULT 0,
  current_sell_count integer DEFAULT 0,
  moving_avg_sell_count real DEFAULT 0
);
```

### 4. Test Database Connection and Permissions

In psql, run:

```sql
\dt tf2.*
```

You should see the three tables listed.  
Test permissions by inserting a test row (replace values as needed):

```sql
INSERT INTO
  tf2.listings (name, sku, currencies, intent, updated, steamid)
VALUES
  (
    'Test Item',
    '123;6',
    '{"keys":1,"metal":10}',
    'buy',
    1700000000,
    '12345678901234567'
  );
```

If you get no errors, your user has the correct permissions.

---

## Configuration

### `config.json`

Holds core pricer settings:

```json
{
  "bptfAPIKey": "<your backpack.tf API key>",
  "bptfToken": "<your backpack.tf token>",
  "steamAPIKey": "<your Steam API key>",
  "database": {
    "schema": "tf2",
    "host": "localhost",
    "port": 5432,
    "name": "bptf-autopricer",
    "user": "postgres",
    "password": "<db password>"
  },
  "pricerPort": 3456,
  "maxPercentageDifferences": {
    "buy": 5,
    "sell": -8
  },
  "alwaysQuerySnapshotAPI": true,
  "fallbackOntoPricesTf": false,
  "excludedSteamIDs": ["76561199384015307", "..."],
  "trustedSteamIDs": ["76561199110778355", "..."],
  "excludedListingDescriptions": ["exorcism", "spell", "spelled"],
  "blockedAttributes": {
    "Australium Gold": 15185211,
    "Team Spirit": 12073019,
    "..."
  }
}
```

### `pricerConfig.json`

Controls the Price Watcher web UI and integration with TF2AutoBot's selling pricelist:

```json
{
  "pm2ProcessName": "tf2autobot",
  "tf2AutobotDir": "../../tf2autobot-5.13.0",
  "botTradingDir": "files/bot",
  "port": 3000,
  "ageThresholdSec": 7200
}
```

---

## API Routes & Socket.IO

The Socket.IO server emits events called `price` with an item object as the value.  
The item objects are structured as follows:

```json
{
  "name": "Strange Australium Minigun",
  "sku": "202;11;australium",
  "source": "bptf",
  "time": 1700403492,
  "buy": { "keys": 25, "metal": 21.33 },
  "sell": { "keys": 26, "metal": 61.77 }
}
```

This format is compatible with [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) custom pricer interface.

### Example API Endpoints

- `GET /items/:sku` — Retrieve a particular item object from the pricelist.
- `GET /items/` — Retrieve the entire pricelist.
- `POST /items/:sku` — Endpoint for integration with TF2 Auto Bot.
- `POST /items/add/:name` — Add an item to be auto-priced.
- `POST /items/delete/:name` — Remove an item from auto-pricing.

See the full API documentation in this README for request/response details.

---

## Running

Start the pricer (includes API, Socket.IO & Web Interface):

```sh
node bptf-autopricer.js
```

**Tip:** Run under PM2 to keep alive:

```sh
npm install -g pm2
pm2 start bptf-autopricer.js --name bptf-autopricer
```

---

## Web Interface

The bliss-autopricer includes a built-in web dashboard for managing and monitoring your pricing bot.  
Visit: `http://localhost:<pricerConfig.port>` (default: 3000).

### Main Features

- **Dashboard Overview:** View and filter items by status: Outdated, Current, and Unpriced.
- **Pricelist Management:** Add, remove, and edit items and bounds directly in the table.
- **Queue System:** Review and apply pending actions, which will trigger a PM2 restart for changes to take effect.
- **Navigation Bar:** Access price list, bounds editing, key price graphs, profit/loss, trade history, and logs.

### How to Use

1. **Start the pricer** (see "Running" section).
2. **Open your browser** to `http://localhost:<pricerConfig.port>`.
3. **Interact with the dashboard** to manage items and review pending actions.
4. **Explore additional pages** for advanced features.

### Notes

- All changes to your bot’s pricelist are applied atomically and will trigger a PM2 restart of your TF2Autobot process.
- The web interface reads/writes to `files/item_list.json` and your bot’s `pricelist.json` as configured in `pricerConfig.json`.
- Outdated prices are detected using the `ageThresholdSec` setting.

---

## Development & Code Quality

- **Linting:** Uses [ESLint](https://eslint.org/) with plugins for best practices, security, promises, imports, JSDoc, and spellchecking.
- **Formatting:** Uses [Prettier](https://prettier.io/) with plugins for SQL and package.json sorting.
- **CI:** See [`.github/workflows/Lint and Format.yml`](.github/workflows/Lint%20and%20Format.yml) for automated lint/format checks.

---

## FAQ

- **How do I connect this to TF2AutoBot?**  
  See: [jack-richards#11](https://github.com/jack-richards/bptf-autopricer/issues/11)

- **I am getting a 429 error in the console, what does this mean?**  
  See: [jack-richards#17](https://github.com/jack-richards/bptf-autopricer/issues/17)

- **I am being shown 'error: relation "listings" does not exist' when running the pricer.**  
  See: [jack-richards#14](https://github.com/jack-richards/bptf-autopricer/issues/14)

- **Why is the pricer giving a 'Not valid JSON error'?**  
  Your JSON isn't valid—check that `item_list.json` matches [this example](https://github.com/jack-richards/bptf-autopricer/blob/main/files/item_list.json).

- **There are loads of 'Couldn't price item' errors, is everything broken?!**  
  No! The pricer is protecting you by discarding prices that deviate too much from the baseline. Over time, most items will be priced and updated regularly.

---

_Built with ❤️ for TF2 trading_
