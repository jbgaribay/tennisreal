# Database Migrations

This directory contains SQL migrations for the TennisReal database.

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the migration file (e.g., `001_add_quiz_caching.sql`)
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push

# Or run a specific migration
psql $DATABASE_URL < supabase/migrations/001_add_quiz_caching.sql
```

### Option 3: Direct PostgreSQL Connection

```bash
# Get your connection string from Supabase dashboard
# Settings > Database > Connection string

psql "postgresql://[YOUR_CONNECTION_STRING]" < supabase/migrations/001_add_quiz_caching.sql
```

## Migration History

| Migration | Date | Description | Status |
|-----------|------|-------------|--------|
| 001_add_quiz_caching.sql | 2025-10-28 | Add quiz caching infrastructure and performance indexes | Pending |

## What Each Migration Does

### 001_add_quiz_caching.sql

**Purpose**: Optimize quiz generation performance

**Changes**:
- Creates `cached_daily_quizzes` table for 24-hour quiz caching
- Adds performance indexes to `players`, `tournaments`, `player_achievements`, `player_rankings`
- Creates `cleanup_expired_quiz_caches()` function for maintenance
- Creates `quiz_cache_stats` view for monitoring

**Expected Performance Improvement**:
- Quiz generation: 10-30 seconds → <100ms (for cached quizzes)
- Database queries during generation: 180+ → 0 (for cached quizzes)
- Validation queries: ~5-10 seconds → ~500ms-2s (with indexes)

**Rollback**: See bottom of migration file for rollback commands

## Post-Migration Steps

After applying `001_add_quiz_caching.sql`:

1. Verify tables were created:
   ```sql
   SELECT * FROM cached_daily_quizzes;
   SELECT * FROM quiz_cache_stats;
   ```

2. Test the cleanup function:
   ```sql
   SELECT cleanup_expired_quiz_caches();
   ```

3. Deploy updated API code that uses the cache

4. (Optional) Set up a cron job to run cleanup daily:
   ```sql
   -- In Supabase, go to Database > Extensions > pg_cron
   SELECT cron.schedule(
     'cleanup-quiz-caches',
     '0 2 * * *', -- Run at 2am daily
     'SELECT cleanup_expired_quiz_caches();'
   );
   ```

## Troubleshooting

**Error: relation already exists**
- Some indexes may already exist. This is safe to ignore.
- The migration uses `IF NOT EXISTS` where possible.

**Error: permission denied**
- Ensure you're connected as a superuser or have appropriate permissions.
- In Supabase, use the provided connection string with full permissions.

**Performance not improving after migration**
- Run `ANALYZE` on large tables to update query planner statistics:
  ```sql
  ANALYZE players;
  ANALYZE player_achievements;
  ANALYZE player_rankings;
  ANALYZE tournaments;
  ```
