-- Migration: Add manual quiz templates table
-- Created: 2025-10-28
-- Purpose: Enable manual quiz creation by admins with scheduling and validation

-- =============================================================================
-- 1. QUIZ TEMPLATES TABLE (Manual Quizzes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS quiz_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Quiz metadata
  title VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard')),

  -- The actual quiz categories (JSONB for flexibility)
  row_categories JSONB NOT NULL,
  col_categories JSONB NOT NULL,

  -- Scheduling
  scheduled_date DATE,  -- NULL = draft, specific date = scheduled
  is_published BOOLEAN DEFAULT false,

  -- Validation metrics (populated during creation/validation)
  total_cells INT DEFAULT 9,
  validated_cells INT DEFAULT 0,  -- How many cells have valid solutions
  min_cell_solutions INT,         -- Minimum number of valid players in any cell

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_row_categories CHECK (jsonb_array_length(row_categories) = 3),
  CONSTRAINT valid_col_categories CHECK (jsonb_array_length(col_categories) = 3),
  CONSTRAINT valid_validation CHECK (
    validated_cells >= 0 AND
    validated_cells <= total_cells
  )
);

-- Prevent multiple published quizzes for the same date
CREATE UNIQUE INDEX idx_quiz_templates_unique_published_date
  ON quiz_templates(scheduled_date)
  WHERE is_published = true AND scheduled_date IS NOT NULL;

-- Index for finding published quizzes by date (used in daily-quiz endpoint)
CREATE INDEX idx_quiz_templates_scheduled_published
  ON quiz_templates(scheduled_date, is_published)
  WHERE is_published = true;

-- Index for admin dashboard (list all quizzes)
CREATE INDEX idx_quiz_templates_created_at ON quiz_templates(created_at DESC);

-- Index for finding user's quizzes
CREATE INDEX idx_quiz_templates_created_by ON quiz_templates(created_by);

-- =============================================================================
-- 2. ADD FOREIGN KEY TO cached_daily_quizzes
-- =============================================================================

-- Link cached quizzes back to their template (if they're manual)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_cached_quiz_template'
  ) THEN
    ALTER TABLE cached_daily_quizzes
      ADD CONSTRAINT fk_cached_quiz_template
      FOREIGN KEY (quiz_template_id)
      REFERENCES quiz_templates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 3. HELPER FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_quiz_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_quiz_template_updated_at ON quiz_templates;
CREATE TRIGGER trigger_quiz_template_updated_at
  BEFORE UPDATE ON quiz_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_quiz_template_timestamp();

-- Function to get a published quiz for a specific date
CREATE OR REPLACE FUNCTION get_manual_quiz_for_date(target_date DATE)
RETURNS TABLE (
  id UUID,
  title VARCHAR(255),
  description TEXT,
  difficulty VARCHAR(20),
  row_categories JSONB,
  col_categories JSONB,
  scheduled_date DATE,
  validated_cells INT,
  min_cell_solutions INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qt.id,
    qt.title,
    qt.description,
    qt.difficulty,
    qt.row_categories,
    qt.col_categories,
    qt.scheduled_date,
    qt.validated_cells,
    qt.min_cell_solutions,
    qt.created_at
  FROM quiz_templates qt
  WHERE qt.scheduled_date = target_date
    AND qt.is_published = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. ANALYTICS VIEWS
-- =============================================================================

-- View for admin dashboard statistics
CREATE OR REPLACE VIEW quiz_template_stats AS
SELECT
  COUNT(*) as total_templates,
  COUNT(*) FILTER (WHERE is_published = true) as published_count,
  COUNT(*) FILTER (WHERE is_published = false) as draft_count,
  COUNT(*) FILTER (WHERE scheduled_date IS NOT NULL) as scheduled_count,
  COUNT(*) FILTER (WHERE scheduled_date >= CURRENT_DATE AND is_published = true) as upcoming_count,
  AVG(validated_cells) as avg_validated_cells,
  MIN(min_cell_solutions) as global_min_solutions
FROM quiz_templates;

-- View for scheduled quizzes calendar
CREATE OR REPLACE VIEW quiz_schedule AS
SELECT
  scheduled_date,
  title,
  difficulty,
  is_published,
  validated_cells,
  min_cell_solutions,
  created_at
FROM quiz_templates
WHERE scheduled_date IS NOT NULL
ORDER BY scheduled_date ASC;

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS) - Optional but recommended
-- =============================================================================

