import { PrivacyFooter } from '../components/PrivacyFooter';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-[#ebedf0]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white rounded-xl border-2 border-gray-300 shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b-2 border-gray-200 bg-gray-50">
            <img src="/sendsign-logo.svg" alt="SendSign" className="h-6 w-auto mb-3" />
            <h1 className="text-xl font-bold text-gray-900">Terms of Service</h1>
            <p className="text-xs text-gray-500 mt-1">Last updated: February 2026 — Version 1.0</p>
          </div>

          <div className="px-8 py-8 prose prose-sm prose-gray max-w-none">
            <h2 className="text-base font-bold text-gray-900">1. Acceptance of Terms</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              By accessing or using SendSign ("the Service"), you agree to be bound by these Terms of Service.
              If you are using the Service on behalf of an organization, you represent that you have authority
              to bind that organization to these terms.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">2. Electronic Signatures</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              SendSign facilitates electronic signatures in compliance with the U.S. Electronic Signatures in
              Global and National Commerce Act (ESIGN Act), the Uniform Electronic Transactions Act (UETA),
              and the EU Electronic Identification, Authentication and Trust Services Regulation (eIDAS).
            </p>
            <p className="text-sm text-gray-700 leading-relaxed mt-2">
              By using the Service to sign a document, you consent to conducting business electronically
              and acknowledge that your electronic signature has the same legal effect as a handwritten signature.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">3. Account Responsibilities</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>You are responsible for maintaining the confidentiality of your account credentials</li>
              <li>You must notify us immediately of any unauthorized use of your account</li>
              <li>You must provide accurate and complete information when creating an account</li>
              <li>Accounts may be locked after 5 consecutive failed login attempts for security</li>
            </ul>

            <h2 className="text-base font-bold text-gray-900 mt-6">4. Acceptable Use</h2>
            <p className="text-sm text-gray-700 leading-relaxed">You agree not to use the Service to:</p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Send documents containing illegal content</li>
              <li>Forge signatures or misrepresent identity</li>
              <li>Interfere with the Service's security or integrity</li>
              <li>Violate any applicable law or regulation</li>
            </ul>

            <h2 className="text-base font-bold text-gray-900 mt-6">5. Document Storage & Security</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Documents are encrypted at rest (AES-256-GCM) and in transit (TLS 1.2+). Completed documents
              are cryptographically sealed with a tamper-evident audit trail. Documents are retained according
              to applicable retention policies and legal requirements.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">6. Audit Trail</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Every action on a document is recorded in a cryptographically chained audit trail including
              timestamps, IP addresses, and approximate geolocation. This audit trail is designed to be
              tamper-evident and independently verifiable.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">7. Limitation of Liability</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              The Service is provided "as is" without warranties of any kind. We are not liable for any
              damages arising from your use of the Service, including but not limited to the enforceability
              of electronic signatures in any particular jurisdiction.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">8. Termination</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Either party may terminate the agreement at any time. Upon termination, you may request
              export of your data (GDPR Article 20). We will retain completed documents as required by law.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">9. Changes to Terms</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              We may update these terms from time to time. Material changes will be communicated via email
              or in-app notification at least 30 days before they take effect.
            </p>

            <h2 className="text-base font-bold text-gray-900 mt-6">10. Contact</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              For questions about these terms:{' '}
              <a href="mailto:legal@sendsign.com" className="text-blue-600 hover:underline">legal@sendsign.com</a>
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
