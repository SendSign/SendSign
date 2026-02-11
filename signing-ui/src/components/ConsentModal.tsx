import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle } from 'lucide-react';

interface ConsentModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentModal({ onAccept, onDecline }: ConsentModalProps) {
  const [agreedToEsign, setAgreedToEsign] = useState(false);
  const [agreedToLocation, setAgreedToLocation] = useState(false);

  const handleAccept = () => {
    if (agreedToEsign) {
      onAccept();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full my-8">
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-8 border-b border-gray-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
                Electronic Signature Consent
              </h2>
              <p className="text-sm text-gray-500">
                Please review and accept the terms below to proceed
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 py-6 space-y-6">
          {/* Main consent text */}
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 leading-relaxed">
              By proceeding, you agree to use electronic signatures to sign this document. 
              Electronic signatures are legally binding under the{' '}
              <strong>ESIGN Act (US)</strong>, <strong>eIDAS (EU)</strong>, and equivalent 
              laws in most jurisdictions worldwide.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              You have the right to opt out and request a paper copy by contacting the sender.
              If you choose to decline, you will not be able to sign this document electronically.
            </p>
          </div>

          {/* Consent checkboxes */}
          <div className="space-y-4 bg-gray-50 rounded-lg p-4 sm:p-6">
            {/* E-signature consent (required) */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToEsign}
                onChange={(e) => setAgreedToEsign(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  I agree to use electronic signatures to sign this document
                </span>
                <span className="text-red-500 ml-1">*</span>
                <p className="text-xs text-gray-500 mt-1">
                  Required to proceed
                </p>
              </div>
            </label>

            {/* Location/IP consent (optional but recommended) */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToLocation}
                onChange={(e) => setAgreedToLocation(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  I consent to recording my IP address and approximate location for audit purposes
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  Optional — Helps verify the authenticity of your signature
                </p>
              </div>
            </label>
          </div>

          {/* Disclaimer */}
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="font-medium text-gray-600 mb-1">Privacy Notice</p>
            <p>
              Your consent timestamp, user agent, and IP address (if consented) will be recorded 
              for audit and compliance purposes. This information will be included in the completion 
              certificate and may be used to verify the authenticity of your signature.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 sm:px-8 py-4 sm:py-6 bg-gray-50 rounded-b-xl flex flex-col sm:flex-row gap-3">
          <button
            onClick={onDecline}
            className="flex-1 sm:flex-none sm:w-40 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            <span>Decline</span>
          </button>
          <button
            onClick={handleAccept}
            disabled={!agreedToEsign}
            className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 shadow-lg disabled:shadow-none flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>I Agree — Continue</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
