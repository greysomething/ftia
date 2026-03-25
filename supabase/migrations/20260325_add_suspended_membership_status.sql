-- Add 'suspended' to the membership_status enum for dispute handling
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'suspended';
