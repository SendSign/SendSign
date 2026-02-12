import { useSearchParams } from 'react-router-dom';
import { SendSignBranding } from '../components/SendSignBranding';

export function ExpiredPage() {
  const [params] = useSearchParams();
  const reason = params.get('reason') ?? 'expired';

  const isVoided = reason.toLowerCase().includes('void') || reason.toLowerCase().includes('cancel');
  const isDeclined = reason.toLowerCase().includes('decline');

  const icon = isDeclined || isVoided ? (
    <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ) : (
    <svg className="w-10 h-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const title = isDeclined
    ? 'You Declined to Sign'
    : isVoided
      ? 'Signing Request Cancelled'
      : 'Signing Link Expired';

  const message = isDeclined
    ? 'You have declined to sign this document. The sender has been notified.'
    : isVoided
      ? 'This signing request has been cancelled by the sender. No further action is needed from you.'
      : 'This signing link has expired. Please contact the sender to request a new link.';

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isDeclined || isVoided ? 'bg-red-100' : 'bg-yellow-100'
          }`}>
            {icon}
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-3">
            {title}
          </h1>

          <p className="text-gray-600 mb-6">
            {message}
          </p>

          <div className="bg-gray-50 rounded-xl p-5">
            <p className="text-sm text-gray-500">
              If you believe this is an error, please contact the person who sent you this document.
            </p>
          </div>
        </div>
      </div>
      <SendSignBranding />
    </div>
  );
}
