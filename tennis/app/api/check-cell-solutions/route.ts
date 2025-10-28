// app/api/check-cell-solutions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import type { Category } from '@/lib/types';
import { validateCategory } from '@/lib/validation';

const supabase = getServerSupabase();

export async function POST(request: NextRequest) {
  try {
    const { rowCategory, colCategory } = await request.json();

    console.log('🔍 Finding solutions for:', {
      row: rowCategory.label,
      col: colCategory.label
    });

    // Fetch all players with their related data
    const { data: players, error } = await supabase
      .from('players')
      .select(`
        id,
        name,
        nationality,
        turned_pro,
        retired,
        plays_hand,
        player_achievements (
          id,
          tournament_id,
          year,
          result,
          achievement_type,
          tournaments (
            short_name,
            name,
            level
          )
        ),
        player_rankings (
          singles_ranking
        )
      `)
      .limit(1000); // Limit for performance

    if (error || !players) {
      throw new Error('Failed to fetch players');
    }

    console.log(`📊 Checking ${players.length} players...`);

    // Test each player against both categories
    const validPlayers: Array<{
      name: string;
      nationality: string | null;
      rowMatch: boolean;
      colMatch: boolean;
    }> = [];

    for (const player of players) {
      const rowMatch = await validateCategory(player, rowCategory);
      const colMatch = await validateCategory(player, colCategory);

      if (rowMatch && colMatch) {
        validPlayers.push({
          name: player.name,
          nationality: player.nationality,
          rowMatch,
          colMatch
        });
      }
    }

    console.log(`✅ Found ${validPlayers.length} valid solutions`);

    return NextResponse.json({
      success: true,
      solutions: validPlayers,
      count: validPlayers.length,
      rowCategory: rowCategory.label,
      colCategory: colCategory.label
    });

  } catch (error) {
    console.error('❌ Check solutions error:', error);
    return NextResponse.json(
      handleApiError(error, 'Failed to check cell solutions'),
      { status: 500 }
    );
  }
}