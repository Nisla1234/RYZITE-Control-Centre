import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { RequestAccessPage } from './pages/RequestAccessPage';
import { DashboardPage } from './pages/DashboardPage';
import { PagesManagerPage } from './pages/PagesManagerPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { ServicesSolutionsPage } from './pages/ServicesSolutionsPage';
import { TeamPage } from './pages/TeamPage';
import { ArticlesPage } from './pages/ArticlesPage';
import { TestimonialsPage } from './pages/TestimonialsPage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { SeoCenterPage } from './pages/SeoCenterPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ActivityLogsPage } from './pages/ActivityLogsPage';
import { SettingsPage } from './pages/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F7FC] flex flex-col items-center justify-center gap-3">
        <div className="rounded-lg bg-white px-4 py-2 border border-[#DDE5F0] shadow-sm">
          <img
            src="/assets/branding/ryzite-logo.png"
            alt="RYZITE"
            className="h-12 w-auto object-contain"
          />
        </div>
        <p className="text-xs font-medium text-[#475569]">Verifying administrator session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/admin/" replace />} />
          <Route path="/admin" element={<LoginPage />} />
          <Route path="/admin/" element={<LoginPage />} />
          <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/admin/forgot-password/" element={<ForgotPasswordPage />} />
          <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
          <Route path="/admin/reset-password/" element={<ResetPasswordPage />} />
          <Route path="/admin/request-access" element={<RequestAccessPage />} />
          <Route path="/admin/request-access/" element={<RequestAccessPage />} />

          <Route
            path="/admin/dashboard/*"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pages/*"
            element={
              <ProtectedRoute>
                <PagesManagerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/portfolio/*"
            element={
              <ProtectedRoute>
                <PortfolioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/services/*"
            element={
              <ProtectedRoute>
                <ServicesSolutionsPage kind="service" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/solutions/*"
            element={
              <ProtectedRoute>
                <ServicesSolutionsPage kind="solution" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/team/*"
            element={
              <ProtectedRoute>
                <TeamPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/articles/*"
            element={
              <ProtectedRoute>
                <ArticlesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/testimonials/*"
            element={
              <ProtectedRoute>
                <TestimonialsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/media/*"
            element={
              <ProtectedRoute>
                <MediaLibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/seo/*"
            element={
              <ProtectedRoute>
                <SeoCenterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/analytics/*"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/activity/*"
            element={
              <ProtectedRoute>
                <ActivityLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings/*"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/admin/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
