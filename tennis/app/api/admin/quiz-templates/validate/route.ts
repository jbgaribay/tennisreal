// app/api/admin/quiz-templates/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import { requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { validateCategory } from '@/lib/validation';
import type { Category } from '@/lib/types';

const supabase = getServerSupabase();

interface ValidateQuizRequest {
  rowCategories: Category[];
  colCategories: Category[];
}

interface CellValidation {
  row: number;
  col: number;
  playerCount: number;
  status: 'safe' | 'risky' | 'impossible';
  samplePlayers?: string[];  // First few player names (for debugging)
}

/**
 * POST /api/admin/quiz-templates/validate
 * Validate a quiz by checking all 9 cells and counting valid players
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    const body: ValidateQuizRequest = await request.json();

    // Validate input
    if (!body.rowCategories || !body.colCategories) {
      return NextResponse.json(
        { success: false, error: 'Missing rowCategories or colCategories' },
        { status: 400 }
      );
    }

    if (body.rowCategories.length !== 3 || body.colCategories.length !== 3) {
      return NextResponse.json(
        { success: false, error: 'Must have exactly 3 row and 3 column categories' },
        { status: 400 }
      );
    }

    console.log('🔍 Validating quiz with categories:');
    console.log('  Rows:', body.rowCategories.map(c => c.label).join(', '));
    console.log('  Cols:', body.colCategories.map(c => c.label).join(', '));

    const startTime = Date.now();

    // Check all 9 cells in parallel
    const validationPromises: Promise<CellValidation>[] = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        validationPromises.push(
          validateCell(
            body.rowCategories[row],
            body.colCategories[col],
            row,
            col
          )
        );
      }
    }

    const cells = await Promise.all(validationPromises);

    const validationTime = Date.now() - startTime;

    // Calculate summary statistics
    const impossibleCells = cells.filter(c => c.status === 'impossible');
    const riskyCells = cells.filter(c => c.status === 'risky');
    const safeCells = cells.filter(c => c.status === 'safe');
    const playerCounts = cells.map(c => c.playerCount);

    const summary = {
      totalCells: 9,
      validCells: cells.filter(c => c.playerCount > 0).length,
      impossibleCells: impossibleCells.length,
      riskyCells: riskyCells.length,
      safeCells: safeCells.length,
      minSolutions: Math.min(...playerCounts),
      maxSolutions: Math.max(...playerCounts),
      avgSolutions: playerCounts.reduce((a, b) => a + b, 0) / 9,
      validationTimeMs: validationTime
    };

    console.log(`✅ Validation complete in ${validationTime}ms`);
    console.log(`   Safe: ${safeCells.length}, Risky: ${riskyCells.length}, Impossible: ${impossibleCells.length}`);

    // Determine overall status
    let overallStatus: 'excellent' | 'good' | 'warning' | 'error';
    if (impossibleCells.length > 0) {
      overallStatus = 'error';
    } else if (riskyCells.length > 2) {
      overallStatus = 'warning';
    } else if (riskyCells.length > 0) {
      overallStatus = 'good';
    } else {
      overallStatus = 'excellent';
    }

    return NextResponse.json({
      success: true,
      data: {
        cells,
        summary,
        status: overallStatus,
        message: getValidationMessage(overallStatus, summary)
      }
    });

  } catch (error: any) {
    console.error('Quiz validation error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to validate quiz'),
      { status: 500 }
    );
  }
}

/**
 * Validate a single cell and count matching players
 */
async function validateCell(
  rowCategory: Category,
  colCategory: Category,
  row: number,
  col: number
): Promise<CellValidation> {
  try {
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
        player_achievements(
          id,
          tournament_id,
          year,
          result,
          achievement_type,
          tournaments(short_name)
        ),
        player_rankings(singles_ranking)
      `)
      .limit(500);  // Limit to prevent timeout

    if (error || !players) {
      console.error(`Error fetching players for cell [${row},${col}]:`, error);
      return {
        row,
        col,
        playerCount: 0,
        status: 'impossible',
        samplePlayers: []
      };
    }

    // Check each player against both categories
    const validPlayers: string[] = [];

    for (const player of players) {
      const rowMatch = await validateCategory(player, rowCategory);
      const colMatch = await validateCategory(player, colCategory);

      if (rowMatch && colMatch) {
        validPlayers.push(player.name);
      }
    }

    const playerCount = validPlayers.length;

    // Determine status based on count
    let status: 'safe' | 'risky' | 'impossible';
    if (playerCount === 0) {
      status = 'impossible';
    } else if (playerCount < 3) {
      status = 'risky';
    } else {
      status = 'safe';
    }

    return {
      row,
      col,
      playerCount,
      status,
      samplePlayers: validPlayers.slice(0, 5)  // First 5 players
    };

  } catch (error) {
    console.error(`Error validating cell [${row},${col}]:`, error);
    return {
      row,
      col,
      playerCount: 0,
      status: 'impossible',
      samplePlayers: []
    };
  }
}

/**
 * Get a human-readable validation message
 */
function getValidationMessage(
  status: 'excellent' | 'good' | 'warning' | 'error',
  summary: any
): string {
  switch (status) {
    case 'excellent':
      return `Perfect! All cells have 3+ valid players. Minimum: ${summary.minSolutions} players.`;
    case 'good':
      return `Good quiz! ${summary.riskyCells} cell(s) have fewer than 3 players. Minimum: ${summary.minSolutions} players.`;
    case 'warning':
      return `Warning: ${summary.riskyCells} cells have fewer than 3 players. Consider adjusting categories. Minimum: ${summary.minSolutions} players.`;
    case 'error':
      return `Error: ${summary.impossibleCells} cell(s) have no valid players. Please adjust your categories.`;
    default:
      return 'Validation complete.';
  }
}
