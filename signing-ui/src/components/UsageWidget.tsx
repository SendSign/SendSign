import { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TenantUsage {
  tenantId: string;
  period: string; // YYYY-MM
  envelopes: {
    used: number;
    limit: number;
    percentUsed: number;
  };
  users: {
    active: number;
    limit: number;
  };
  templates: {
    count: number;
    limit: number;
  };
  storage: {
    bytesUsed: number;
  };
}

interface TenantInfo {
  plan: string;
  status: string;
}

export function UsageWidget({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/usage', { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/tenants/me', { headers: authHeaders() }).then(r => r.json()),
    ])
      .then(([usageData, tenantData]) => {
        if (usageData.success && usageData.data) {
          setUsage(usageData.data);
        }
        if (tenantData.success && tenantData.data) {
          setTenant(tenantData.data);
        }
      })
      .catch(() => {
        // silently fail
      })
      .finally(() => setLoading(false));
  }, [authHeaders]);

  if (loading || !usage) {
    return (
      <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-md animate-pulse">
        <div className="h-6 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-4 w-full bg-gray-100 rounded" />
      </div>
    );
  }

  const plan = tenant?.plan || 'free';
  const isFreePlan = plan === 'free';
  const isUnlimited = usage.envelopes.limit === -1;

  // Calculate reset date (first of next month)
  const now = new Date();
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetDateStr = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // Progress bar color based on usage
  const barColor =
    usage.envelopes.percentUsed >= 100
      ? 'bg-red-500'
      : usage.envelopes.percentUsed >= 80
      ? 'bg-amber-500'
      : 'bg-blue-500';

  return (
    <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Envelope Usage
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {usage.period} billing period
          </p>
        </div>
        {isFreePlan && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-300 uppercase tracking-wider">
            Free
          </span>
        )}
        {plan === 'pro' && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            Pro
          </span>
        )}
        {plan === 'whitelabel' && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 uppercase tracking-wider">
            White-Label
          </span>
        )}
      </div>

      {/* Usage display */}
      {isUnlimited ? (
        // Unlimited plan — no bar
        <div className="text-center py-3">
          <p className="text-3xl font-extrabold text-gray-900">{usage.envelopes.used}</p>
          <p className="text-xs text-gray-500 mt-1">envelopes sent this month</p>
        </div>
      ) : (
        // Limited plan — show bar + upgrade CTA
        <>
          <div className="mb-3">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-2xl font-extrabold text-gray-900">
                {usage.envelopes.used} <span className="text-base text-gray-500 font-semibold">/ {usage.envelopes.limit}</span>
              </p>
              <span className="text-xs text-gray-500 font-semibold">
                {usage.envelopes.percentUsed}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
              <div
                className={`h-full ${barColor} transition-all duration-300`}
                style={{ width: `${Math.min(usage.envelopes.percentUsed, 100)}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Resets {resetDateStr}
          </p>

          {/* Upgrade CTA */}
          {isFreePlan && usage.envelopes.percentUsed >= 60 && (
            <Link
              to="/app/billing"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-50 border-2 border-blue-200 text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all"
            >
              Upgrade to Pro for unlimited
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}

          {/* Warning when limit reached */}
          {usage.envelopes.percentUsed >= 100 && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border-2 border-red-200 rounded-lg mt-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-semibold">
                You've reached your monthly limit. Upgrade to keep sending.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
