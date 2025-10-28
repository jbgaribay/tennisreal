"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { Category } from '@/lib/types';

interface ValidationCell {
  row: number;
  col: number;
  playerCount: number;
  status: 'safe' | 'risky' | 'impossible';
  samplePlayers?: string[];
}

interface ValidationSummary {
  totalCells: number;
  validCells: number;
  impossibleCells: number;
  riskyCells: number;
  safeCells: number;
  minSolutions: number;
  maxSolutions: number;
  avgSolutions: number;
  validationTimeMs: number;
}

interface LiveValidationGridProps {
  rowCategories: (Category | null)[];
  colCategories: (Category | null)[];
  cells: ValidationCell[];
  summary: ValidationSummary | null;
  status: 'excellent' | 'good' | 'warning' | 'error' | null;
  message: string | null;
  isValidating: boolean;
}

export function LiveValidationGrid({
  rowCategories,
  colCategories,
  cells,
  summary,
  status,
  message,
  isValidating,
}: LiveValidationGridProps) {
  const getCellData = (row: number, col: number): ValidationCell | null => {
    return cells.find((c) => c.row === row && c.col === col) || null;
  };

  const getCellColor = (cellData: ValidationCell | null) => {
    if (!cellData) return 'bg-gray-100 dark:bg-gray-800';

    switch (cellData.status) {
      case 'safe':
        return 'bg-green-100 dark:bg-green-900/30 border-green-500';
      case 'risky':
        return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500';
      case 'impossible':
        return 'bg-red-100 dark:bg-red-900/30 border-red-500';
      default:
        return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'excellent':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'good':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'error':
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusVariant = () => {
    switch (status) {
      case 'excellent':
      case 'good':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {isValidating && <Loader2 className="h-4 w-4 animate-spin" />}
          Live Validation Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Status Message */}
        {status && message && (
          <Alert variant={getStatusVariant()} className="mb-4">
            {getStatusIcon()}
            <AlertTitle>
              {status === 'excellent' && 'Excellent!'}
              {status === 'good' && 'Good Quiz'}
              {status === 'warning' && 'Warning'}
              {status === 'error' && 'Error'}
            </AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {/* Grid Preview */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-24"></th>
                {colCategories.map((cat, idx) => (
                  <th key={idx} className="p-2 text-xs font-medium text-center">
                    {cat ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {cat.type}
                        </Badge>
                        <span className="truncate max-w-[100px]">
                          {cat.label}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowCategories.map((rowCat, rowIdx) => (
                <tr key={rowIdx}>
                  <td className="p-2 text-xs font-medium text-right">
                    {rowCat ? (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">
                          {rowCat.type}
                        </Badge>
                        <span className="truncate max-w-[100px]">
                          {rowCat.label}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  {colCategories.map((_, colIdx) => {
                    const cellData = getCellData(rowIdx, colIdx);
                    const hasCategories = rowCat && colCategories[colIdx];

                    return (
                      <td key={colIdx} className="p-1">
                        <div
                          className={`
                            h-16 w-full rounded border-2 flex flex-col items-center justify-center
                            ${hasCategories ? getCellColor(cellData) : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'}
                            transition-colors
                          `}
                          title={
                            cellData?.samplePlayers?.length
                              ? `Sample players: ${cellData.samplePlayers.join(', ')}`
                              : undefined
                          }
                        >
                          {isValidating && hasCategories ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : cellData ? (
                            <>
                              <div className="text-2xl font-bold">
                                {cellData.playerCount}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {cellData.status === 'safe' && '✓'}
                                {cellData.status === 'risky' && '⚠'}
                                {cellData.status === 'impossible' && '✗'}
                              </div>
                            </>
                          ) : hasCategories ? (
                            <div className="text-xs text-muted-foreground">
                              Not validated
                            </div>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-green-500"></div>
            <span>Safe (3+ players)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-yellow-500"></div>
            <span>Risky (1-2 players)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-red-500"></div>
            <span>Impossible (0 players)</span>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Valid Cells</div>
              <div className="text-lg font-bold">{summary.validCells}/9</div>
            </div>
            <div>
              <div className="text-muted-foreground">Min Solutions</div>
              <div className="text-lg font-bold">{summary.minSolutions}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Avg Solutions</div>
              <div className="text-lg font-bold">
                {summary.avgSolutions.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Validation Time</div>
              <div className="text-lg font-bold">
                {(summary.validationTimeMs / 1000).toFixed(1)}s
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
