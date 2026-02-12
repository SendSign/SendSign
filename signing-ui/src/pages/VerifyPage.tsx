import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SendSignBranding } from '../components/SendSignBranding';

type VerificationStep = 'email' | 'sms' | 'government_id' | 'complete';

interface SSODetectionResult {
  ssoAvailable: boolean;
  organizationId?: string;
  loginUrl?: string;
}

export function VerifyPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const method = params.get('method') ?? 'email';
  const level = params.get('level') ?? 'simple';
  const signerEmail = params.get('email') ?? '';

  // SSO detection
  const [ssoInfo, setSsoInfo] = useState<SSODetectionResult | null>(null);

  useEffect(() => {
    // Check if SSO is available for this email
    if (signerEmail) {
      fetch(`/api/sso/detect?email=${encodeURIComponent(signerEmail)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data.ssoAvailable) {
            setSsoInfo(data.data);
          }
        })
        .catch(() => {
          // SSO detection failed - continue with normal verification
        });
    }
  }, [signerEmail]);

  // AES two-factor state
  const [step, setStep] = useState<VerificationStep>(
    method === 'sms' ? 'sms' : 'email'
  );
  const [emailVerified, setEmailVerified] = useState(false);

  // Government ID state
  const [idFile, setIdFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleOtpSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sign/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, step }),
      });

      const data = await res.json();
      if (data.success) {
        if (level === 'advanced' && step === 'email' && !emailVerified) {
          // Two-factor: email passed, now need SMS
          setEmailVerified(true);
          setStep('sms');
          setCode('');
        } else {
          navigate(`/sign/${token}`);
        }
      } else {
        setError(data.error || 'Invalid verification code');
      }
    } catch {
      setError('Unable to verify. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [code, step, token, level, emailVerified, navigate]);

  const handleIdUpload = useCallback(async () => {
    if (!idFile) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('document', idFile);

      const res = await fetch(`/api/sign/${token}/verify-id`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        if (data.data?.redirectUrl) {
          // Redirect to external ID verification provider
          window.location.href = data.data.redirectUrl;
        } else {
          navigate(`/sign/${token}`);
        }
      } else {
        setError(data.error || 'ID verification failed');
      }
    } catch {
      setError('Unable to upload ID. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [idFile, token, navigate]);

  // Government ID verification UI
  if (method === 'government_id' || (level === 'advanced' && step === 'government_id')) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">Government ID Verification</h1>
                <p className="text-gray-600 mt-2">
                  This document requires identity verification. Please upload a photo of your government-issued ID.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-blue-800 mb-2">Why is this needed?</h3>
                <p className="text-xs text-blue-700">
                  This document uses an Advanced Electronic Signature (AES) under eIDAS regulation.
                  Identity verification ensures the signature is uniquely linked to you and meets
                  European legal requirements.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accepted documents
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-2xl block mb-1">🛂</span>
                      Passport
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-2xl block mb-1">🪪</span>
                      Driver&#39;s License
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-2xl block mb-1">🆔</span>
                      National ID
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="id-upload" className="block text-sm font-medium text-gray-700 mb-1">
                    Upload your ID
                  </label>
                  <input
                    type="file"
                    id="id-upload"
                    accept="image/*,.pdf"
                    onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
                    aria-label="Upload government ID"
                  />
                  {idFile && (
                    <p className="mt-2 text-sm text-gray-600">
                      Selected: {idFile.name}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-red-600 text-sm text-center" role="alert">{error}</p>
                )}

                <button
                  onClick={handleIdUpload}
                  disabled={!idFile || uploading}
                  className="btn-primary w-full"
                >
                  {uploading ? 'Uploading...' : 'Verify My Identity'}
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                Your ID is processed securely and not stored after verification.
              </p>
            </div>
          </div>
        </div>
        <SendSignBranding />
      </div>
    );
  }

  // OTP verification UI (email, SMS, or two-factor)
  const isAdvancedTwoFactor = level === 'advanced';
  const currentStepLabel = step === 'sms' ? 'phone' : 'email';

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {/* SSO option if available */}
            {ssoInfo && ssoInfo.ssoAvailable && (
              <div className="mb-6 text-center">
                <button
                  onClick={() => {
                    if (ssoInfo.loginUrl) {
                      window.location.href = `${ssoInfo.loginUrl}?returnUrl=/sign/${token}`;
                    }
                  }}
                  className="w-full py-3 px-4 border-2 border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50 flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span>Sign in with your organization</span>
                </button>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">or continue with verification code</span>
                  </div>
                </div>
              </div>
            )}
            {/* Progress indicator for two-factor */}
            {isAdvancedTwoFactor && (
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center space-x-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    emailVerified ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {emailVerified ? '✓' : '1'}
                  </div>
                  <div className={`w-12 h-0.5 ${emailVerified ? 'bg-green-400' : 'bg-gray-200'}`} />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === 'sms' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    2
                  </div>
                </div>
              </div>
            )}

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900">Verify Your Identity</h1>
              <p className="text-gray-600 mt-2">
                {isAdvancedTwoFactor && emailVerified
                  ? 'Step 2: We sent a 6-digit code to your phone.'
                  : isAdvancedTwoFactor
                    ? 'Step 1: We sent a 6-digit code to your email.'
                    : step === 'sms'
                      ? 'We sent a 6-digit code to your phone.'
                      : 'We sent a 6-digit code to your email.'
                }
              </p>
            </div>

            {isAdvancedTwoFactor && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-700">
                  This document requires two-factor verification (email + SMS) for
                  Advanced Electronic Signature (AES) compliance under eIDAS.
                </p>
              </div>
            )}

            <form onSubmit={handleOtpSubmit}>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                {isAdvancedTwoFactor
                  ? `Verification Code (${currentStepLabel})`
                  : 'Verification Code'
                }
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="input-field text-center text-2xl tracking-[0.3em] font-mono mb-4"
                aria-label={`Enter 6-digit verification code from your ${currentStepLabel}`}
                aria-invalid={!!error}
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
              />

              {error && (
                <p className="text-red-600 text-sm mb-4 text-center" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={code.length !== 6 || loading}
                className="btn-primary w-full"
              >
                {loading
                  ? 'Verifying...'
                  : isAdvancedTwoFactor && !emailVerified
                    ? 'Verify Email & Continue'
                    : 'Verify & Continue'
                }
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              This code expires in 10 minutes.
            </p>
          </div>
        </div>
      </div>
      <SendSignBranding />
    </div>
  );
}
