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

## Running the Auto Pricer
Once all the requirements have been met, and you have provided the values required in config.json, simply run:
```
node bptf-autopricer.js
```
