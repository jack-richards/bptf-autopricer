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