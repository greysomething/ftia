-- Fix mislabeled payment history orders
-- Orders were backfilled with level_id=3 (Monthly Unlimited $58.95/$47.95)
-- regardless of their actual plan. Re-assign based on payment amount.

-- Build a temp mapping of amount → best level_id
-- Using the canonical plan levels (ones with stripe_price_id set, or lowest ID)

-- $467.40 → Annual Pro Plan (level 1, billing_amount=467.40)
UPDATE membership_orders
SET level_id = 1
WHERE level_id = 3 AND total = 467.40;

-- $347.40 → Annual Pro Plan (level 10, billing_amount=347.40)
UPDATE membership_orders
SET level_id = 10
WHERE level_id = 3 AND total = 347.40;

-- $293.70 → 6-Month Unlimited (level 2, billing_amount=293.70)
UPDATE membership_orders
SET level_id = 2
WHERE level_id = 3 AND total = 293.70;

-- $233.70 → 6-Month Unlimited (level 8, billing_amount=233.70)
UPDATE membership_orders
SET level_id = 8
WHERE level_id = 3 AND total = 233.70;

-- $48.95 → 1-MONTH TRIAL (level 13, billing_amount=48.95)
UPDATE membership_orders
SET level_id = 13
WHERE level_id = 3 AND total = 48.95;

-- $24.95 and $29.95 — trial/promo amounts, keep as level 3 or match if applicable
-- $47.95 matches level 9 (Monthly Unlimited at $47.95) or level 12
UPDATE membership_orders
SET level_id = 9
WHERE level_id = 3 AND total = 47.95;

-- $58.95 stays as level 3 (Monthly Unlimited at $58.95) — already correct
