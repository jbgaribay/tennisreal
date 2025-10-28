"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Category } from '@/lib/types';
import { X, Shuffle } from 'lucide-react';

interface CategorySelectorProps {
  categories: Category[];
  selectedCategory: Category | null;
  onCategoryChange: (category: Category) => void;
  onRemove?: () => void;
  label: string;
  availableCategories: Category[];
}

const categoryTypeColors: Record<string, string> = {
  country: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  tournament: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  era: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  style: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  ranking: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  achievement: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export function CategorySelector({
  categories,
  selectedCategory,
  onCategoryChange,
  onRemove,
  label,
  availableCategories,
}: CategorySelectorProps) {
  // Group categories by type
  const groupedCategories = availableCategories.reduce((acc, cat) => {
    if (!acc[cat.type]) {
      acc[cat.type] = [];
    }
    acc[cat.type].push(cat);
    return acc;
  }, {} as Record<string, Category[]>);

  const getCategoryColor = (type: string) => {
    return categoryTypeColors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="relative">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              {label}
            </div>

            {selectedCategory ? (
              <div className="flex items-center gap-2">
                <Badge className={getCategoryColor(selectedCategory.type)}>
                  {selectedCategory.type}
                </Badge>
                <span className="font-medium">{selectedCategory.label}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No category selected
              </div>
            )}
          </div>
        </div>

        <Select
          value={selectedCategory?.id || ''}
          onValueChange={(id) => {
            const category = availableCategories.find((c) => c.id === id);
            if (category) {
              onCategoryChange(category);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a category..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedCategories).map(([type, cats]) => (
              <div key={type}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  {type}
                </div>
                {cats.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <Badge className={getCategoryColor(cat.type)} variant="outline">
                        {cat.type}
                      </Badge>
                      <span>{cat.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        {selectedCategory && (
          <div className="mt-2 text-xs text-muted-foreground">
            {selectedCategory.description}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
