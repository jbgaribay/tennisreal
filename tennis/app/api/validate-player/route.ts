// app/api/validate-player/route.ts - REFACTORED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import type { Category, ValidationResult } from '@/lib/types';
import { validateCategory } from '@/lib/validation';

const supabase = getServerSupabase();

export async function POST(request: NextRequest) {
  try {
    const { playerName, rowCategory, colCategory } = await request.json();

    console.log('\n🎾 VALIDATING PLAYER:', playerName);
    console.log('📋 Row Category:', rowCategory);
    console.log('📋 Col Category:', colCategory);

    // Fetch player with all related data in ONE query (optimized!)
    const { data: player, error: playerError } = await supabase
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
      .ilike('name', playerName)
      .single();

    if (playerError || !player) {
      return NextResponse.json({
        valid: false,
        error: `Player "${playerName}" not found in database`
      });
    }

    console.log('✅ Player found:', player.name);

    // Validate both categories
    const rowMatch = await validateCategory(player, rowCategory);
    const colMatch = await validateCategory(player, colCategory);

    console.log(`\n🔍 Validation Results:`);
    console.log(`   Row (${rowCategory.label}): ${rowMatch ? '✅' : '❌'}`);
    console.log(`   Col (${colCategory.label}): ${colMatch ? '✅' : '❌'}`);

    const isValid = rowMatch && colMatch;

    const response: ValidationResult = {
      valid: isValid,
      player: {
        id: player.id,
        name: player.name,
        nationality: player.nationality
      },
      error: isValid ? undefined : `${player.name} doesn't match the criteria`,
      debug: {
        rowMatch,
        colMatch,
        rowCategory,
        colCategory
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Validation error:', error);
    return NextResponse.json(
      handleApiError(error, 'Failed to validate player'),
      { status: 500 }
    );
  }
}