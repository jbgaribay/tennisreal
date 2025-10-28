"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QuizMetadataFormProps {
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  scheduledDate: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onDifficultyChange: (difficulty: 'easy' | 'medium' | 'hard') => void;
  onScheduledDateChange: (date: string) => void;
}

export function QuizMetadataForm({
  title,
  description,
  difficulty,
  scheduledDate,
  onTitleChange,
  onDescriptionChange,
  onDifficultyChange,
  onScheduledDateChange,
}: QuizMetadataFormProps) {
  // Get tomorrow's date as minimum
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quiz Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">
            Quiz Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g., Grand Slam Legends"
            maxLength={255}
          />
          <p className="text-xs text-muted-foreground">
            {title.length}/255 characters
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="A brief description of this quiz..."
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            {description.length}/500 characters
          </p>
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select value={difficulty} onValueChange={(value) => onDifficultyChange(value as 'easy' | 'medium' | 'hard')}>
            <SelectTrigger id="difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Scheduled Date */}
        <div className="space-y-2">
          <Label htmlFor="scheduledDate">
            Scheduled Date <span className="text-red-500">*</span>
          </Label>
          <Input
            id="scheduledDate"
            type="date"
            value={scheduledDate}
            onChange={(e) => onScheduledDateChange(e.target.value)}
            min={minDate}
          />
          <p className="text-xs text-muted-foreground">
            The date when this quiz will appear. Leave blank to save as draft.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
