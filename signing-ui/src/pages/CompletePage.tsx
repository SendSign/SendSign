import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { CheckCircle, Clock, Lock, Mail, Download } from 'lucide-react';
import { SendSignBranding } from '../components/SendSignBranding';

export function CompletePage() {
  const [searchParams] = useSearchParams();
  const envelopeId = searchParams.get('envelopeId');
  const token = searchParams.get('token');
  // Trigger confetti animation on mount
  useEffect(() => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#2563eb', '#3b82f6', '#10b981', '#22c55e'],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#2563eb', '#3b82f6', '#10b981', '#22c55e'],
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          {/* Animated checkmark */}
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-scale-in">
            <CheckCircle className="w-12 h-12 text-green-600" strokeWidth={2.5} />
          </div>

          <h1 className="text-3xl font-semibold text-gray-900 mb-3">
            Document Signed
          </h1>

          <p className="text-gray-600 mb-6">
            Your signature has been recorded and the document is being processed.
            You will receive a copy of the fully executed document via email once all parties have signed.
          </p>

          {/* Download buttons (if envelope ID is available) */}
          {envelopeId && token && (
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <a
                href={`/api/sign/${token}/signed-document`}
                download
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                <Download className="w-4 h-4" />
                <span>Download Signed Document</span>
              </a>
              <a
                href={`/api/sign/${token}/certificate`}
                download
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Certificate</span>
              </a>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-medium text-gray-700 mb-2">What happens next?</h2>
            <ul className="text-sm text-gray-600 text-left space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span>Your signature has been securely recorded</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <span>Waiting for other signers to complete</span>
              </li>
              <li className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <span>Once complete, the document will be cryptographically sealed</span>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <span>You'll receive the final document by email</span>
              </li>
            </ul>
          </div>

          <p className="text-xs text-gray-400">
            You can safely close this window.
          </p>
        </div>
      </div>
      <SendSignBranding />
    </div>
  );
}
