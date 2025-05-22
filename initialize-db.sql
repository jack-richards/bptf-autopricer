CREATE SCHEMA tf2 AUTHORIZATION postgres;
CREATE TABLE tf2.listings
(
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