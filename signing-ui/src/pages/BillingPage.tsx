import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Check, Zap, ArrowRight, ExternalLink, LogOut, Settings } from 'lucide-react';

interface TenantInfo {
  plan: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

interface TenantUsage {
  envelopes: {
    used: number;
    limit: number;
    percentUsed: number;
  };
}

export function BillingPage() {
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  const authToken = localStorage.getItem('sendsign_token');
  if (!authToken) {
    navigate('/login');
    return null;
  }

  const authHeaders = useCallback(
    (): Record<string, string> => ({ Authorization: `Bearer ${authToken}` }),
    [authToken]
  );

  useEffect(() => {
    Promise.all([
      fetch('/api/tenants/me', { headers: authHeaders() }).then((r) => r.json()),
      fetch('/api/admin/usage', { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([tenantData, usageData]) => {
        if (tenantData.success) setTenant(tenantData.data);
        if (usageData.success) setUsage(usageData.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authHeaders]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        alert('Failed to create checkout session. Please try again.');
      }
    } catch {
      alert('Unable to connect to billing service.');
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const res = await fetch('/api/billing/portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        alert('Failed to open billing portal.');
      }
    } catch {
      alert('Unable to connect to billing service.');
    }
  };

  if (loading || !tenant) {
    return (
      <div className="min-h-screen bg-[#ebedf0] flex items-center justify-center">
        <div className="text-sm text-gray-500 font-semibold">Loading billing info...</div>
      </div>
    );
  }

  const isFreePlan = tenant.plan === 'free';
  const isProPlan = tenant.plan === 'pro';
  const isWhitelabel = tenant.plan === 'whitelabel';

  return (
    <div className="min-h-screen bg-[#ebedf0]">
      {/* Top nav */}
      <header className="bg-white border-b-2 border-gray-300 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <img src="/sendsign-logo.svg" alt="SendSign" className="h-[30px] w-auto shrink-0" />
              <h1 className="text-lg font-bold text-gray-900">Billing & Subscription</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/profile')}
                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                title="Account settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('sendsign_token');
                  localStorage.removeItem('sendsign_user');
                  navigate('/login');
                }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Current plan card */}
        <div className="bg-white rounded-xl border-2 border-gray-300 shadow-md overflow-hidden mb-6">
          <div className="px-6 py-5 border-b-2 border-gray-200 bg-gray-50">
            <h2 className="text-base font-bold text-gray-900">Current Plan</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-gray-900 capitalize">{tenant.plan}</p>
                <p className="text-sm text-gray-500">
                  {isFreePlan && '5 envelopes per month'}
                  {isProPlan && 'Unlimited envelopes — $29/user/mo'}
                  {isWhitelabel && 'Enterprise features included'}
                </p>
              </div>
            </div>

            {usage && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <span className="font-semibold">Usage this month:</span>
                <span className="text-gray-900 font-bold">
                  {usage.envelopes.used} / {usage.envelopes.limit === -1 ? '∞' : usage.envelopes.limit}
                </span>
                envelopes sent
              </div>
            )}

            {isProPlan && (
              <button
                onClick={handleManageSubscription}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-200 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                Manage Subscription
              </button>
            )}
          </div>
        </div>

        {/* Upgrade card (free plan only) */}
        {isFreePlan && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 shadow-md overflow-hidden">
            <div className="px-6 py-5 border-b-2 border-blue-100 bg-white/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-gray-900">Upgrade to Pro</h2>
                  <p className="text-sm text-gray-600">Unlock unlimited envelopes and advanced features</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Pricing */}
              <div className="text-center mb-6 p-5 bg-white rounded-lg border-2 border-blue-200">
                <p className="text-5xl font-extrabold text-gray-900">
                  $29
                  <span className="text-xl text-gray-500 font-semibold">/user/mo</span>
                </p>
                <p className="text-sm text-gray-600 mt-2">Billed monthly • Cancel anytime</p>
              </div>

              {/* Features */}
              <div className="space-y-3 mb-6">
                {[
                  'Unlimited envelopes per month',
                  'Unlimited users',
                  'All API, MCP, and webhook features',
                  'Advanced workflow automation',
                  'Bulk send operations',
                  '30-day audit retention',
                  'Priority email support',
                ].map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-sm text-gray-700 font-medium">{feature}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-base font-bold rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
              >
                {upgrading ? 'Processing...' : 'Upgrade Now'}
                {!upgrading && <ArrowRight className="w-5 h-5" />}
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Secure checkout powered by Stripe. No commitment, cancel anytime.
              </p>
            </div>
          </div>
        )}

        {/* Back to dashboard */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-blue-600 font-semibold hover:text-blue-800 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
