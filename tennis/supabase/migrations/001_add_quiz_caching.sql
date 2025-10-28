-- Migration: Add quiz caching infrastructure
-- Created: 2025-10-28
-- Purpose: Optimize quiz generation with caching and prepare for manual quiz creation

-- =============================================================================
-- 1. CACHED DAILY QUIZZES TABLE
-- =============================================================================
-- This table stores generated quizzes (both manual and algorithmic) for 24 hours
-- to avoid regenerating the same quiz multiple times per day

CREATE TABLE IF NOT EXISTS cached_daily_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  quiz_source VARCHAR(20) NOT NULL CHECK (quiz_source IN ('manual', 'algorithmic')),
  quiz_template_id UUID DEFAULT NULL, -- References quiz_templates.id (for future manual quizzes)
  quiz_data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',

  CONSTRAINT valid_quiz_data CHECK (
    quiz_data ? 'success' AND
    quiz_data ? 'date' AND
    quiz_data ? 'categories'
  )
);

-- Index for fast date lookups
CREATE INDEX idx_cached_quiz_date ON cached_daily_quizzes(date);

-- Index for finding expired caches (for cleanup cron job)
CREATE INDEX idx_cached_quiz_expires ON cached_daily_quizzes(expires_at);

-- =============================================================================
-- 2. PERFORMANCE INDEXES FOR EXISTING TABLES
-- =============================================================================
-- These indexes speed up the quiz generation and validation queries

-- Players table indexes
CREATE INDEX IF NOT EXISTS idx_players_nationality ON players(nationality);
CREATE INDEX IF NOT EXISTS idx_players_hand ON players(plays_hand);
CREATE INDEX IF NOT EXISTS idx_players_turned_pro ON players(turned_pro);
CREATE INDEX IF NOT EXISTS idx_players_retired ON players(retired);

-- Tournaments table indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_level ON tournaments(level);
CREATE INDEX IF NOT EXISTS idx_tournaments_name ON tournaments(name);

-- Player achievements indexes
CREATE INDEX IF NOT EXISTS idx_player_achievements_player_id ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_tournament_id ON player_achievements(tournament_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_result ON player_achievements(result);
CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement_type ON player_achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_player_achievements_year ON player_achievements(year);

-- Composite index for common query pattern (player + result)
CREATE INDEX IF NOT EXISTS idx_player_achievements_player_result
  ON player_achievements(player_id, result);

-- Player rankings indexes
CREATE INDEX IF NOT EXISTS idx_player_rankings_player_id ON player_rankings(player_id);
CREATE INDEX IF NOT EXISTS idx_player_rankings_singles ON player_rankings(singles_ranking);
CREATE INDEX IF NOT EXISTS idx_player_rankings_date ON player_rankings(ranking_date);

-- Composite index for finding if player reached #1 or Top 10
CREATE INDEX IF NOT EXISTS idx_player_rankings_player_singles
  ON player_rankings(player_id, singles_ranking);

-- =============================================================================
-- 3. CACHE CLEANUP FUNCTION
-- =============================================================================
-- Function to delete expired quiz caches (run via cron)

CREATE OR REPLACE FUNCTION cleanup_expired_quiz_caches()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cached_daily_quizzes
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. QUIZ STATISTICS VIEW (Optional - for analytics)
-- =============================================================================
-- Useful for tracking cache hit rates and quiz sources

CREATE OR REPLACE VIEW quiz_cache_stats AS
SELECT
  quiz_source,
  COUNT(*) as total_cached,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as active_caches,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_caches,
  MIN(generated_at) as oldest_cache,
  MAX(generated_at) as newest_cache
FROM cached_daily_quizzes
GROUP BY quiz_source;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- To rollback this migration, run:
--
-- DROP VIEW IF EXISTS quiz_cache_stats;
-- DROP FUNCTION IF EXISTS cleanup_expired_quiz_caches();
-- DROP TABLE IF EXISTS cached_daily_quizzes CASCADE;
--
-- DROP INDEX IF EXISTS idx_players_nationality;
-- DROP INDEX IF EXISTS idx_players_hand;
-- DROP INDEX IF EXISTS idx_players_turned_pro;
-- DROP INDEX IF EXISTS idx_players_retired;
-- DROP INDEX IF EXISTS idx_tournaments_level;
-- DROP INDEX IF EXISTS idx_tournaments_name;
-- DROP INDEX IF EXISTS idx_player_achievements_player_id;
-- DROP INDEX IF EXISTS idx_player_achievements_tournament_id;
-- DROP INDEX IF EXISTS idx_player_achievements_result;
-- DROP INDEX IF EXISTS idx_player_achievements_achievement_type;
-- DROP INDEX IF EXISTS idx_player_achievements_year;
-- DROP INDEX IF EXISTS idx_player_achievements_player_result;
-- DROP INDEX IF EXISTS idx_player_rankings_player_id;
-- DROP INDEX IF EXISTS idx_player_rankings_singles;
-- DROP INDEX IF EXISTS idx_player_rankings_date;
-- DROP INDEX IF EXISTS idx_player_rankings_player_singles;
