import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { SigningPage } from './pages/SigningPage';
import { VerifyPage } from './pages/VerifyPage';
import { CompletePage } from './pages/CompletePage';
import { ExpiredPage } from './pages/ExpiredPage';
import { InPersonPage } from './pages/InPersonPage';
import { PowerFormPage } from './pages/PowerFormPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { PreparePage } from './pages/PreparePage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { ProfilePage } from './pages/ProfilePage';
import { BillingPage } from './pages/BillingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CookieConsent } from './components/CookieConsent';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded focus:shadow-lg" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          Skip to content
        </a>
        <main id="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/app" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/sign/:token" element={<SigningPage />} />
            <Route path="/prepare/:envelopeId" element={<PreparePage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/complete" element={<CompletePage />} />
            <Route path="/expired" element={<ExpiredPage />} />
            <Route path="/in-person/:token" element={<InPersonPage />} />
            <Route path="/powerform/:powerformId" element={<PowerFormPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/app/billing" element={<BillingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        {/* Cookie consent banner — appears on all pages */}
        <CookieConsent />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
