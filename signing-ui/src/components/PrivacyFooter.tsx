/**
 * Privacy-aware footer with links to Privacy Policy, Terms, and CCPA/GDPR rights.
 * Should appear on all public-facing pages (login, register, signing ceremony).
 */
export function PrivacyFooter() {
  return (
    <footer className="py-4 text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-2">
        <span className="font-medium">Powered by</span>
        <img src="/sendsign-logo.svg" alt="SendSign" className="h-4 w-auto inline-block" />
      </div>
      <div className="flex items-center justify-center gap-3 text-[11px] text-gray-400">
        <a href="/privacy" className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
          Privacy Policy
        </a>
        <span className="text-gray-300">|</span>
        <a href="/terms" className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
          Terms of Service
        </a>
        <span className="text-gray-300">|</span>
        <a href="/privacy#ccpa" className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
          Do Not Sell My Info
        </a>
        <span className="text-gray-300">|</span>
        <a href="/privacy#gdpr" className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
          GDPR Rights
        </a>
      </div>
    </footer>
  );
}
