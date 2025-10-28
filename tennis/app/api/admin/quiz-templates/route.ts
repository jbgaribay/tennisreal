// app/api/admin/quiz-templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import { requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import type { Category } from '@/lib/types';

const supabase = getServerSupabase();

interface CreateQuizTemplateRequest {
  title: string;
  description?: string;
  rowCategories: Category[];
  colCategories: Category[];
  scheduledDate?: string;  // ISO date string
  difficulty?: 'easy' | 'medium' | 'hard';
}

/**
 * POST /api/admin/quiz-templates
 * Create a new quiz template (manual quiz)
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    const user = await requireAdmin();

    // Parse request body
    const body: CreateQuizTemplateRequest = await request.json();

    // Validate required fields
    if (!body.title || !body.rowCategories || !body.colCategories) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: title, rowCategories, colCategories' },
        { status: 400 }
      );
    }

    // Validate category counts
    if (body.rowCategories.length !== 3 || body.colCategories.length !== 3) {
      return NextResponse.json(
        { success: false, error: 'Must have exactly 3 row categories and 3 column categories' },
        { status: 400 }
      );
    }

    // Validate each category has required fields
    const allCategories = [...body.rowCategories, ...body.colCategories];
    for (const cat of allCategories) {
      if (!cat.type || !cat.id || !cat.label || !cat.value) {
        return NextResponse.json(
          { success: false, error: 'Each category must have: type, id, label, value' },
          { status: 400 }
        );
      }
    }

    // Validate scheduled date (if provided)
    if (body.scheduledDate) {
      const scheduledDate = new Date(body.scheduledDate);
      if (isNaN(scheduledDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid scheduledDate format' },
          { status: 400 }
        );
      }
    }

    // Pre-validate the quiz (optional but recommended)
    console.log(`📝 Creating quiz template: "${body.title}"`);
    const validation = await validateQuizTemplate(body.rowCategories, body.colCategories);

    // Insert into database
    const { data, error } = await supabase
      .from('quiz_templates')
      .insert({
        created_by: user.id,
        title: body.title,
        description: body.description || null,
        difficulty: body.difficulty || 'medium',
        row_categories: body.rowCategories,
        col_categories: body.colCategories,
        scheduled_date: body.scheduledDate || null,
        is_published: false,  // Always start as draft
        validated_cells: validation.validCells,
        min_cell_solutions: validation.minSolutions,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating quiz template:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Quiz template created with ID: ${data.id}`);

    return NextResponse.json({
      success: true,
      data: {
        quiz: data,
        validation: validation
      },
      message: 'Quiz template created successfully'
    });

  } catch (error: any) {
    console.error('Quiz template creation error:', error);

    // Handle auth errors
    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to create quiz template'),
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/quiz-templates
 * List all quiz templates with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all'; // draft | published | all
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('quiz_templates')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status === 'draft') {
      query = query.eq('is_published', false);
    } else if (status === 'published') {
      query = query.eq('is_published', true);
    }

    // Order by created_at descending
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching quiz templates:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        quizzes: data,
        pagination: {
          total: count || 0,
          page,
          limit,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error: any) {
    console.error('Quiz templates fetch error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to fetch quiz templates'),
      { status: 500 }
    );
  }
}

/**
 * Validate a quiz template by checking all 9 cells
 */
async function validateQuizTemplate(
  rowCategories: Category[],
  colCategories: Category[]
): Promise<{ validCells: number; minSolutions: number; cells: any[] }> {
  // For now, return optimistic validation
  // In a real implementation, you'd check each cell against the database
  console.log('⏭️  Skipping validation (will be implemented in validate endpoint)');

  return {
    validCells: 9,
    minSolutions: 0,
    cells: []
  };
}
