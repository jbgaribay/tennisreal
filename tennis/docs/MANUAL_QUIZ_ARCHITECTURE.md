# Manual Quiz Creation - Backend Architecture

## Overview

This document explains how the manual quiz creation system will work on the backend, complementing the algorithmic quiz generation system.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REQUEST                              │
│                 GET /api/daily-quiz?date=2025-10-28         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │   1. CHECK CACHE LAYER         │
          │   (cached_daily_quizzes)       │
          └────────────┬───────────────────┘
                       │
            ┌──────────┴──────────┐
            │                     │
          FOUND                 NOT FOUND
            │                     │
            ▼                     ▼
    ┌───────────────┐   ┌─────────────────────────┐
    │ Return Cached │   │  2. CHECK MANUAL QUIZ   │
    │ Quiz (~50ms)  │   │  (quiz_templates table) │
    └───────────────┘   └──────────┬──────────────┘
                                   │
                        ┌──────────┴──────────┐
                        │                     │
                      FOUND               NOT FOUND
                        │                     │
                        ▼                     ▼
              ┌──────────────────┐   ┌───────────────────┐
              │ Use Manual Quiz  │   │ 3. GENERATE       │
              │ - Validated      │   │ Algorithmic Quiz  │
              │ - Scheduled      │   │ (existing logic)  │
              └────────┬─────────┘   └─────────┬─────────┘
                       │                       │
                       └───────────┬───────────┘
                                   │
                                   ▼
                        ┌────────────────────┐
                        │  4. CACHE RESULT   │
                        │  (24 hour TTL)     │
                        └──────────┬─────────┘
                                   │
                                   ▼
                        ┌────────────────────┐
                        │   5. RETURN QUIZ   │
                        │   to Frontend      │
                        └────────────────────┘
```

---

## Database Schema

### Table 1: `quiz_templates` (For Manual Quizzes)

```sql
CREATE TABLE quiz_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- The actual quiz categories (3 rows + 3 columns)
  row_categories JSONB NOT NULL,  -- Array of 3 Category objects
  col_categories JSONB NOT NULL,  -- Array of 3 Category objects

  -- Scheduling
  scheduled_date DATE,              -- NULL = draft, DATE = scheduled
  is_published BOOLEAN DEFAULT false,

  -- Metadata
  difficulty VARCHAR(20),           -- 'easy', 'medium', 'hard'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation metrics (populated during creation)
  total_cells INT DEFAULT 9,
  validated_cells INT DEFAULT 0,    -- How many cells have valid solutions
  min_cell_solutions INT,           -- Smallest player count in any cell

  -- Prevent duplicate schedules
  UNIQUE(scheduled_date) WHERE is_published = true
);

-- Example row_categories JSONB:
{
  "categories": [
    {"type": "country", "id": "country_ESP", "label": "Spain", "description": "From Spain", "value": "ESP"},
    {"type": "tournament", "id": "tournament_wimbledon", "label": "Wimbledon", "description": "Won Wimbledon", "value": "Wimbledon"},
    {"type": "era", "id": "era_2010s", "label": "2010s", "description": "Active in 2010s", "value": "2010s"}
  ]
}
```

### Table 2: `cached_daily_quizzes` (Already Implemented)

```sql
CREATE TABLE cached_daily_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  quiz_source VARCHAR(20) NOT NULL,  -- 'manual' or 'algorithmic'
  quiz_template_id UUID REFERENCES quiz_templates(id),  -- Links to manual quiz if applicable
  quiz_data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
