import { PrivacyFooter } from '../components/PrivacyFooter';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#ebedf0]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white rounded-xl border-2 border-gray-300 shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b-2 border-gray-200 bg-gray-50">
            <img src="/sendsign-logo.svg" alt="SendSign" className="h-6 w-auto mb-3" />
            <h1 className="text-xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="text-xs text-gray-500 mt-1">Last updated: February 2026 — Version 1.0</p>
          </div>

          <div className="px-8 py-8 prose prose-sm prose-gray max-w-none">
            <h2 className="text-base font-bold text-gray-900">1. Information We Collect</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              When you use SendSign, we collect information necessary to provide the e-signature service:
            </p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li><strong>Account information:</strong> Name, email address, and password (hashed with bcrypt)</li>
              <li><strong>Signing activity:</strong> Documents you send or sign, timestamps, and completion status</li>
              <li><strong>Technical data:</strong> IP address, browser user agent, and approximate geolocation (country/region level only)</li>
              <li><strong>Consent records:</strong> When you consented to electronic signatures and under what terms</li>
            </ul>

            <h2 className="text-base font-bold text-gray-900 mt-6">2. How We Use Your Information</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>To facilitate the electronic signature process</li>
              <li>To create legally binding audit trails (required by ESIGN Act and eIDAS)</li>
              <li>To send you notifications about documents requiring your action</li>
              <li>To prevent fraud and unauthorized access</li>
              <li>To comply with legal obligations</li>
            </ul>

            <h2 className="text-base font-bold text-gray-900 mt-6">3. Data Security</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              All documents are encrypted at rest using AES-256-GCM. Data in transit is protected by TLS 1.2+.
              Passwords are hashed with bcrypt (12 rounds). Signing tokens are single-use and time-limited (72 hours).
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">4. Data Retention</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Completed documents are retained according to the applicable retention policy (default: 7 years for legal compliance).
              You may request early deletion subject to legal hold requirements.
            </p>

            <h2 id="gdpr" className="text-base font-bold text-gray-900 mt-6">5. Your Rights (GDPR)</h2>
            <p className="text-sm text-gray-700 leading-relaxed">If you are located in the European Economic Area, you have the right to:</p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li><strong>Access:</strong> Request a copy of all personal data we hold about you (Article 15)</li>
              <li><strong>Rectification:</strong> Correct inaccurate personal data (Article 16)</li>
              <li><strong>Erasure:</strong> Request deletion of your personal data (Article 17), subject to legal hold exceptions</li>
              <li><strong>Portability:</strong> Export your data in a machine-readable format (Article 20)</li>
              <li><strong>Restriction:</strong> Limit how we process your data (Article 18)</li>
              <li><strong>Object:</strong> Object to data processing based on legitimate interests (Article 21)</li>
            </ul>
            <p className="text-sm text-gray-700 leading-relaxed mt-2">
              To exercise these rights, contact your organization administrator or email{' '}
              <a href="mailto:privacy@sendsign.com" className="text-blue-600 hover:underline">privacy@sendsign.com</a>.
            </p>

            <h2 id="ccpa" className="text-base font-bold text-gray-900 mt-6">6. California Privacy Rights (CCPA/CPRA)</h2>
            <p className="text-sm text-gray-700 leading-relaxed">If you are a California resident, you have the right to:</p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li><strong>Know:</strong> What personal information we collect and how it is used</li>
              <li><strong>Delete:</strong> Request deletion of your personal information</li>
              <li><strong>Opt-Out:</strong> Opt out of the sale of your personal information</li>
              <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your rights</li>
            </ul>
            <p className="text-sm text-gray-700 leading-relaxed mt-2">
              <strong>We do not sell your personal information.</strong> To submit a request, email{' '}
              <a href="mailto:privacy@sendsign.com" className="text-blue-600 hover:underline">privacy@sendsign.com</a>.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">7. Cookies</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              We use only essential cookies required for authentication and security (session tokens, CSRF protection).
              We do not use tracking, advertising, or analytics cookies.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">8. Third-Party Services</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              When configured by your organization, we may integrate with identity verification providers
              (for government ID checks), email delivery services (for notifications), and cloud storage providers
              (for document storage). Each is bound by a Data Processing Agreement.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">9. Contact</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              For privacy inquiries:{' '}
              <a href="mailto:privacy@sendsign.com" className="text-blue-600 hover:underline">privacy@sendsign.com</a>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <PrivacyFooter />
        </div>
      </div>
    </div>
  );
}
