// app/api/daily-quiz/route.ts - COMPLETE REFACTORED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import type { Category } from '@/lib/types';
import { validateCategory, getCountryName, formatAchievementLabel } from '@/lib/validation';

interface DailyQuiz {
  rows: Category[];
  columns: Category[];
}

const supabase = getServerSupabase();

export async function GET(request: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { searchParams } = new URL(request.url);
    const testMode = searchParams.get('t');
    const debugMode = searchParams.get('debug');
    const skipValidation = searchParams.get('skipValidation') === 'true';
    const bypassCache = searchParams.get('bypassCache') === 'true'; // For admin testing

    let dateNumber = parseInt(today.replace(/-/g, ''));
    if (testMode) {
      const timeVariation = Math.floor(parseInt(testMode) / 1000) % 50000;
      dateNumber = dateNumber + timeVariation;
    }

    // CACHING LAYER: Check if we have a valid cached quiz for today
    if (!bypassCache && !testMode) {
      console.log(`🔍 Checking cache for ${today}...`);
      const cachedQuiz = await getCachedQuiz(today);

      if (cachedQuiz) {
        console.log(`✅ Cache HIT! Returning cached quiz (generated at ${cachedQuiz.generated_at})`);
        return NextResponse.json({
          ...cachedQuiz.quiz_data,
          cached: true,
          generatedAt: cachedQuiz.generated_at
        });
      }

      console.log(`❌ Cache MISS - checking for manual quiz...`);
    }

    // MANUAL QUIZ CHECK: See if there's a published manual quiz for this date
    if (!testMode) {
      const manualQuiz = await getManualQuizForDate(today);

      if (manualQuiz) {
        console.log(`📝 Manual quiz found: "${manualQuiz.title}"`);

        const quizData = {
          success: true,
          date: today,
          source: 'manual',
          title: manualQuiz.title,
          description: manualQuiz.description,
          difficulty: manualQuiz.difficulty,
          categories: {
            rows: manualQuiz.row_categories,
            columns: manualQuiz.col_categories
          },
          message: `Manual quiz: ${manualQuiz.title}`
        };

        // Cache the manual quiz
        if (!bypassCache) {
          await cacheQuiz(today, 'manual', quizData, manualQuiz.id);
          console.log(`💾 Manual quiz cached for ${today}`);
        }

        return NextResponse.json(quizData);
      }

      console.log(`📊 No manual quiz found - generating algorithmic quiz`);
    }

    console.log(`\n🎾 Generating daily quiz for ${today} (base seed: ${dateNumber})`);

    // Try up to 20 times to generate a valid quiz
    let attempts = 0;
    let quiz;
    let isValid = false;

    while (!isValid && attempts < 20) {
      attempts++;
      const currentSeed = dateNumber + (attempts - 1) * 7919;
      
      console.log(`\n🎲 Attempt ${attempts}/20 with seed ${currentSeed}`);
      
      quiz = await generateDailyCategories(currentSeed, !!debugMode);

      if (skipValidation) {
        isValid = true;
        console.log('⚠️ Skipping validation (debug mode)');
        break;
      }

      console.log(`🔍 Validating quiz...`);
      const validationStart = Date.now();
      
      isValid = await validateQuizHasSolutions(quiz.categories);
      
      const validationTime = Date.now() - validationStart;
      console.log(`⏱️ Validation took ${validationTime}ms`);
      
      if (!isValid) {
        console.log(`❌ Attempt ${attempts} FAILED`);
      } else {
        console.log(`✅ Attempt ${attempts} SUCCESS!`);
      }
    }

    if (!isValid) {
      console.error('⚠️⚠️⚠️ FAILED after 20 attempts!');
      return NextResponse.json({
        success: true,
        date: today,
        categories: quiz!.categories,
        seed: dateNumber,
        debug: quiz!.debug,
        message: `Quiz generated but may have impossible cells`,
        warning: 'Validation failed after 20 attempts',
        attempts: 20
      });
    }

    console.log(`\n🎉 Valid quiz generated on attempt ${attempts}!`);

    const quizResponse = {
      success: true,
      date: today,
      categories: quiz!.categories,
      seed: dateNumber + (attempts - 1) * 7919,
      attempts,
      debug: quiz!.debug,
      message: `Daily quiz generated for ${today}`
    };

    // Cache the successfully generated quiz (unless in test mode)
    if (!testMode && !bypassCache) {
      await cacheQuiz(today, 'algorithmic', quizResponse);
      console.log(`💾 Quiz cached for ${today}`);
    }

    return NextResponse.json(quizResponse);

  } catch (error) {
    console.error('Daily quiz generation error:', error);
    return NextResponse.json(
      {
        success: false,
        ...handleApiError(error, 'Failed to generate daily quiz')
      },
      { status: 500 }
    );
  }
}

