-- Add snapshot column to sessions table for session state persistence
-- Run via: wrangler d1 execute pablo-db --file=./migrations/0002_add_snapshot.sql

ALTER TABLE sessions ADD COLUMN snapshot TEXT;
