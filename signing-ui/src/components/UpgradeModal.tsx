import { createPortal } from 'react-dom';
import { X, Zap, Check } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  limit: number;
  used: number;
  resetDate: string;
  onUpgrade: () => void;
}

export function UpgradeModal({ isOpen, onClose, limit, used, resetDate, onUpgrade }: UpgradeModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b-2 border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-100 rounded-full opacity-50" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-indigo-100 rounded-full opacity-50" />
          <div className="relative">
            <button
              onClick={onClose}
              className="absolute right-0 top-0 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-3">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 pr-8">
              You've used all {limit} free envelopes
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Upgrade to Pro for unlimited envelopes
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{used}/{limit}</p>
              <p className="text-[11px] text-gray-500 font-semibold mt-0.5 uppercase tracking-wider">Used</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 text-center">
              <p className="text-2xl font-extrabold text-blue-700">∞</p>
              <p className="text-[11px] text-blue-600 font-semibold mt-0.5 uppercase tracking-wider">Pro Plan</p>
            </div>
          </div>

          {/* Pro features */}
          <div className="mb-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Pro Plan Includes:</p>
            <div className="space-y-2">
              {[
                'Unlimited envelopes per month',
                'Unlimited users',
                'All core features (API, MCP, webhooks)',
                'Advanced workflow automation',
                '30-day audit retention',
                'Priority email support',
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-blue-600" />
                  </div>
                  <p className="text-sm text-gray-700 font-medium">{feature}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="text-center mb-5 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
            <p className="text-4xl font-extrabold text-gray-900">
              $29
              <span className="text-lg text-gray-500 font-semibold">/user/mo</span>
            </p>
            <p className="text-xs text-gray-600 mt-1">Billed monthly, cancel anytime</p>
          </div>

          {/* Reset notice */}
          <p className="text-xs text-gray-500 text-center mb-4">
            Your free tier limit resets on <strong>{resetDate}</strong>, or upgrade now for unlimited access.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-2 border-gray-200 bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-100 transition-all"
          >
            Maybe Later
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