async function generateDailyCategories(seed: number, debug: boolean = false) {
  const pseudoRandom = (max: number, offset: number = 0) => {
    const value = Math.abs(Math.sin((seed + offset) * 9999) * 10000) % max;
    return Math.floor(value);
  };

  // Fetch all data from database
  const [countriesResult, tournamentsResult, achievementTypesResult] = await Promise.all([
    supabase.from('players').select('nationality').not('nationality', 'is', null),
    supabase.from('tournaments').select('short_name, name, level').not('level', 'eq', 'achievement'),
    supabase.from('player_achievements').select('achievement_type').not('achievement_type', 'is', null)
  ]);

  if (countriesResult.error || tournamentsResult.error) {
    throw new Error('Failed to fetch quiz data');
  }

  // Count players per country
  const countryCounts = countriesResult.data?.reduce((acc: Record<string, number>, p: any) => {
    acc[p.nationality] = (acc[p.nationality] || 0) + 1;
    return acc;
  }, {}) || {};

  // CRITICAL: Lower threshold to 3 players (was 5)
  const viableCountries = Object.entries(countryCounts)
    .filter(([_, count]) => count >= 3)
    .map(([country]) => country);

  // Get tournaments by level (EXCLUDE WTA tournaments to avoid impossible combinations)
  const grandSlams = tournamentsResult.data?.filter(t =>
    t.level === 'grand_slam' && !t.short_name.includes('WTA') && !t.name?.includes('WTA')
  ) || [];
  const masters = tournamentsResult.data?.filter(t =>
    t.level === 'atp_masters_1000' && !t.short_name.includes('WTA') && !t.name?.includes('WTA')
  ) || [];
  const atp500s = tournamentsResult.data?.filter(t =>
    t.level === 'atp_500' && !t.short_name.includes('WTA') && !t.name?.includes('WTA')
  ) || [];

  // Get unique achievements
  const uniqueAchievements = [...new Set(
    achievementTypesResult.data?.map(a => a.achievement_type).filter(Boolean) || []
  )];

  console.log(`📊 Database stats: ${viableCountries.length} countries, ${grandSlams.length} slams, ${masters.length} masters, ${uniqueAchievements.length} achievements`);

  // Build category pool
  const allCategories: Category[] = [];

  // 1. ALL viable countries
  viableCountries.forEach(country => {
    allCategories.push({
      type: 'country',
      id: `country_${country}`,
      label: getCountryName(country),
      description: `From ${getCountryName(country)}`,
      value: country
    });
  });

  // 2. Grand Slams
  grandSlams.forEach(t => {
    allCategories.push({
      type: 'tournament',
      id: `tournament_${t.short_name}`,
      label: t.short_name,
      description: `Won ${t.short_name}`,
      value: t.short_name
    });
  });

  // 3. ALL Masters 1000
  masters.forEach(t => {
    allCategories.push({
      type: 'tournament',
      id: `tournament_${t.short_name}`,
      label: t.short_name,
      description: `Won ${t.short_name}`,
      value: t.short_name
    });
  });

  // 4. More ATP 500s (10 instead of 5)
  atp500s.slice(0, 10).forEach(t => {
    allCategories.push({
      type: 'tournament',
      id: `tournament_${t.short_name}`,
      label: t.short_name,
      description: `Won ${t.short_name}`,
      value: t.short_name
    });
  });

  // 5. Eras (including 1990s)
  const eras = [
    { value: '2020s', label: '2020s', description: 'Active in 2020s' },
    { value: '2010s', label: '2010s', description: 'Active in 2010s' },
    { value: '2000s', label: '2000s', description: 'Active in 2000s' },
    { value: '1990s', label: '1990s', description: 'Active in 1990s' },
  ];
  eras.forEach(era => {
    allCategories.push({
      type: 'era',
      id: `era_${era.value}`,
      label: era.label,
      description: era.description,
      value: era.value
    });
  });

  // 6. Playing styles
  [
    { value: 'left', label: 'Left-Handed', description: 'Plays left-handed' },
    { value: 'right', label: 'Right-Handed', description: 'Plays right-handed' },
  ].forEach(style => {
    allCategories.push({
      type: 'style',
      id: `style_${style.value}`,
      label: style.label,
      description: style.description,
      value: style.value
    });
  });

  // 7. Rankings (CRITICAL - these were missing!)
  [
    { value: 'world_no1', label: 'World #1', description: 'Former World #1' },
    { value: 'top10', label: 'Top 10', description: 'Reached Top 10' },
  ].forEach(ranking => {
    allCategories.push({
      type: 'ranking',
      id: `ranking_${ranking.value}`,
      label: ranking.label,
      description: ranking.description,
      value: ranking.value
    });
  });

  // 8. More achievements (20 instead of 10)
  uniqueAchievements.slice(0, 20).forEach(achievement => {
    allCategories.push({
      type: 'achievement',
      id: `achievement_${achievement}`,
      label: formatAchievementLabel(achievement),
      description: formatAchievementLabel(achievement),
      value: achievement
    });
  });

  console.log(`📦 Total category pool: ${allCategories.length} categories`);

  // Smart selection to avoid impossible combinations
  const selected = selectSmartCategories(allCategories, seed, debug);

  return {
    categories: {
      rows: selected.slice(0, 3),
      columns: selected.slice(3, 6)
    },
    debug: debug ? {
      totalCategories: allCategories.length,
      categoryBreakdown: {
        countries: viableCountries.length,
        grandSlams: grandSlams.length,
        masters: masters.length,
        achievements: uniqueAchievements.length
      },
      selectedRows: selected.slice(0, 3).map(c => `${c.type}: ${c.label}`),
      selectedColumns: selected.slice(3, 6).map(c => `${c.type}: ${c.label}`)
    } : undefined
  };
}

