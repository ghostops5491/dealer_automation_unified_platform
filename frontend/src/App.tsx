import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Toaster } from '@/components/ui/toaster';
import { MainLayout } from '@/components/layout/MainLayout';

// Pages
import { UserLogin } from '@/pages/UserLogin';
import { AdminLogin } from '@/pages/AdminLogin';
import { AdminDashboard } from '@/pages/admin/Dashboard';
import { Organizations } from '@/pages/admin/Organizations';
import { Branches } from '@/pages/admin/Branches';
import { Users } from '@/pages/admin/Users';
import { Screens } from '@/pages/admin/Screens';
import { Flows } from '@/pages/admin/Flows';
import { UserDashboard } from '@/pages/user/Dashboard';
import { UserFlows } from '@/pages/user/Flows';
import { UserSubmissions } from '@/pages/user/Submissions';
import { FormFill } from '@/pages/user/FormFill';
import { Approvals } from '@/pages/user/Approvals';
import { InsuranceApprovals } from '@/pages/user/InsuranceApprovals';
import { History } from '@/pages/user/History';
import { Analytics } from '@/pages/user/Analytics';
import RunJob from '@/pages/user/RunJob';
import { VehicleCatalog } from '@/pages/user/VehicleCatalog';

function ProtectedRoute({
  children,
  requireSuperAdmin = false,
}: {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    // Redirect to appropriate login page
    return <Navigate to={requireSuperAdmin ? '/admin/login' : '/login'} replace />;
  }

  if (requireSuperAdmin && user?.type !== 'superadmin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// For user login page
function UserPublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to={user?.type === 'superadmin' ? '/admin' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}

// For admin login page
function AdminPublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (isAuthenticated && user?.type === 'superadmin') {
    return <Navigate to="/admin" replace />;
  }

  // If regular user is authenticated, still show admin login (they need to login as admin)
  if (isAuthenticated && user?.type !== 'superadmin') {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* User Login */}
        <Route
          path="/login"
          element={
            <UserPublicRoute>
              <UserLogin />
            </UserPublicRoute>
          }
        />

        {/* Admin Login - Separate URL for security */}
        <Route
          path="/admin/login"
          element={
            <AdminPublicRoute>
              <AdminLogin />
            </AdminPublicRoute>
          }
        />

        {/* Super Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireSuperAdmin>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="branches" element={<Branches />} />
          <Route path="users" element={<Users />} />
          <Route path="screens" element={<Screens />} />
          <Route path="flows" element={<Flows />} />
          <Route path="submissions" element={<UserSubmissions />} />
        </Route>

        {/* User Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<UserDashboard />} />
          <Route path="flows" element={<UserFlows />} />
          <Route path="flows/:flowId/new" element={<FormFill />} />
          <Route path="submissions" element={<UserSubmissions />} />
          <Route path="submissions/:submissionId" element={<FormFill />} />
          <Route path="forms/:submissionId" element={<FormFill />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="insurance-approvals" element={<InsuranceApprovals />} />
          <Route path="run-job" element={<RunJob />} />
          <Route path="vehicle-catalog" element={<VehicleCatalog />} />
          <Route path="history" element={<History />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

