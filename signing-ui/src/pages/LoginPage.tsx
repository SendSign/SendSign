import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle SSO callback: if ?sso_token= is present, store and redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso_token');
    if (ssoToken) {
      localStorage.setItem('sendsign_token', ssoToken);
      // Fetch user info
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${ssoToken}` } })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data?.user) {
            localStorage.setItem('sendsign_user', JSON.stringify(data.data.user));
          }
          navigate('/dashboard');
        })
        .catch(() => navigate('/dashboard'));
    }
    // If already logged in, redirect to dashboard
    const existing = localStorage.getItem('sendsign_token');
    if (existing && !ssoToken) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (data.success && data.data?.token) {
        // Store JWT
        localStorage.setItem('sendsign_token', data.data.token);
        localStorage.setItem('sendsign_user', JSON.stringify(data.data.user));
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Unable to connect to the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#ebedf0] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/sendsign-logo.svg"
            alt="SendSign"
            className="h-[36px] w-auto mx-auto mb-3"
          />
          <p className="text-sm text-gray-500 font-medium">Sign documents. Securely.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border-2 border-gray-300 shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b-2 border-gray-200 bg-gray-50">
            <h1 className="text-lg font-bold text-gray-900">Sign in to your account</h1>
          </div>

          <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-4">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border-2 border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[12px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-3 py-3 border-2 border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-400"
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-3 border-2 border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-gray-400"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#2563eb] text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-all shadow-md hover:shadow-lg mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* Divider */}
          <div className="px-8">
            <div className="border-t-2 border-gray-200" />
          </div>

          {/* SSO */}
          <div className="px-8 py-5">
            <button
              type="button"
              onClick={async () => {
                if (!email.trim()) {
                  setError('Enter your email first to detect SSO');
                  return;
                }
                try {
                  const res = await fetch(`/api/sso/detect?email=${encodeURIComponent(email.trim())}`);
                  const data = await res.json();
                  if (data.success && data.data?.ssoAvailable && data.data?.loginUrl) {
                    window.location.href = data.data.loginUrl;
                  } else {
                    setError('SSO is not configured for this email domain. Use password login.');
                  }
                } catch {
                  setError('Unable to check SSO availability');
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign in with SSO
            </button>
          </div>
        </div>

        {/* Register link */}
        <p className="text-center text-sm text-gray-500 font-medium mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 font-bold hover:text-blue-800 transition-colors">
            Create one
          </Link>
        </p>

        {/* Footer */}
        <div className="text-center mt-8">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <span className="font-medium">Powered by</span>
            <img src="/sendsign-logo.svg" alt="SendSign" className="h-5 w-auto inline-block" />
          </div>
        </div>
      </div>
    </div>
  );
}
