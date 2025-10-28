// app/api/admin/suggest-categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import { requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { getCountryName, formatAchievementLabel } from '@/lib/validation';
import type { Category } from '@/lib/types';

const supabase = getServerSupabase();

/**
 * GET /api/admin/suggest-categories
 * Get AI-suggested categories for creating a new quiz
 * Uses the same smart selection logic as algorithmic quiz generation
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const difficulty = searchParams.get('difficulty') || 'medium';
    const seedParam = searchParams.get('seed');
    const count = parseInt(searchParams.get('count') || '3'); // How many alternatives to generate

    // Use provided seed or generate one based on timestamp
    const baseSeed = seedParam ? parseInt(seedParam) : Date.now();

    console.log(`💡 Generating category suggestions (difficulty: ${difficulty}, seed: ${baseSeed})`);

    // Build category pool (reuse logic from daily-quiz)
    const allCategories = await buildCategoryPool();

    if (allCategories.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No categories available' },
        { status: 500 }
      );
    }

    // Generate primary suggestion
    const primarySuggestion = selectSmartCategories(allCategories, baseSeed);

    // Generate alternatives with different seeds
    const alternatives = [];
    for (let i = 1; i <= count; i++) {
      const altSeed = baseSeed + (i * 10000);
      const altSuggestion = selectSmartCategories(allCategories, altSeed);
      alternatives.push({
        rows: altSuggestion.slice(0, 3),
        columns: altSuggestion.slice(3, 6),
        seed: altSeed
      });
    }

    console.log(`✅ Generated ${alternatives.length + 1} category suggestions`);

    return NextResponse.json({
      success: true,
      data: {
        primary: {
          rows: primarySuggestion.slice(0, 3),
          columns: primarySuggestion.slice(3, 6),
          seed: baseSeed
        },
        alternatives,
        totalAvailableCategories: allCategories.length
      }
    });

  } catch (error: any) {
    console.error('Category suggestion error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to generate category suggestions'),
      { status: 500 }
    );
  }
}

/**
 * Build the complete pool of available categories
 * This is the same logic used in daily-quiz generation
 */
async function buildCategoryPool(): Promise<Category[]> {
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

  const viableCountries = Object.entries(countryCounts)
    .filter(([_, count]) => count >= 3)
    .map(([country]) => country);

  // Get tournaments by level
  const grandSlams = tournamentsResult.data?.filter(t => t.level === 'grand_slam') || [];
  const masters = tournamentsResult.data?.filter(t => t.level === 'atp_masters_1000') || [];
  const atp500s = tournamentsResult.data?.filter(t => t.level === 'atp_500') || [];

  // Get unique achievements
  const uniqueAchievements = [...new Set(
    achievementTypesResult.data?.map(a => a.achievement_type).filter(Boolean) || []
  )];

  const allCategories: Category[] = [];

  // 1. Countries
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

  // 3. Masters 1000
  masters.forEach(t => {
    allCategories.push({
      type: 'tournament',
      id: `tournament_${t.short_name}`,
      label: t.short_name,
      description: `Won ${t.short_name}`,
      value: t.short_name
    });
  });

  // 4. ATP 500s
  atp500s.slice(0, 10).forEach(t => {
    allCategories.push({
      type: 'tournament',
      id: `tournament_${t.short_name}`,
      label: t.short_name,
      description: `Won ${t.short_name}`,
      value: t.short_name
    });
  });

  // 5. Eras
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

  // 7. Rankings
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

  // 8. Achievements
  uniqueAchievements.slice(0, 20).forEach(achievement => {
    allCategories.push({
      type: 'achievement',
      id: `achievement_${achievement}`,
      label: formatAchievementLabel(achievement),
      description: formatAchievementLabel(achievement),
      value: achievement
    });
  });

  return allCategories;
}

/**
 * Smart category selection (same logic as daily-quiz)
 */
function selectSmartCategories(allCategories: Category[], seed: number): Category[] {
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

  const selected: Category[] = [];
  const usedIds = new Set<string>();
  const rowHasCountry = { value: false };
  const colHasCountry = { value: false };

  // Select 3 ROWS
  for (let i = 0; i < 3; i++) {
    let pool = (i < 2) ? safeCategories : [...safeCategories, ...riskyCategories];

    // CRITICAL RULE: Can't have 2+ countries in same axis
    pool = pool.filter(c => {
      if (usedIds.has(c.id)) return false;
      if (c.type === 'country' && rowHasCountry.value) return false;
      return true;
    });

    if (pool.length === 0) {
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
        break;
      }
      attempts++;
    }
  }

  return selected;
}
