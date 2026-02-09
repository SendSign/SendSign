import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CoSealBranding } from '../components/CoSealBranding';

export function PowerFormPage() {
  const { powerformId } = useParams<{ powerformId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/powerforms/${powerformId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || undefined }),
      });

      const data = await res.json();
      if (data.success && data.data?.signingToken) {
        navigate(`/sign/${data.data.signingToken}`);
      } else {
        setError(data.error || 'Failed to start signing session');
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold text-gray-900">Sign Document</h1>
              <p className="text-gray-600 mt-2">
                Enter your information to begin signing.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  required
                  autoFocus
                  aria-required="true"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="input-field"
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={!name.trim() || !email.trim() || loading}
                className="btn-primary w-full"
              >
                {loading ? 'Starting...' : 'Continue to Signing'}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              By continuing, you agree to use electronic signatures.
            </p>
          </div>
        </div>
      </div>
      <CoSealBranding />
    </div>
  );
}
