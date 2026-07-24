-- Migration 006: Remove PHC/HSC tables
-- The application now uses only the TNCERA clinical establishments layer.
-- Run this after confirming all PHC/HSC data is no longer needed.

-- Drop user statuses first (FK dependency on locations)
DROP TABLE IF EXISTS user_location_status;

-- Drop the PHC/HSC locations table
DROP TABLE IF EXISTS locations;
