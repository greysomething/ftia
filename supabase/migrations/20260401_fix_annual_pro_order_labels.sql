-- Fix mislabeled payment orders: $233.70 orders should be level 5 (50% Off Annual Pro)
-- not level 8. The previous migration (20260401_fix_order_level_ids.sql) incorrectly
-- mapped $233.70 → level 8 instead of level 5.

-- Fix any orders at $233.70 that have level_id=8 → should be level 5 (50% Off Annual Pro)
UPDATE membership_orders
SET level_id = 5
WHERE total = 233.70 AND level_id = 8;

-- Also fix any $233.70 orders that still have level_id=3 (were missed by the prior migration)
UPDATE membership_orders
SET level_id = 5
WHERE total = 233.70 AND level_id = 3;

-- Also fix any $233.70 orders with level_id=2 (6-Month Unlimited) — wrong plan
UPDATE membership_orders
SET level_id = 5
WHERE total = 233.70 AND level_id = 2;
