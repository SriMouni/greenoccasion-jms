/**
 * Admin application — editorial portal (discovery, ingest, review, AI, enrichment, jobs).
 * Auth-gated. Entry: index.html -> dist (served by the backend on a private host/subdomain).
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { RequireAdminAuth } from './components/RequireAdminAuth';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminCollectionPage } from './pages/AdminCollectionPage';
import { AdminReviewPanel } from './pages/AdminReviewPanel';
import { AdminJobsPage } from './pages/AdminJobsPage';

export default function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <RequireAdminAuth>
              <AdminLayout />
            </RequireAdminAuth>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="collection" element={<AdminCollectionPage />} />
          <Route path="review" element={<AdminReviewPanel />} />
          <Route path="jobs" element={<AdminJobsPage />} />
        </Route>
        {/* Anything else in the admin app routes to the dashboard. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
