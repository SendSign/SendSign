import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { PrivacyFooter } from '../components/PrivacyFooter';

interface OAuthStatus {
  google: boolean;
  github: boolean;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus | null>(null);

  // Check which OAuth providers are enabled
  useEffect(() => {
    fetch('/app/auth/oauth-status')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setOAuthStatus(data.data);
        }
      })
      .catch(() => {
        // Silently fail, just hide OAuth buttons
        setOAuthStatus({ google: false, github: false });
      });
  }, []);

  // Handle SSO callback: if ?sso_token= is present, store and redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso_token');
    const welcomeParam = params.get('welcome');
    
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
      navigate(welcomeParam === 'true' ? '/dashboard?welcome=true' : '/dashboard');
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

          <div className="p-8 flex flex-col gap-4">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border-2 border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* OAuth Buttons */}
            {oauthStatus && (oauthStatus.google || oauthStatus.github) && (
              <>
                {oauthStatus.google && (
                  <a
                    href="/app/auth/google"
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </a>
                )}

                {oauthStatus.github && (
                  <a
                    href="/app/auth/github"
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-[#24292e] border-2 border-[#24292e] text-white text-sm font-bold rounded-lg hover:bg-[#2f363d] transition-all"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    Continue with GitHub
                  </a>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-gray-300" />
                  <span className="text-xs text-gray-500 font-semibold">or</span>
                  <div className="flex-1 h-px bg-gray-300" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

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
          </div>

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

        {/* Footer with privacy links */}
        <div className="mt-6">
          <PrivacyFooter />
        </div>
      </div>
    </div>
  );
}