function selectSmartCategories(allCategories: Category[], seed: number, debug: boolean): Category[] {
  const pseudoRandom = (max: number, offset: number = 0) => {
    const value = Math.abs(Math.sin((seed + offset) * 9999) * 10000) % max;
    return Math.floor(value);
  };

  // Define safe (popular) vs risky (rare) categories
  const popularCountries = ['USA', 'ESP', 'SRB', 'SUI', 'GBR', 'FRA', 'GER', 'AUS', 'ARG', 'RUS', 'ITA', 'CRO'];
  
  const safeCategories = allCategories.filter(c => {
    if (c.type === 'country') return popularCountries.includes(c.value);
    if (c.type === 'tournament') return c.label.includes('Wimbledon') || c.label.includes('US Open') || c.label.includes('French Open') || c.label.includes('Australian Open');
    if (c.type === 'era') return true;
    if (c.type === 'ranking') return true;
    return false;
  });

  const riskyCategories = allCategories.filter(c => !safeCategories.includes(c));

  console.log(`🎯 Category pools: ${safeCategories.length} safe, ${riskyCategories.length} risky`);

  const selected: Category[] = [];
  const usedIds = new Set<string>();
  const rowHasCountry = { value: false };
  const colHasCountry = { value: false };

  // Select 3 ROWS
  for (let i = 0; i < 3; i++) {
    let pool = (i < 2) ? safeCategories : [...safeCategories, ...riskyCategories];
    
    // CRITICAL RULE: Can't have 2+ countries in same axis
    // (One player can't be from 2 countries!)
    pool = pool.filter(c => {
      if (usedIds.has(c.id)) return false;
      if (c.type === 'country' && rowHasCountry.value) return false;
      return true;
    });

    if (pool.length === 0) {
      console.warn(`⚠️ No valid categories for row ${i + 1}, using fallback`);
      pool = allCategories.filter(c => !usedIds.has(c.id) && !(c.type === 'country' && rowHasCountry.value));
    }
    
    let attempts = 0;
    while (attempts < 100 && pool.length > 0) {
      const index = pseudoRandom(pool.length, i * 100 + attempts);
      const candidate = pool[index];

      if (!usedIds.has(candidate.id)) {
        selected.push(candidate);
        usedIds.add(candidate.id);
        if (candidate.type === 'country') rowHasCountry.value = true;
        console.log(`  Row ${i + 1}: ${candidate.type} - ${candidate.label}`);
        break;
      }
      attempts++;
    }
  }

  // Select 3 COLUMNS
  for (let i = 0; i < 3; i++) {
    let pool = (i < 2) ? safeCategories : [...safeCategories, ...riskyCategories];
    
    // CRITICAL RULE: Can't have 2+ countries in same axis
    pool = pool.filter(c => {
      if (usedIds.has(c.id)) return false;
      if (c.type === 'country' && colHasCountry.value) return false;
      return true;
    });

    if (pool.length === 0) {
      console.warn(`⚠️ No valid categories for column ${i + 1}, using fallback`);
      pool = allCategories.filter(c => !usedIds.has(c.id) && !(c.type === 'country' && colHasCountry.value));
    }
    
    let attempts = 0;
    while (attempts < 100 && pool.length > 0) {
      const index = pseudoRandom(pool.length, (i + 3) * 100 + attempts);
      const candidate = pool[index];

      if (!usedIds.has(candidate.id)) {
        selected.push(candidate);
        usedIds.add(candidate.id);
        if (candidate.type === 'country') colHasCountry.value = true;
        console.log(`  Col ${i + 1}: ${candidate.type} - ${candidate.label}`);
        break;
      }
      attempts++;
    }
  }

  if (debug) {
    console.log(`🎲 Final selection: ${selected.map(c => `${c.type}:${c.label}`).join(', ')}`);
    console.log(`   Rows have country: ${rowHasCountry.value}, Cols have country: ${colHasCountry.value}`);
  }

  return selected;
}

