import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SendSignBranding } from '../components/SendSignBranding';

type Step = 'confirm' | 'signing' | 'handoff';

export function InPersonPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('confirm');
  const [signerName] = useState('');
  const [senderName] = useState('the sender');

  const handleConfirmIdentity = () => {
    setStep('signing');
    navigate(`/sign/${token}`);
  };

  if (step === 'handoff') {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold text-gray-900 mb-3">
              Please return this device
            </h1>
            <p className="text-lg text-gray-600">
              Please hand this device back to <span className="font-semibold">{senderName}</span>.
            </p>
          </div>
        </div>
        <SendSignBranding />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900">In-Person Signing</h1>
              <p className="text-gray-600 mt-2">
                Please confirm your identity to begin signing.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                You are signing as: <span className="font-semibold">{signerName || 'Loading...'}</span>
              </p>
            </div>

            <button
              onClick={handleConfirmIdentity}
              className="btn-primary w-full"
            >
              I confirm — Begin Signing
            </button>

            <p className="text-xs text-gray-400 text-center mt-4">
              Your signature will be recorded along with this device's IP address and user agent for audit purposes.
            </p>
          </div>
        </div>
      </div>
      <SendSignBranding />
    </div>
  );
}
