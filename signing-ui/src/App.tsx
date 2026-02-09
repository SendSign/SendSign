import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SigningPage } from './pages/SigningPage';
import { VerifyPage } from './pages/VerifyPage';
import { CompletePage } from './pages/CompletePage';
import { ExpiredPage } from './pages/ExpiredPage';
import { InPersonPage } from './pages/InPersonPage';
import { PowerFormPage } from './pages/PowerFormPage';
import { AdminDashboard } from './pages/AdminDashboard';

function App() {
  return (
    <BrowserRouter>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg">
        Skip to content
      </a>
      <main id="main-content">
        <Routes>
          <Route path="/sign/:token" element={<SigningPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/complete" element={<CompletePage />} />
          <Route path="/expired" element={<ExpiredPage />} />
          <Route path="/in-person/:token" element={<InPersonPage />} />
          <Route path="/powerform/:powerformId" element={<PowerFormPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/expired" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
