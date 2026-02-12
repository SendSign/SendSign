import { useEffect, useState } from 'react';

interface AnalyticsSummary {
  totalEnvelopes: number;
  completed: number;
  pending: number;
  voided: number;
  completionRate: number;
  avgTimeToComplete: string;
}

interface DailyCount {
  date: string;
  sent: number;
  completed: number;
}

interface StatusBreakdown {
  status: string;
  count: number;
}

interface RecentEvent {
  envelopeId: string;
  action: string;
  actor: string;
  timestamp: string;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  dailyCounts: DailyCount[];
  statusBreakdown: StatusBreakdown[];
  recentEvents: RecentEvent[];
}

export function AdminDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiKey = prompt('Enter admin API key:');
      if (!apiKey) {
        setError('API key required');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/analytics?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error ?? 'Unknown error');
      }

      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchAnalytics()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, dailyCounts, statusBreakdown, recentEvents } = data;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">SendSign Analytics</h1>
          <p className="mt-2 text-gray-600">Signing activity and statistics</p>

          {/* Period selector */}
          <div className="mt-4 flex space-x-2">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-md font-medium ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {p === 'all' ? 'All Time' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <SummaryCard
            title="Total Envelopes"
            value={summary.totalEnvelopes}
            icon="📄"
          />
          <SummaryCard
            title="Completed"
            value={summary.completed}
            subtitle={`${Math.round(summary.completionRate * 100)}% completion rate`}
            icon="✅"
          />
          <SummaryCard
            title="Pending"
            value={summary.pending}
            icon="⏳"
          />
          <SummaryCard
            title="Avg. Time to Complete"
            value={summary.avgTimeToComplete}
            icon="⏱️"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Daily Activity */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Activity (Last 30 Days)</h2>
            <div className="space-y-2">
              {dailyCounts.slice(-10).map((day) => (
                <div key={day.date} className="flex items-center">
                  <span className="text-sm text-gray-600 w-24">{day.date.slice(5)}</span>
                  <div className="flex-1 flex space-x-1">
                    <div
                      className="bg-blue-500 h-6 rounded"
                      style={{ width: `${(day.sent / Math.max(...dailyCounts.map((d) => d.sent), 1)) * 100}%` }}
                      title={`Sent: ${day.sent}`}
                    />
                    <div
                      className="bg-green-500 h-6 rounded"
                      style={{ width: `${(day.completed / Math.max(...dailyCounts.map((d) => d.completed), 1)) * 100}%` }}
                      title={`Completed: ${day.completed}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex space-x-4 text-sm">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-500 rounded mr-2" />
                <span>Sent</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-500 rounded mr-2" />
                <span>Completed</span>
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Breakdown</h2>
            <div className="space-y-3">
              {statusBreakdown.map((status) => (
                <div key={status.status} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <StatusBadge status={status.status} />
                    <span className="ml-3 text-sm font-medium text-gray-700 capitalize">
                      {status.status}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{status.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Envelope</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentEvents.map((event, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">{event.envelopeId.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatAction(event.action)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{event.actor}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatTimestamp(event.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {icon && <span className="text-4xl">{icon}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    voided: 'bg-red-100 text-red-800',
    draft: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}
