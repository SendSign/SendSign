import { CoSealBranding } from '../components/CoSealBranding';

export function CompletePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-semibold text-gray-900 mb-3">
            Document Signed
          </h1>

          <p className="text-gray-600 mb-8">
            Your signature has been recorded and the document is being processed.
            You will receive a copy of the fully executed document via email once all parties have signed.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-medium text-gray-700 mb-2">What happens next?</h2>
            <ul className="text-sm text-gray-600 text-left space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#10003;</span>
                Your signature has been securely recorded
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">&#8987;</span>
                Waiting for other signers to complete
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">&#128274;</span>
                Once complete, the document will be cryptographically sealed
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">&#9993;</span>
                You'll receive the final document by email
              </li>
            </ul>
          </div>

          <p className="text-xs text-gray-400">
            You can safely close this window.
          </p>
        </div>
      </div>
      <CoSealBranding />
    </div>
  );
}
