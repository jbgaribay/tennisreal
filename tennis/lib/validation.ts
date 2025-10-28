/**
 * Shared validation logic for player categories
 * Used across multiple API routes to ensure consistency
 */

import type { Category } from '@/lib/types';

/**
 * Validate a player against a category
 * Expects player data to be pre-loaded with related data (achievements, rankings)
 */
export async function validateCategory(player: any, category: Category): Promise<boolean> {
  try {
    switch (category.type) {
      case 'country':
        return player.nationality === category.value;

      case 'tournament':
        return validateTournamentFromData(player, category.value);

      case 'era':
        return validateEra(player, category.value);

      case 'style':
        return player.plays_hand === category.value;

      case 'ranking':
        return validateRankingFromData(player, category.value);

      case 'achievement':
        return validateAchievementFromData(player, category.value);

      default:
        console.log(`❓ Unknown category type: ${category.type}`);
        return false;
    }
  } catch (error) {
    console.error('❌ Category validation error:', error);
    return false;
  }
}

/**
 * Validate tournament from pre-loaded data (no DB query)
 */
export function validateTournamentFromData(player: any, tournamentName: string): boolean {
  if (!player.player_achievements || !Array.isArray(player.player_achievements)) {
    return false;
  }

  return player.player_achievements.some((achievement: any) =>
    achievement.tournaments?.short_name === tournamentName &&
    achievement.result === 'winner'
  );
}

/**
 * Validate ranking from pre-loaded data (no DB query)
 */
export function validateRankingFromData(player: any, rankingType: string): boolean {
  if (!player.player_rankings || !Array.isArray(player.player_rankings)) {
    return false;
  }

  switch (rankingType) {
    case 'world_no1':
      // Check if they ever achieved #1 ranking
      const hasNo1Ranking = player.player_rankings.some(
        (r: any) => r.singles_ranking === 1
      );

      // Also check for Year-End #1 achievement
      const hasYearEndNo1 = player.player_achievements?.some(
        (a: any) => a.tournaments?.short_name === 'Year-End #1'
      );

      return hasNo1Ranking || hasYearEndNo1;

    case 'top10':
      return player.player_rankings.some(
        (r: any) => r.singles_ranking <= 10
      );

    default:
      return false;
  }
}

/**
 * Validate achievement from pre-loaded data (no DB query)
 */
export function validateAchievementFromData(player: any, achievementType: string): boolean {
  if (!player.player_achievements || !Array.isArray(player.player_achievements)) {
    return false;
  }

  return player.player_achievements.some(
    (achievement: any) => achievement.achievement_type === achievementType
  );
}

/**
 * Validate era - handles both simple and complex formats
 */
export function validateEra(player: any, era: string): boolean {
  const turnedPro = player.turned_pro;
  const retired = player.retired;
  const currentYear = new Date().getFullYear();

  const careerStart = turnedPro || 1990;
  const careerEnd = retired || currentYear;

  // Handle JSON format from database categories
  if (era.startsWith('{')) {
    try {
      const eraData = JSON.parse(era);
      if (eraData.active_years) {
        const { start, end } = eraData.active_years;
        return careerStart <= end && careerEnd >= start;
      }
    } catch (error) {
      console.error('Error parsing era JSON:', error);
      return false;
    }
  }

  // Handle simple string format
  switch (era) {
    case '2020s':
      return careerEnd >= 2020;
    case '2010s':
      return careerStart <= 2019 && careerEnd >= 2010;
    case '2000s':
      return careerStart <= 2009 && careerEnd >= 2000;
    case '1990s':
      return careerStart <= 1999 && careerEnd >= 1990;
    default:
      return false;
  }
}

/**
 * Helper to get country name from country code
 */
export function getCountryName(code: string): string {
  const names: Record<string, string> = {
    'USA': 'USA', 'ESP': 'Spain', 'SRB': 'Serbia', 'SUI': 'Switzerland',
    'GBR': 'Great Britain', 'FRA': 'France', 'GER': 'Germany', 'AUS': 'Australia',
    'ITA': 'Italy', 'ARG': 'Argentina', 'RUS': 'Russia', 'CAN': 'Canada',
    'CRO': 'Croatia', 'AUT': 'Austria', 'BEL': 'Belgium', 'NED': 'Netherlands'
  };
  return names[code] || code;
}

/**
 * Helper to format achievement labels
 */
export function formatAchievementLabel(achievement: string): string {
  return achievement.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
