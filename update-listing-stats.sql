-- Add new columns to tf2.listing_stats for buy/sell stats
ALTER TABLE tf2.listing_stats
ADD COLUMN current_buy_count integer DEFAULT 0,
ADD COLUMN moving_avg_buy_count real DEFAULT 0,
ADD COLUMN current_sell_count integer DEFAULT 0,
ADD COLUMN moving_avg_sell_count real DEFAULT 0;
