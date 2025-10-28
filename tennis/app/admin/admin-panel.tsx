"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DatabaseStats {
  players: number;
  tournaments: number;
  achievements: number;
}

export default function AdminPanel() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [message, setMessage] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/populate-db');
      const data = await response.json();
      setStats(data);
      setMessage('✅ Stats loaded successfully');
    } catch (error) {
      console.error('Error fetching stats:', error);
      setMessage('❌ Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  const superPopulate = async () => {
    if (!confirm('⚠️ This will REPLACE ALL existing data. Continue?')) {
      return;
    }

    setLoading(true);
    setMessage('🚀 Starting comprehensive database population...\n\nThis will take 5-10 minutes. Please wait...');

    try {
      const response = await fetch('/api/super-populate', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setMessage(`🎉 SUPER POPULATE COMPLETE!

✅ ${result.stats.playersAdded} players added
🏆 ${result.stats.tournamentsAdded} tournaments added
🏅 ${result.stats.achievementsAdded} achievements added
❌ ${result.stats.errors} errors

${result.summary}

🎮 Database ready for tennis grids!`);
        await fetchStats();
      } else {
        setMessage(`❌ Error: ${result.error}\n${result.details || ''}`);
      }
    } catch (error) {
      setMessage(`❌ Connection Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const clearDatabase = async () => {
    if (!confirm('⚠️ This will DELETE ALL DATA. Are you absolutely sure?')) {
      return;
    }

    if (!confirm('🚨 FINAL WARNING: This action cannot be undone!')) {
      return;
    }

    setLoading(true);
    setMessage('🗑️ Clearing all database tables...');

    try {
      const response = await fetch('/api/clear-database', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setMessage('✅ Database cleared successfully. Ready for fresh population.');
        await fetchStats();
      } else {
        setMessage(`❌ Error: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setMessage(`❌ Connection Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const testDailyQuiz = async () => {
    setLoading(true);
    setMessage('🧪 Testing daily quiz generation...');

    try {
      const response = await fetch(`/api/daily-quiz?t=${Date.now()}&debug=true`);
      const result = await response.json();

      if (result.success) {
        const debugInfo = result.debug;
        setMessage(`✅ Daily Quiz Generated Successfully!

📊 Category Pool:
   • ${debugInfo.categoryBreakdown.countries} countries
   • ${debugInfo.categoryBreakdown.grandSlams} Grand Slams
   • ${debugInfo.categoryBreakdown.masters} Masters 1000
   • ${debugInfo.categoryBreakdown.achievements} achievement types
   • ${debugInfo.totalCategories} total categories

🎯 Selected Categories:
   Rows: ${debugInfo.selectedRows.join(', ')}
   Columns: ${debugInfo.selectedColumns.join(', ')}

Seed: ${result.seed}`);
      } else {
        setMessage(`❌ Quiz generation failed: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const checkDatabaseHealth = async () => {
    setLoading(true);
    setMessage('🏥 Checking database health...');

    try {
      const [playersRes, tournamentsRes, achievementsRes] = await Promise.all([
        fetch('/api/check-players'),
        fetch('/api/populate-db'),
        fetch('/api/expand-achievements')
      ]);

      const [playersData, tournamentsData, achievementsData] = await Promise.all([
        playersRes.json(),
        tournamentsRes.json(),
        achievementsRes.json()
      ]);

      setMessage(`🏥 Database Health Check:

👥 Players: ${playersData.totalPlayers || 0}
🏆 Tournaments: ${tournamentsData.tournaments || 0}
🏅 Achievements: ${achievementsData.achievements || 0}

${playersData.totalPlayers > 200 ? '✅' : '⚠️'} Players database ${playersData.totalPlayers > 200 ? 'looks good' : 'needs more data'}
${tournamentsData.tournaments > 10 ? '✅' : '⚠️'} Tournaments ${tournamentsData.tournaments > 10 ? 'sufficient' : 'need more tournaments'}
${achievementsData.achievements > 100 ? '✅' : '⚠️'} Achievements ${achievementsData.achievements > 100 ? 'well populated' : 'need more achievements'}`);

      setStats({
        players: playersData.totalPlayers || 0,
        tournaments: tournamentsData.tournaments || 0,
        achievements: achievementsData.achievements || 0
      });
    } catch (error) {
      setMessage(`❌ Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🎾 Tennis Grids Admin</h1>
        <p className="text-muted-foreground">
          Database management and testing tools (Authentication Required)
        </p>
      </div>

      {/* Stats Card */}
      {stats && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>📊 Current Database Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.players}</div>
                <div className="text-sm text-muted-foreground">Players</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats.tournaments}</div>
                <div className="text-sm text-muted-foreground">Tournaments</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{stats.achievements}</div>
                <div className="text-sm text-muted-foreground">Achievements</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🛠️ Admin Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={checkDatabaseHealth}
            disabled={loading}
            className="w-full"
            variant="outline"
          >
            🏥 Check Database Health
          </Button>

          <Button
            onClick={testDailyQuiz}
            disabled={loading}
            className="w-full"
            variant="outline"
          >
            🧪 Test Daily Quiz Generation
          </Button>

          <Button
            onClick={superPopulate}
            disabled={loading}
            className="w-full"
          >
            🚀 Super Populate Database
          </Button>

          <Button
            onClick={clearDatabase}
            disabled={loading}
            className="w-full"
            variant="destructive"
          >
            🗑️ Clear All Data
          </Button>

          <Button
            onClick={fetchStats}
            disabled={loading}
            className="w-full"
            variant="secondary"
          >
            🔄 Refresh Stats
          </Button>
        </CardContent>
      </Card>

      {/* Message Display */}
      {message && (
        <Card>
          <CardHeader>
            <CardTitle>📝 Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg overflow-x-auto">
              {message}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>💡 Quick Start Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <strong>1. First Time Setup:</strong>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>Click "Super Populate Database" to load 500+ players and tournaments</li>
                <li>Wait 5-10 minutes for completion</li>
                <li>Database will be ready for daily grids</li>
              </ul>
            </div>
            <div>
              <strong>2. Testing:</strong>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>Use "Test Daily Quiz" to verify quiz generation</li>
                <li>Use "Check Database Health" to verify data integrity</li>
                <li>Visit <a href="/debug-quiz" className="text-blue-600 hover:underline">/debug-quiz</a> to test the full grid interface</li>
              </ul>
            </div>
            <div>
              <strong>3. Maintenance:</strong>
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>"Clear All Data" removes everything (use before re-populating)</li>
                <li>"Refresh Stats" updates the current database counts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
