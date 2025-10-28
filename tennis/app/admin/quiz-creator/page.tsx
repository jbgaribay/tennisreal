"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategorySelector } from '@/components/admin/category-selector';
import { LiveValidationGrid } from '@/components/admin/live-validation-grid';
import { QuizMetadataForm } from '@/components/admin/quiz-metadata-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Category } from '@/lib/types';
import { Loader2, Sparkles, Save, Send, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function QuizCreatorPage() {
  const router = useRouter();

  // Quiz metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [scheduledDate, setScheduledDate] = useState('');

  // Categories
  const [rowCategories, setRowCategories] = useState<(Category | null)[]>([null, null, null]);
  const [colCategories, setColCategories] = useState<(Category | null)[]>([null, null, null]);
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);

  // Validation state
  const [validationCells, setValidationCells] = useState<any[]>([]);
  const [validationSummary, setValidationSummary] = useState<any>(null);
  const [validationStatus, setValidationStatus] = useState<'excellent' | 'good' | 'warning' | 'error' | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // UI state
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Debounce timer for validation
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);

  // Fetch suggestions on mount
  useEffect(() => {
    fetchSuggestions();
  }, []);

  // Auto-validate when categories change (debounced)
  useEffect(() => {
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    // Check if we have all categories filled
    const allFilled =
      rowCategories.every(cat => cat !== null) &&
      colCategories.every(cat => cat !== null);

    if (allFilled) {
      const timeout = setTimeout(() => {
        validateQuiz();
      }, 1000); // 1 second debounce

      setValidationTimeout(timeout);
    }

    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [rowCategories, colCategories]);

  const fetchSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/suggest-categories');
      const result = await response.json();

      if (result.success) {
        const { primary } = result.data;
        setRowCategories(primary.rows);
        setColCategories(primary.columns);

        // Extract all unique categories from suggestions
        const allCats = [...primary.rows, ...primary.columns];
        const uniqueCats = Array.from(
          new Map(allCats.map(cat => [cat.id, cat])).values()
        );
        setAvailableCategories(uniqueCats);
      } else {
        setError('Failed to load category suggestions');
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError('Failed to load suggestions. Please try again.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const validateQuiz = async () => {
    // Filter out null categories
    const validRows = rowCategories.filter((cat): cat is Category => cat !== null);
    const validCols = colCategories.filter((cat): cat is Category => cat !== null);

    if (validRows.length !== 3 || validCols.length !== 3) {
      return; // Not all categories filled
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/quiz-templates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowCategories: validRows,
          colCategories: validCols,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setValidationCells(result.data.cells);
        setValidationSummary(result.data.summary);
        setValidationStatus(result.data.status);
        setValidationMessage(result.data.message);
      } else {
        setError('Validation failed: ' + result.error);
      }
    } catch (err) {
      console.error('Error validating quiz:', err);
      setError('Failed to validate quiz. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const saveQuiz = async (publish: boolean = false) => {
    // Validate required fields
    if (!title.trim()) {
      setError('Please enter a quiz title');
      return;
    }

    if (!scheduledDate && publish) {
      setError('Please select a scheduled date to publish');
      return;
    }

    const validRows = rowCategories.filter((cat): cat is Category => cat !== null);
    const validCols = colCategories.filter((cat): cat is Category => cat !== null);

    if (validRows.length !== 3 || validCols.length !== 3) {
      setError('Please select all 3 row and 3 column categories');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Create quiz template
      const createResponse = await fetch('/api/admin/quiz-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          difficulty,
          rowCategories: validRows,
          colCategories: validCols,
          scheduledDate: scheduledDate || undefined,
        }),
      });

      const createResult = await createResponse.json();

      if (!createResult.success) {
        setError('Failed to create quiz: ' + createResult.error);
        return;
      }

      const quizId = createResult.data.quiz.id;

      // Publish if requested
      if (publish) {
        const publishResponse = await fetch(
          `/api/admin/quiz-templates/${quizId}/publish`,
          { method: 'POST' }
        );

        const publishResult = await publishResponse.json();

        if (!publishResult.success) {
          setError('Quiz created but failed to publish: ' + publishResult.error);
          return;
        }

        setSuccess(`Quiz "${title}" published successfully for ${scheduledDate}!`);
      } else {
        setSuccess(`Quiz "${title}" saved as draft!`);
      }

      // Redirect to admin panel after 2 seconds
      setTimeout(() => {
        router.push('/admin');
      }, 2000);
    } catch (err) {
      console.error('Error saving quiz:', err);
      setError('Failed to save quiz. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => router.push('/admin')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>

        <h1 className="text-3xl font-bold">Create Manual Quiz</h1>
        <p className="text-muted-foreground mt-2">
          Build a custom quiz with your choice of categories
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-6">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Category Selection */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                onClick={fetchSuggestions}
                disabled={isLoadingSuggestions}
                variant="outline"
                className="w-full"
              >
                {isLoadingSuggestions ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Get New Suggestions
                  </>
                )}
              </Button>

              <Button
                onClick={() => validateQuiz()}
                disabled={isValidating}
                variant="outline"
                className="w-full"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  'Validate Now'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Row Categories */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Row Categories</h2>
            <div className="space-y-3">
              {rowCategories.map((cat, idx) => (
                <CategorySelector
                  key={`row-${idx}`}
                  categories={availableCategories}
                  selectedCategory={cat}
                  onCategoryChange={(newCat) => {
                    const newRows = [...rowCategories];
                    newRows[idx] = newCat;
                    setRowCategories(newRows);
                  }}
                  label={`Row ${idx + 1}`}
                  availableCategories={availableCategories}
                />
              ))}
            </div>
          </div>

          {/* Column Categories */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Column Categories</h2>
            <div className="space-y-3">
              {colCategories.map((cat, idx) => (
                <CategorySelector
                  key={`col-${idx}`}
                  categories={availableCategories}
                  selectedCategory={cat}
                  onCategoryChange={(newCat) => {
                    const newCols = [...colCategories];
                    newCols[idx] = newCat;
                    setColCategories(newCols);
                  }}
                  label={`Column ${idx + 1}`}
                  availableCategories={availableCategories}
                />
              ))}
            </div>
          </div>

          {/* Metadata Form */}
          <QuizMetadataForm
            title={title}
            description={description}
            difficulty={difficulty}
            scheduledDate={scheduledDate}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onDifficultyChange={setDifficulty}
            onScheduledDateChange={setScheduledDate}
          />
        </div>

        {/* Right Column: Validation Preview */}
        <div className="space-y-6">
          <LiveValidationGrid
            rowCategories={rowCategories}
            colCategories={colCategories}
            cells={validationCells}
            summary={validationSummary}
            status={validationStatus}
            message={validationMessage}
            isValidating={isValidating}
          />

          {/* Save Buttons */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button
                onClick={() => saveQuiz(false)}
                disabled={isSaving || !title.trim()}
                variant="outline"
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save as Draft
                  </>
                )}
              </Button>

              <Button
                onClick={() => saveQuiz(true)}
                disabled={
                  isSaving ||
                  !title.trim() ||
                  !scheduledDate ||
                  validationStatus === 'error'
                }
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Publish Quiz
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                {validationStatus === 'error'
                  ? '⚠️ Cannot publish quiz with impossible cells'
                  : 'Publishing will make this quiz live on the scheduled date'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
