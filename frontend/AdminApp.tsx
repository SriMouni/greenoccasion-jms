/**
 * JMS portal app. Role-aware: admin/editor use the editorial console (AdminLayout);
 * authors and reviewers use lightweight portals. Auth-gated. Served at /admin/*.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { RequireAdminAuth } from './components/RequireAdminAuth';
import { RequireAuth } from './components/RequireAuth';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminCollectionPage } from './pages/AdminCollectionPage';
import { AdminReviewPanel } from './pages/AdminReviewPanel';
import { AdminJobsPage } from './pages/AdminJobsPage';
import { AuthorHome } from './pages/AuthorHome';
import { AuthorSubmit } from './pages/AuthorSubmit';
import { ReviewerHome } from './pages/ReviewerHome';
import { EditorSubmissions } from './pages/EditorSubmissions';
import { EditorSubmissionDetail } from './pages/EditorSubmissionDetail';
import { AdminUsers } from './pages/AdminUsers';

export default function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/register" element={<RegisterPage />} />

        {/* Author portal */}
        <Route
          path="/admin/author"
          element={
            <RequireAuth roles={['author', 'editor', 'admin']}>
              <AuthorHome />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/author/submit"
          element={
            <RequireAuth roles={['author', 'editor', 'admin']}>
              <AuthorSubmit />
            </RequireAuth>
          }
        />

        {/* Reviewer portal */}
        <Route
          path="/admin/reviewer"
          element={
            <RequireAuth roles={['reviewer', 'editor', 'admin']}>
              <ReviewerHome />
            </RequireAuth>
          }
        />

        {/* Editor / admin console */}
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
          <Route path="submissions" element={<EditorSubmissions />} />
          <Route path="submissions/:id" element={<EditorSubmissionDetail />} />
          <Route path="users" element={<AdminUsers />} />
        </Route>

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