-- Enable RLS on quiz_templates
ALTER TABLE quiz_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read published quizzes
CREATE POLICY "Public can read published quizzes"
  ON quiz_templates
  FOR SELECT
  USING (is_published = true);

-- Policy: Authenticated users can read their own quizzes
CREATE POLICY "Users can read own quizzes"
  ON quiz_templates
  FOR SELECT
  USING (auth.uid() = created_by);

-- Policy: Authenticated users can create quizzes
CREATE POLICY "Authenticated users can create quizzes"
  ON quiz_templates
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update their own unpublished quizzes
CREATE POLICY "Users can update own draft quizzes"
  ON quiz_templates
  FOR UPDATE
  USING (auth.uid() = created_by AND is_published = false)
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can publish their own quizzes
CREATE POLICY "Users can publish own quizzes"
  ON quiz_templates
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can delete their own draft quizzes
CREATE POLICY "Users can delete own draft quizzes"
  ON quiz_templates
  FOR DELETE
  USING (auth.uid() = created_by AND is_published = false);

-- =============================================================================
-- 6. SEED DATA (Optional - Example quiz template)
-- =============================================================================

-- Uncomment to add an example quiz template
/*
INSERT INTO quiz_templates (
  title,
  description,
  difficulty,
  row_categories,
  col_categories,
  scheduled_date,
  is_published,
  validated_cells,
  min_cell_solutions
) VALUES (
  'Grand Slam Champions',
  'Test your knowledge of Grand Slam winners',
  'medium',
  '[
    {"type":"country","id":"country_ESP","label":"Spain","description":"From Spain","value":"ESP"},
    {"type":"tournament","id":"tournament_Wimbledon","label":"Wimbledon","description":"Won Wimbledon","value":"Wimbledon"},
    {"type":"era","id":"era_2010s","label":"2010s","description":"Active in 2010s","value":"2010s"}
  ]'::jsonb,
  '[
    {"type":"country","id":"country_SRB","label":"Serbia","description":"From Serbia","value":"SRB"},
    {"type":"ranking","id":"ranking_world_no1","label":"World #1","description":"Former World #1","value":"world_no1"},
    {"type":"style","id":"style_right","label":"Right-Handed","description":"Plays right-handed","value":"right"}
  ]'::jsonb,
  CURRENT_DATE + INTERVAL '7 days',
  false,
  9,
  3
);
*/

-- =============================================================================
-- ROLLBACK INSTRUCTIONS
-- =============================================================================
-- To rollback this migration, run:
--
-- DROP POLICY IF EXISTS "Users can delete own draft quizzes" ON quiz_templates;
-- DROP POLICY IF EXISTS "Users can publish own quizzes" ON quiz_templates;
-- DROP POLICY IF EXISTS "Users can update own draft quizzes" ON quiz_templates;
-- DROP POLICY IF EXISTS "Authenticated users can create quizzes" ON quiz_templates;
-- DROP POLICY IF EXISTS "Users can read own quizzes" ON quiz_templates;
-- DROP POLICY IF EXISTS "Public can read published quizzes" ON quiz_templates;
-- ALTER TABLE quiz_templates DISABLE ROW LEVEL SECURITY;
--
-- DROP VIEW IF EXISTS quiz_schedule;
-- DROP VIEW IF EXISTS quiz_template_stats;
-- DROP FUNCTION IF EXISTS get_manual_quiz_for_date(DATE);
-- DROP TRIGGER IF EXISTS trigger_quiz_template_updated_at ON quiz_templates;
-- DROP FUNCTION IF EXISTS update_quiz_template_timestamp();
--
-- ALTER TABLE cached_daily_quizzes DROP CONSTRAINT IF EXISTS fk_cached_quiz_template;
--
-- DROP INDEX IF EXISTS idx_quiz_templates_created_by;
-- DROP INDEX IF EXISTS idx_quiz_templates_created_at;
-- DROP INDEX IF EXISTS idx_quiz_templates_scheduled_published;
-- DROP INDEX IF EXISTS idx_quiz_templates_unique_published_date;
-- DROP TABLE IF EXISTS quiz_templates CASCADE;
