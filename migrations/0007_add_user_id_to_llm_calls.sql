-- BUG-1: Add user_id column to llm_calls table
-- d1-costs.ts INSERT references user_id but the column didn't exist in 0005_cost_tracking.sql
ALTER TABLE llm_calls ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_llm_calls_user ON llm_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_user_date ON llm_calls(user_id, created_at);
