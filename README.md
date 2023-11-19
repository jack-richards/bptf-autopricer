# bptf-autopricer
<div align="center"><img src="https://github.com/jack-richards/bptf-autopricer/assets/58331725/203fe808-30ff-4d7d-868c-a3ef6d31497d" alt="logo" style="width: 280px; height: 320px; display: block; margin-left: auto; margin-right: auto;"></div>

#

An open-source application that automatically generates item prices using listing data retrieved from backpack.tf. Prices are then compared against data from [Prices.tf](https://github.com/prices-tf), serving as a baseline. If a price deviates beyond the percentages set in the config, it is not used.

## Features

- **Automated Pricing:** Automatically generates item prices using [backpack.tf](https://backpack.tf/) listing data, ensuring a profit margin and performing various sanity checks.

- **Baseline Comparison:** Compares generated prices against those from [Prices.tf](https://github.com/prices-tf) - disregarding prices that go over percentage thresholds configured.
  
- **API Functionality:**
  - *Add and Delete Items:* The API can be used to add or remove items for the auto pricer to track.
  - *Retrieve Prices:* Prices can be requested and retrieved through the API.

- **Socket.IO Server:**
  - Emits item prices to any listeners using a Socket.IO server.
  - Prices are stored and emitted in a format fully supported by the [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) custom-pricer interface.

## Requirements
Dependencies should be satisfied by running `npm install` in the same directory as the project and package.json.

This application requires a PostgreSQL database containing a table with the following layout:
```sql
CREATE TABLE listings (
    name character varying NOT NULL,
    sku character varying NOT NULL,
    currencies json NOT NULL,
    intent character varying NOT NULL,
    updated bigint NOT NULL,
    steamid character varying NOT NULL,
    CONSTRAINT listings_pkey PRIMARY KEY (name, sku, intent, steamid)
);
```
The name of the database and schema, and what user owns the table are left to your discretion but will need to be specified in the `config.json` file.

## Baseline Thresholds
Within `config.json`, you can specify the maximum difference from the baseline (prices.tf) you will accept before a price is rejected. Adjust the maximum percentage differences for buy and sell according to your preferences.
```JSON
"maxPercentageDifferences": {
  "buy": 5,
  "sell": -8
}
```
### Percentage Explanations:
**Buy Percentage**:
- A higher percentage means that the auto pricer is willing to buy items for a higher price than prices.tf.

**Sell Percentage**:
- A lower percentage means that the auto pricer is willing to sell items for a lower price than prices.tf.

## API Routes
Here I'll highlight the different API routes you can make queries to, and what responses you can expect to receive.\
Please note that the API runs locally (localhost) on the port defined in `config.json` in the `pricerAPIPort` key.
#
```plain text
GET /api/:sku
```
Retrieves a particular item object from the pricelist using the Stock Keeping Unit (SKU) provided. Item object returned contains the prices for the item.

**Request:**
- **Parameters:**
  - `sku` (String): The Stock Keeping Unit of the item. E.g., Mann Co. Supply Crate Key has an SKU of 5021;6.

**Response:**
- **Success (200):**
  - JSON object containing information about the item, including the prices.
- **Failure (404):**
  - If the requested item is not found in the pricelist.
- **Failure (400):**
  - Where 5021;6 is the SKU provided and there is an issue with fetching the key price from Prices.tf.
#
```plain text
GET /api/
```
Retrieves the entire pricelist.

**Response:**
- **Success (200):**
  - JSON object containing the entire pricelist.
- **Failure (400):**
  - If there is an issue loading the pricelist.
#
```plain text
POST /api/:sku
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
POST /api/add/:name
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
POST /api/delete/:name
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
