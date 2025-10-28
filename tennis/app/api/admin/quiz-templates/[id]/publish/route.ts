// app/api/admin/quiz-templates/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, handleApiError } from '@/lib/supabase/api-client';
import { requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';

const supabase = getServerSupabase();

/**
 * POST /api/admin/quiz-templates/[id]/publish
 * Publish a quiz template (make it active for its scheduled date)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin();

    // Fetch the quiz template
    const { data: quiz, error: fetchError } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !quiz) {
      return NextResponse.json(
        { success: false, error: 'Quiz template not found' },
        { status: 404 }
      );
    }

    // Check if already published
    if (quiz.is_published) {
      return NextResponse.json(
        { success: false, error: 'Quiz is already published' },
        { status: 400 }
      );
    }

    // Validate that quiz has a scheduled date
    if (!quiz.scheduled_date) {
      return NextResponse.json(
        { success: false, error: 'Cannot publish quiz without a scheduled date' },
        { status: 400 }
      );
    }

    // Check if there's already a published quiz for this date
    const { data: existingQuiz, error: checkError } = await supabase
      .from('quiz_templates')
      .select('id, title')
      .eq('scheduled_date', quiz.scheduled_date)
      .eq('is_published', true)
      .neq('id', params.id)
      .single();

    if (existingQuiz) {
      return NextResponse.json(
        {
          success: false,
          error: `Another quiz "${existingQuiz.title}" is already published for ${quiz.scheduled_date}`
        },
        { status: 409 }
      );
    }

    console.log(`📢 Publishing quiz "${quiz.title}" for ${quiz.scheduled_date}`);

    // Publish the quiz
    const { data: published, error: publishError } = await supabase
      .from('quiz_templates')
      .update({
        is_published: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (publishError) {
      console.error('Error publishing quiz:', publishError);
      return NextResponse.json(
        { success: false, error: publishError.message },
        { status: 500 }
      );
    }

    // Invalidate any existing cache for that date
    if (quiz.scheduled_date) {
      console.log(`🗑️  Invalidating cache for ${quiz.scheduled_date}`);

      const { error: cacheDeleteError } = await supabase
        .from('cached_daily_quizzes')
        .delete()
        .eq('date', quiz.scheduled_date);

      if (cacheDeleteError) {
        console.error('Error invalidating cache:', cacheDeleteError);
        // Don't fail the publish if cache invalidation fails
      }
    }

    console.log(`✅ Quiz published successfully`);

    return NextResponse.json({
      success: true,
      data: { quiz: published },
      message: `Quiz published for ${quiz.scheduled_date}`
    });

  } catch (error: any) {
    console.error('Quiz publish error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to publish quiz'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/quiz-templates/[id]/publish
 * Unpublish a quiz template (revert to draft)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    // Fetch the quiz template
    const { data: quiz, error: fetchError } = await supabase
      .from('quiz_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !quiz) {
      return NextResponse.json(
        { success: false, error: 'Quiz template not found' },
        { status: 404 }
      );
    }

    // Check if not published
    if (!quiz.is_published) {
      return NextResponse.json(
        { success: false, error: 'Quiz is not published' },
        { status: 400 }
      );
    }

    console.log(`📉 Unpublishing quiz "${quiz.title}"`);

    // Unpublish the quiz
    const { data: unpublished, error: unpublishError } = await supabase
      .from('quiz_templates')
      .update({
        is_published: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (unpublishError) {
      console.error('Error unpublishing quiz:', unpublishError);
      return NextResponse.json(
        { success: false, error: unpublishError.message },
        { status: 500 }
      );
    }

    // Invalidate cache for that date
    if (quiz.scheduled_date) {
      console.log(`🗑️  Invalidating cache for ${quiz.scheduled_date}`);

      await supabase
        .from('cached_daily_quizzes')
        .delete()
        .eq('date', quiz.scheduled_date);
    }

    console.log(`✅ Quiz unpublished successfully`);

    return NextResponse.json({
      success: true,
      data: { quiz: unpublished },
      message: 'Quiz unpublished successfully'
    });

  } catch (error: any) {
    console.error('Quiz unpublish error:', error);

    if (error.message === 'Authentication required' || error.message === 'Admin access required') {
      return unauthorizedResponse(error.message);
    }

    return NextResponse.json(
      handleApiError(error, 'Failed to unpublish quiz'),
      { status: 500 }
    );
  }
}
