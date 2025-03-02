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

CREATE TABLE tf2.pricelist
(
    name character varying NOT NULL,
    sku character varying NOT NULL,
    buy json NOT NULL,
    sell json NOT NULL,
    time bigint NOT NULL,
    PRIMARY KEY (name, sku)
);

CREATE TABLE tf2.item_list
(
    name character varying NOT NULL,
    sku character varying NOT NULL,
    buy json NOT NULL,
    sell json NOT NULL,
    time bigint NOT NULL,
    PRIMARY KEY (name, sku)
);