```

---

## API Endpoints

### 1. **GET /api/daily-quiz** (Modified - Already Implemented)

**Purpose:** Retrieve today's quiz (cached, manual, or algorithmic)

**Flow:**
```typescript
export async function GET(request: NextRequest) {
  const date = request.searchParams.get('date') || getTodayDate();

  // 1. Check cache
  const cached = await getCachedQuiz(date);
  if (cached) return cached;

  // 2. Check for manual quiz
  const manualQuiz = await getManualQuiz(date);
  if (manualQuiz) {
    const quizData = formatManualQuiz(manualQuiz);
    await cacheQuiz(date, 'manual', quizData, manualQuiz.id);
    return quizData;
  }

  // 3. Generate algorithmic quiz
  const algorithmicQuiz = await generateAlgorithmicQuiz(date);
  await cacheQuiz(date, 'algorithmic', algorithmicQuiz);
  return algorithmicQuiz;
}
```

**Response:**
```json
{
  "success": true,
  "date": "2025-10-28",
  "source": "manual",  // or "algorithmic"
  "title": "Grand Slam Legends",  // only for manual quizzes
  "difficulty": "hard",
  "categories": {
    "rows": [Category, Category, Category],
    "columns": [Category, Category, Category]
  },
  "cached": true,
  "generatedAt": "2025-10-28T08:00:00Z"
}
```

---

### 2. **POST /api/admin/quiz-templates** (NEW)

**Purpose:** Create a new manual quiz (draft or scheduled)

**Auth:** Requires admin role

**Request Body:**
```json
{
  "title": "Australian Open Special",
  "description": "Celebrate the Australian Open with legendary players",
  "rowCategories": [
    {"type": "country", "label": "Australia", "value": "AUS", ...},
    {"type": "tournament", "label": "Australian Open", "value": "Australian Open", ...},
    {"type": "era", "label": "2000s", "value": "2000s", ...}
  ],
  "colCategories": [
    {"type": "country", "label": "Serbia", "value": "SRB", ...},
    {"type": "ranking", "label": "World #1", "value": "world_no1", ...},
    {"type": "style", "label": "Right-Handed", "value": "right", ...}
  ],
  "scheduledDate": "2025-11-15",  // Optional - leave null for draft
  "difficulty": "medium"
}
```

**Backend Logic:**
```typescript
export async function POST(request: Request) {
  // 1. Verify admin auth
  const user = await getAuthenticatedUser(request);
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // 2. Validate structure
  if (body.rowCategories.length !== 3 || body.colCategories.length !== 3) {
    return NextResponse.json({ error: 'Must have 3 rows and 3 columns' }, { status: 400 });
  }

  // 3. Pre-validate all 9 cells (optional but recommended)
  const validation = await validateAllCells(body.rowCategories, body.colCategories);

  // 4. Insert into database
  const { data, error } = await supabase
    .from('quiz_templates')
    .insert({
      created_by: user.id,
      title: body.title,
      description: body.description,
      row_categories: body.rowCategories,
      col_categories: body.colCategories,
      scheduled_date: body.scheduledDate || null,
      is_published: false,  // Always start as draft
      difficulty: body.difficulty,
      validated_cells: validation.validCount,
      min_cell_solutions: validation.minSolutions
    })
    .select()
    .single();

  return NextResponse.json({ success: true, quiz: data });
}
```

**Response:**
```json
{
  "success": true,
  "quiz": {
    "id": "uuid-here",
    "title": "Australian Open Special",
    "scheduled_date": "2025-11-15",
    "is_published": false,
    "validated_cells": 9,
    "min_cell_solutions": 3
  }
}
```

---

### 3. **POST /api/admin/quiz-templates/[id]/validate** (NEW)

**Purpose:** Validate a quiz and get player counts for each cell (live preview)

**Auth:** Requires admin role

**Request Body:**
```json
{
  "rowCategories": [...],
  "colCategories": [...]
}
```

**Backend Logic:**
```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { rowCategories, colCategories } = await request.json();

  // Check all 9 cells in parallel
  const validationPromises = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      validationPromises.push(
        countValidPlayers(rowCategories[r], colCategories[c]).then(count => ({
          row: r,
          col: c,
          playerCount: count,
          status: count === 0 ? 'impossible' : count < 3 ? 'risky' : 'safe'
        }))
      );
    }
  }

  const results = await Promise.all(validationPromises);

  return NextResponse.json({
    cells: results,
    summary: {
      totalValidCells: results.filter(r => r.playerCount > 0).length,
      impossibleCells: results.filter(r => r.playerCount === 0).length,
      riskyCells: results.filter(r => r.playerCount > 0 && r.playerCount < 3).length,
      safeCells: results.filter(r => r.playerCount >= 3).length,
      minSolutions: Math.min(...results.map(r => r.playerCount))
    }
  });
}

