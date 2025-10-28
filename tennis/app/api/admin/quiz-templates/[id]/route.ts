// app/api/admin/quiz-templates/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import { requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import type { Category } from '@/lib/types';

const supabase = getServerSupabase();

interface UpdateQuizTemplateRequest {
  title?: string;
  description?: string;
  rowCategories?: Category[];
  colCategories?: Category[];
  scheduledDate?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

/**
 * GET /api/admin/quiz-templates/[id]
 * Get a specific quiz template by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const { data, error } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Quiz template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { quiz: data }
    });

  } catch (error: any) {
    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to fetch quiz template'),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/quiz-templates/[id]
 * Update a quiz template (only drafts can be updated)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin();
    const body: UpdateQuizTemplateRequest = await request.json();

    // Fetch existing quiz template
    const { data: existing, error: fetchError } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: 'Quiz template not found' },
        { status: 404 }
      );
    }

    // Check if quiz is published (published quizzes cannot be edited)
    if (existing.is_published) {
      return NextResponse.json(
        { success: false, error: 'Cannot update a published quiz. Create a new one instead.' },
        { status: 400 }
      );
    }

    // Validate categories if provided
    if (body.rowCategories && body.rowCategories.length !== 3) {
      return NextResponse.json(
        { success: false, error: 'Must have exactly 3 row categories' },
        { status: 400 }
      );
    }

    if (body.colCategories && body.colCategories.length !== 3) {
      return NextResponse.json(
        { success: false, error: 'Must have exactly 3 column categories' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty;
    if (body.rowCategories !== undefined) updateData.row_categories = body.rowCategories;
    if (body.colCategories !== undefined) updateData.col_categories = body.colCategories;
    if (body.scheduledDate !== undefined) {
      updateData.scheduled_date = body.scheduledDate ? body.scheduledDate : null;
    }

    // Update the quiz template
    const { data, error } = await supabase
      .from('quiz_templates')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating quiz template:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Quiz template ${params.id} updated`);

    return NextResponse.json({
      success: true,
      data: { quiz: data },
      message: 'Quiz template updated successfully'
    });

  } catch (error: any) {
    console.error('Quiz template update error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to update quiz template'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/quiz-templates/[id]
 * Delete a quiz template (only drafts can be deleted)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    // Fetch existing quiz template
    const { data: existing, error: fetchError } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: 'Quiz template not found' },
        { status: 404 }
      );
    }

    // Check if quiz is published
    if (existing.is_published) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a published quiz. Unpublish it first.' },
        { status: 400 }
      );
    }

    // Delete the quiz template
    const { error } = await supabase
      .from('quiz_templates')
      .delete()
      .eq('id', params.id);

    if (error) {
      console.error('Error deleting quiz template:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`🗑️  Quiz template ${params.id} deleted`);

    return NextResponse.json({
      success: true,
      message: 'Quiz template deleted successfully'
    });

  } catch (error: any) {
    console.error('Quiz template deletion error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to delete quiz template'),
      { status: 500 }
    );
  }
}
