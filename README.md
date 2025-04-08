# bptf-autopricer
<div align="center"><img src="https://github.com/jack-richards/bptf-autopricer/assets/58331725/203fe808-30ff-4d7d-868c-a3ef6d31497d" alt="logo" style="width: 280px; height: 320px; display: block; margin-left: auto; margin-right: auto;"></div>

#
<div align="center">
  
[![Version](https://img.shields.io/github/v/release/jack-richards/bptf-autopricer.svg)](https://github.com/jack-richards/bptf-autopricer/releases)
[![GitHub forks](https://img.shields.io/github/forks/jack-richards/bptf-autopricer)](https://github.com/jack-richards/bptf-autopricer/network/members)
[![GitHub Repo stars](https://img.shields.io/github/stars/jack-richards/bptf-autopricer)](https://github.com/jack-richards/bptf-autopricer/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/jack-richards/bptf-autopricer)](https://github.com/jack-richards/bptf-autopricer/issues)
[![License](https://img.shields.io/github/license/jack-richards/bptf-autopricer.svg)](https://opensource.org/licenses/MIT)
[![Known Vulnerabilities](https://snyk.io/test/github/jack-richards/bptf-autopricer/badge.svg)](https://snyk.io/test/github/jack-richards/bptf-autopricer)

</div>

**Use this version of bptf-autopricer if you're using [tf2-trading-bot](https://github.com/jack-richards/tf2-trading-bot)** — a custom trading bot built on top of the [tf2automatic framework](https://github.com/tf2-automatic/tf2-automatic), and an alternative to bots like TF2AutoBot.

**If you're not using tf2-trading-bot** — whether you're using TF2AutoBot or just prefer the original bptf-autopricer — use the main branch instead: [here](https://github.com/jack-richards/bptf-autopricer).

### What is bptf-autopricer?
An open-source solution that generates item prices for selected items by utilising listing data from [backpack.tf](https://backpack.tf/). Each price created is a result of the meticulous evaluation of both the underlying data and the actual prices, incorporating multiple checks and balances to counteract potential price manipulation.

## Features

- **Automated Pricing:** Automatically generates item prices using both real-time and snapshot [backpack.tf](https://backpack.tf/) listing data, ensuring a profit margin and performing various sanity checks.

- **Baseline Comparison:** Compares generated prices against those from [Prices.tf](https://github.com/prices-tf) - disregarding prices that go over percentage thresholds configured.

- **Trusted/Blacklisted Steam IDs:** Prioritises listings from trusted bots, and filters out untrusted bots when calculating prices. Fully configurable.

- **Excluded Listing Descriptions:** Filters out listings with descriptions containing configured keywords. Useful for removing listings from calculations that include special attributes, such as spells.

- **Filters Outliers:** With a sufficient number of listings, filters out outliers from the mean. Removes listings with prices that deviate too much from the average.
  
- **API Functionality:**
  - *Add and Delete Items:* The API can be used to add or remove items for the auto pricer to track.
  - *Retrieve Prices:* Prices can be requested and retrieved through the API.

- **Socket.IO Server:**
  - Emits item prices to any listeners using a Socket.IO server.
  - Prices are stored and emitted in a format fully supported by the [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) custom-pricer interface.

## Requirements
- Install dependencies by running `npm install` in the project directory with package.json.
- A PostgreSQL database is required:
  - Look up a tutorial online on how to install it for your particular operating system.
  - After it is instaled, follow along with the tutorial provided in [INITIALIZE-DB.md](https://github.com/jack-richards/bptf-autopricer/blob/tf2-trading-bot/INITIALIZE-DB.md) to satisfy all the database requirements. 

## Configuration
To configure the application you need to specify the values for all the fields in `config.json`.
```JSON
{
    "bptfAPIKey": "your bptf api key",
    "bptfToken": "your bptf token",
    "steamAPIKey": "your steam api key",
    "database": {
        "schema": "tf2",
        "host": "localhost",
        "port": 5432,
        "name": "bptf-autopricer",
        "user": "postgres",
        "password": "database password"
    },
    "pricerPort": 3456,
    "maxPercentageDifferences": {
        "buy": 5,
        "sell": -8
    },
    "alwaysQuerySnapshotAPI": true,
    "excludedSteamIDs": [
        "76561199384015307"
    ],
    "trustedSteamIDs": [
        "76561199110778355"
    ],
    "excludedListingDescriptions": [
        "exorcism",
    ]
}
```
The majority of these fields are self-explanatory. I will explain the ones that may not be.

### `maxPercentageDifferences`
Contains two fields, `buy` and `sell`. These values represent the maximum difference from the baseline (prices.tf) you will accept before a price is rejected. Adjust the maximum percentage differences for buy and sell according to your preferences.
- A higher **buy** percentage means that the auto pricer is willing to buy items for a higher price than prices.tf.
- A lower **sell** percentage means that the auto pricer is willing to sell items for a lower price than prices.tf.
  
The default in the config is the settings I used while using this auto pricer with a trading bot.
  
```JSON
"maxPercentageDifferences": {
  "buy": 5,
  "sell": -8
}
```

### `excludedSteamIDs`
A list of Steam ID 64s that you don't want to use the listings of in pricing calculations. This is useful for stopping bad actors that you know of from attempting to manipulate the prices created. It's important to note that this is not a fool-proof solution and because of this other methods are also used to reduce the risks of price manipulation.

```JSON
"excludedSteamIDs": [
    "76561199384015307"
]
```

### `trustedSteamIDs`
A list of Steam ID 64s used to prioritise listings owned by these IDs over others during pricing calculations. This feature is beneficial when you want to give preference to bots or users that consistently provide accurate pricing data.

```JSON
"trustedSteamIDs": [
    "76561199110778355"
]
```

### `excludedListingDescriptions`
A list of descriptions that, when detected within a listing's details, causes the listing to be disregarded and not used during pricing calculations. This is useful for excluding listings involving items with 'special attributes,' such as spells, when calculating prices. Leaving such listings in the calculations can risk affecting the average price in unexpected ways.

```JSON
"excludedListingDescriptions": [
    "exorcism",
]
```

### `alwaysQuerySnapshotAPI`

This setting determines whether the pricer should consistently call the snapshot API for each item during the pricing process, regardless of the number of listings available in the database. By default, this setting is set to `true`.

#### Behavior:

- **true**: The pricer always calls the snapshot API for every item, ensuring the most up-to-date information. However, this may result in slower pricing processes due to the API rate limits.

- **false**: The pricer avoids unnecessary API calls if there are already a suitable number of listings in the database to generate a price. This speeds up the pricing process significantly as it bypasses the need to call the snapshot API. However, there are trade-offs to consider:

#### Trade-offs:

1. **Accuracy vs. Speed**: By setting `alwaysQuerySnapshotAPI` to `false`, the pricing process becomes faster but may use a smaller pool of listings to calculate prices. The logic ensures that if there are at least 10 buy listings and 1 sell listing, no further data retrieval is attempted.

2. **Timeliness of Data**: When the API is not called every time, there's a risk of using listings with prices that are up to approximately 35 minutes old, in the worst-case scenario.

#### Benefits:

- **Improved Performance**: Setting `alwaysQuerySnapshotAPI` to `false` makes the pricer more efficient, especially when dealing with large item lists, as it avoids the minimum 2-second wait time per item.

Consider your requirements for pricing accuracy, speed, and data freshness when configuring this setting.

```JSON
"alwaysQuerySnapshotAPI": true
```

## API Routes & Socket IO
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
- Note that the same JSON structure is used when an item or an array of items is returned by the API.
- This JSON format is fully compatible with what [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) requires for a custom pricer implementation.
  
#
Now I'll highlight the different API routes you can make queries to, and what responses you can expect to receive.\
Please note that both the Socket IO server and API run locally (localhost) on the port defined in `config.json`.
#

```plain text
GET /items/:sku
```
Retrieves a particular item object from the pricelist using the Stock Keeping Unit (SKU) provided. Item object returned contains the prices for the item.

**Request:**
- **Parameters:**
  - `sku` (String): The Stock Keeping Unit of the item. E.g., Mann Co. Supply Crate Key has an SKU of 5021;6.

**Response:**
- **Success (200):**
  - JSON item object containing information about the item, including the prices.
- **Failure (404):**
  - If the requested item is not found in the pricelist.
- **Failure (400):**
  - Where 5021;6 is the SKU provided and there is an issue with fetching the key price from Prices.tf.
#
```plain text
GET /items/
```
Retrieves the entire pricelist.

**Response:**
- **Success (200):**
  - JSON object containing the entire pricelist. An array of JSON item objects.
- **Failure (400):**
  - If there is an issue loading the pricelist.
#
```plain text
POST /items/:sku
```
An endpoint that returns a status code of 200 for each request. Exists so there's no issue in integrating with TF2 Auto Bot.

**Request:**
- **Parameters:**
  - `sku` (String): The Stock Keeping Unit of the item.

**Response:**
- **Success (200):**
  - JSON object indicating the SKU.
#
```plain text
POST /items/add/:name
```
Adds the item to the list of items to auto price.

**Request:**
- **Parameters:**
  - `name` (String): The name of the item to add.

**Response:**
- **Success (200):**
  - Item successfully added. Will now be automatically priced.
- **Failure (400):**
  - If the item already exists in the item list.
#
```plain text
POST /items/delete/:name
```
Deletes an item from the list of items to automatically price.

**Request:**
- **Parameters:**
  - `name` (String): The name of the item to delete.

**Response:**
- **Success (200):**
  - Item successfully deleted.
- **Failure (400):**
  - If the item does not exist in the item list.
    
## Running the Auto Pricer
Once all the requirements have been met, and you have provided the values required in config.json, simply run:
```
node bptf-autopricer.js
```

If you want to use [PM2](https://github.com/Unitech/pm2) to run the application even after closing the terminal run:
```
pm2 start bptf-autopricer.js
```

## FAQ
- Q: How do I connect this to TF2AutoBot?
- A: You are looking at the *wrong version* of the project, find the correct one [here](https://github.com/jack-richards/bptf-autopricer/)
- Q: I am getting a 429 error in the console what does this mean?
- A: See: https://github.com/jack-richards/bptf-autopricer/issues/17
- Q: I am being shown 'error: relation "listings" does not exist' when running the pricer.
- A: See: https://github.com/jack-richards/bptf-autopricer/issues/14
- Q: Why is the pricer giving a 'Not valid JSON error'?
- A: Your JSON isn't valid - you likely have a `item_list.json` file that does not follow the expected format. Refer to [this example](https://github.com/jack-richards/bptf-autopricer/blob/main/files/item_list.json) of what a valid `item_list.json` file should look like.
- Q: There are loads of 'Couldn't price item' errors, is everything broken?!
- A: Nope! Everything is fine :D it's typically just the pricer protecting you by discarding prices that deviate too much from the prices.tf baseline (which is configurable). In time, you should get a set of baseline prices for nearly all of your items which will be updated as regularly as possible thereafter.
- Q: I am getting x error please help me!
- A: Please ensure that you have read over the readme thoroughly and followed all the instructions listed. If you are still stuck:
  - [Raise an issue](https://github.com/jack-richards/bptf-autopricer/issues/new), though I cannot guarantee I will respond in a timely manner.
  - Or join the [TF2AutoBot discord](https://discord.gg/4k5tmMkXjB), which is a great place to ask questions! Please try to search old messages in the server to see if what you planned to ask has already been answered.

## Adding Items to Price.
- **Using the API Routes:** Send requests to the relevant route specified in the [API section](#api-routes--socket-io). Keep in mind that you will need these requests to originate from the same machine as where bptf-autopricer is being hosted on.
- **Manual Additions:** Add items to price manually to [`item_list.json`](https://github.com/jack-richards/bptf-autopricer/blob/tf2-trading-bot/files/item_list.json). Make sure to use the valid format shown.

Each item name given should be the same as the one used for its listings on [backpack.tf](https://backpack.tf/). For example, `Non-Craftable Tour of Duty Ticket` **NOT** `Uncraftable Tour of Duty Ticket`.

## Seamless integration with tf2-trading-bot
bptf-autopricer seamlessly integrates with my [tf2 trading bot project](https://github.com/jack-richards/tf2-trading-bot), providing an ultra-fast trading experience with highly competitive pricing.