async function countValidPlayers(rowCategory: Category, colCategory: Category): Promise<number> {
  // Query database to count players matching both categories
  const { data: players, error } = await supabase
    .from('players')
    .select(`
      id, name, nationality, turned_pro, retired, plays_hand,
      player_achievements(tournament_id, result, achievement_type, tournaments(short_name)),
      player_rankings(singles_ranking)
    `)
    .limit(500);

  if (error || !players) return 0;

  let count = 0;
  for (const player of players) {
    const rowMatch = await validateCategory(player, rowCategory);
    const colMatch = await validateCategory(player, colCategory);
    if (rowMatch && colMatch) count++;
  }

  return count;
}
```

**Response:**
```json
{
  "cells": [
    {"row": 0, "col": 0, "playerCount": 5, "status": "safe"},
    {"row": 0, "col": 1, "playerCount": 12, "status": "safe"},
    {"row": 0, "col": 2, "playerCount": 2, "status": "risky"},
    ...
  ],
  "summary": {
    "totalValidCells": 9,
    "impossibleCells": 0,
    "riskyCells": 2,
    "safeCells": 7,
    "minSolutions": 2
  }
}
```

---

### 4. **PATCH /api/admin/quiz-templates/[id]** (NEW)

**Purpose:** Update a draft quiz

**Auth:** Requires admin role

**Request Body:**
```json
{
  "title": "Updated Title",
  "rowCategories": [...],
  "scheduledDate": "2025-12-01"
}
```

**Response:**
```json
{
  "success": true,
  "quiz": { /* updated quiz object */ }
}
```

---

### 5. **POST /api/admin/quiz-templates/[id]/publish** (NEW)

**Purpose:** Publish a quiz (make it active for its scheduled date)

**Auth:** Requires admin role

**Backend Logic:**
```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser(request);
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Update quiz to published
  const { data: quiz, error } = await supabase
    .from('quiz_templates')
    .update({
      is_published: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Invalidate any existing cache for that date
  if (quiz.scheduled_date) {
    await supabase
      .from('cached_daily_quizzes')
      .delete()
      .eq('date', quiz.scheduled_date);
  }

  return NextResponse.json({ success: true, quiz });
}
```

**Response:**
```json
{
  "success": true,
  "quiz": {
    "id": "uuid",
    "is_published": true,
    "scheduled_date": "2025-11-15"
  }
}
```

---

### 6. **GET /api/admin/suggest-categories** (NEW)

**Purpose:** Get AI-suggested categories for a new quiz

**Auth:** Requires admin role

**Query Params:**
- `difficulty` - 'easy', 'medium', 'hard'
- `seed` - Optional seed for deterministic generation

**Backend Logic:**
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const difficulty = searchParams.get('difficulty') || 'medium';
  const seed = parseInt(searchParams.get('seed') || Date.now().toString());

  // Use existing category building logic
  const allCategories = await buildCategoryPool();
  const suggested = selectSmartCategories(allCategories, seed, false);

  // Generate a few alternatives
  const alternatives = [];
  for (let i = 1; i <= 3; i++) {
    const altSuggested = selectSmartCategories(allCategories, seed + i * 1000, false);
    alternatives.push({
      rows: altSuggested.slice(0, 3),
      columns: altSuggested.slice(3, 6)
    });
  }

  return NextResponse.json({
    primary: {
      rows: suggested.slice(0, 3),
      columns: suggested.slice(3, 6)
    },
    alternatives
  });
}
```

**Response:**
```json
{
  "primary": {
    "rows": [Category, Category, Category],
    "columns": [Category, Category, Category]
  },
  "alternatives": [
    {"rows": [...], "columns": [...]},
    {"rows": [...], "columns": [...]},
    {"rows": [...], "columns": [...]}
  ]
}
```

---

### 7. **GET /api/admin/quiz-templates** (NEW)

**Purpose:** List all manual quizzes (with filters)

**Auth:** Requires admin role

**Query Params:**
- `status` - 'draft', 'published', 'all'
- `page` - Pagination
- `limit` - Results per page

**Response:**
```json
{
  "quizzes": [
    {
      "id": "uuid",
      "title": "Australian Open Special",
      "scheduled_date": "2025-11-15",
      "is_published": true,
      "difficulty": "medium",
      "created_at": "2025-10-28T10:00:00Z"
    },
    ...
  ],
  "total": 25,
  "page": 1,
  "pages": 3
}
```

---

## Admin UI Flow

### **Creating a Manual Quiz**

```
1. Admin visits /admin/quiz-creator

2. Clicks "Suggest Categories"
   ↓ Calls GET /api/admin/suggest-categories
   ↓ Receives primary + 3 alternatives

3. Admin can:
   - Accept suggestion
   - Pick from alternatives
   - Drag/drop to reorder
   - Replace individual categories from dropdown
   - Click "Regenerate" for new suggestions

4. As admin builds, live validation runs
   ↓ Calls POST /api/admin/quiz-templates/validate (debounced)
   ↓ Receives cell-by-cell player counts
   ↓ UI shows 3x3 preview grid:
     - Green cell: 5+ valid players ✅
     - Yellow cell: 2-4 valid players ⚠️
     - Red cell: 0-1 valid players ❌

5. Admin fills in metadata:
   - Title: "Grand Slam Legends"
   - Difficulty: Hard
   - Schedule Date: 2025-11-15 (or leave blank for draft)

6. Clicks "Save as Draft"
   ↓ Calls POST /api/admin/quiz-templates
   ↓ Quiz saved with is_published=false

7. Later, admin reviews and clicks "Publish"
   ↓ Calls POST /api/admin/quiz-templates/[id]/publish
   ↓ Quiz is live for Nov 15th
   ↓ Cache cleared for that date
```

### **UI Component Mockup**

```
┌──────────────────────────────────────────────────────────┐
│  Create Manual Quiz                          [Suggest ▼] │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ROWS:                                                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐ │
│  │ Spain (Country) │ │ Wimbledon (Tour)│ │ 2010s (Era)│ │
│  │ [Change▼]       │ │ [Change▼]       │ │ [Change▼]  │ │
│  └─────────────────┘ └─────────────────┘ └────────────┘ │
│                                                           │
│  COLUMNS:                                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐ │
│  │ Serbia (Country)│ │ World #1 (Rank) │ │ Right-Hand │ │
│  │ [Change▼]       │ │ [Change▼]       │ │ [Change▼]  │ │
│  └─────────────────┘ └─────────────────┘ └────────────┘ │
│                                                           │
├──────────────────────────────────────────────────────────┤
│  LIVE PREVIEW:                    Status: ✅ All Valid   │
│                                                           │
│       │ Serbia │ World #1 │ Right-Hand                   │
│  ─────┼────────┼──────────┼────────────                  │
│  Spain│  🟢 5  │   🟢 8   │   🟢 12                      │
│  Wimb │  🟢 7  │   🟢 15  │   🟡 2                       │
│  2010s│  🟢 12 │   🟢 20  │   🟢 35                      │
│                                                           │
│  Legend: 🟢 Safe (5+) | 🟡 Risky (2-4) | 🔴 Impossible  │
├──────────────────────────────────────────────────────────┤
│  Title: [Australian Open Special                      ]  │
│  Difficulty: [Medium ▼]                                  │
│  Schedule: [2025-11-15] (leave blank for draft)         │
│                                                           │
│  [Save as Draft]                       [Publish Now]     │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow Example

### **Scenario: User plays quiz on November 15, 2025**

```
Time: 8:00 AM - First user of the day

GET /api/daily-quiz?date=2025-11-15

Backend:
1. Check cache → NOT FOUND (first request of day)
2. Check quiz_templates:
   SELECT * FROM quiz_templates
   WHERE scheduled_date = '2025-11-15'
   AND is_published = true
   → FOUND: "Australian Open Special"

3. Format manual quiz data:
   {
     source: 'manual',
     title: 'Australian Open Special',
     categories: {
       rows: [...from row_categories JSONB],
       columns: [...from col_categories JSONB]
     }
   }

4. Cache quiz:
   INSERT INTO cached_daily_quizzes
   (date, quiz_source, quiz_template_id, quiz_data, expires_at)
   VALUES
   ('2025-11-15', 'manual', 'uuid-of-template', {...}, '2025-11-16 08:00:00')

5. Return quiz to user

────────────────────────────────────────────────────────────

Time: 8:05 AM - Second user of the day

GET /api/daily-quiz?date=2025-11-15

Backend:
1. Check cache → FOUND!
2. Return cached quiz immediately (<50ms)
3. Done!

────────────────────────────────────────────────────────────

Time: Nov 16, 9:00 AM - Next day (no manual quiz scheduled)

GET /api/daily-quiz?date=2025-11-16

Backend:
1. Check cache → NOT FOUND
2. Check quiz_templates → NOT FOUND (no quiz scheduled)
3. Generate algorithmic quiz (existing logic)
4. Cache algorithmic quiz
5. Return quiz
```

---

## Benefits of This Architecture

### ✅ **Flexibility**
- Admins can create themed quizzes for special occasions
- Algorithmic generation for all other days (no manual work needed)

### ✅ **Performance**
- Caching applies to both manual and algorithmic quizzes
- First user: ~50ms (manual) or 10-30s (algorithmic)
- All subsequent users: <50ms (cached)

### ✅ **Quality Control**
- Live validation prevents impossible grids
- Admins see exactly how many players match each cell
- Can test before publishing

### ✅ **Fallback System**
- If no manual quiz exists, algorithmic generation kicks in
- System never breaks - always returns a quiz

### ✅ **Analytics Ready**
- Track which quizzes are manual vs algorithmic
- Compare user performance on manual vs algorithmic
- Identify which categories work best

---

## Security Considerations

### **Role-Based Access Control (RBAC)**

All admin endpoints require authentication + admin role:

```typescript
async function isAdmin(user: User): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  return data?.role === 'admin';
}
```

### **Input Validation**

- Categories must have proper structure (type, label, value, etc.)
- Exactly 3 rows and 3 columns required
- Scheduled dates must be in the future
- JSONB fields validated before storage

### **Preventing Conflicts**

- Unique constraint on `scheduled_date` when `is_published = true`
- Can't have 2 published quizzes for same date
- Publishing invalidates cache for that date

---

## Summary

The manual quiz backend works as a **three-tier fallback system**:

1. **Cache** (fastest) → Return immediately if exists
2. **Manual Quiz** (medium) → Use if scheduled and published
3. **Algorithmic** (slowest first time) → Generate if no manual quiz

This architecture gives you the best of both worlds:
- **Control** when you need it (manual quizzes)
- **Automation** when you don't (algorithmic generation)
- **Performance** always (caching layer)

All backend components are ready to be implemented once Phase 1 optimizations are deployed!