async function validateQuizHasSolutions(categories: DailyQuiz): Promise<boolean> {
  const cellChecks: Promise<{ row: number; col: number; hasPlayers: boolean }>[] = [];
  
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      cellChecks.push(
        checkCellHasSolution(categories.rows[row], categories.columns[col]).then(hasPlayers => ({
          row, col, hasPlayers
        }))
      );
    }
  }
  
  const results = await Promise.all(cellChecks);
  const impossible = results.filter(r => !r.hasPlayers);
  
  if (impossible.length > 0) {
    console.log(`❌ ${impossible.length} impossible cells found`);
    impossible.forEach(cell => {
      console.log(`   [${cell.row},${cell.col}]: ${categories.rows[cell.row].label} + ${categories.columns[cell.col].label}`);
    });
    return false;
  }
  
  return true;
}

async function checkCellHasSolution(rowCategory: Category, colCategory: Category): Promise<boolean> {
  try {
    const { data: players, error } = await supabase
      .from('players')
      .select(`
        id, name, nationality, turned_pro, retired, plays_hand,
        player_achievements(id, tournament_id, year, result, achievement_type, tournaments(short_name)),
        player_rankings(singles_ranking)
      `)
      .limit(200);

    if (error || !players) return true; // Fail open

    for (const player of players) {
      const rowMatch = await validateCategory(player, rowCategory);
      const colMatch = await validateCategory(player, colCategory);
      if (rowMatch && colMatch) return true;
    }

    return false;
  } catch {
    return true; // Fail open
  }
}

// =============================================================================
// CACHING FUNCTIONS
// =============================================================================

interface CachedQuiz {
  id: string;
  date: string;
  quiz_source: 'manual' | 'algorithmic';
  quiz_template_id: string | null;
  quiz_data: any;
  generated_at: string;
  expires_at: string;
}

/**
 * Retrieves a cached quiz for the specified date if it exists and hasn't expired
 */
async function getCachedQuiz(date: string): Promise<CachedQuiz | null> {
  try {
    const { data, error } = await supabase
      .from('cached_daily_quizzes')
      .select('*')
      .eq('date', date)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return null;
    }

    return data as CachedQuiz;
  } catch (error) {
    console.error('Error fetching cached quiz:', error);
    return null;
  }
}

/**
 * Caches a quiz for 24 hours
 */
async function cacheQuiz(
  date: string,
  source: 'manual' | 'algorithmic',
  quizData: any,
  templateId: string | null = null
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Upsert: Insert or update if date already exists
    const { error } = await supabase
      .from('cached_daily_quizzes')
      .upsert({
        date,
        quiz_source: source,
        quiz_template_id: templateId,
        quiz_data: quizData,
        generated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'date'
      });

    if (error) {
      console.error('Error caching quiz:', error);
    }
  } catch (error) {
    console.error('Error caching quiz:', error);
  }
}

/**
 * Retrieves a published manual quiz for the specified date
 */
async function getManualQuizForDate(date: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('scheduled_date', date)
      .eq('is_published', true)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching manual quiz:', error);
    return null;
  }
}

