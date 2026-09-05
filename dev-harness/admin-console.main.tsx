// DEV ONLY: actual Admin components with a test Auth context. API traffic is
// fulfilled by Playwright; this is UI evidence, never Hosted lifecycle proof.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../src/features/auth/context/auth-context';
import { ToastProvider } from '../src/components/ui/toast';
import { AdminShell } from '../src/features/admin/components/admin-shell';
import { AppShell } from '../src/app/shell/app-shell';
import { AdminOverviewPage } from '../src/features/admin/pages/admin-overview-page';
import { AdminTeachersPage } from '../src/features/admin/pages/admin-teachers-page';
import { AdminTeacherDetailPage } from '../src/features/admin/pages/admin-teacher-detail-page';
import { AdminAccessAdminsPage } from '../src/features/admin/pages/admin-access-admins-page';
import { AdminAccessInvitationsPage } from '../src/features/admin/pages/admin-access-invitations-page';
import { AdminAccessSessionsPage } from '../src/features/admin/pages/admin-access-sessions-page';
import { AdminPlatformHealthPage } from '../src/features/admin/pages/admin-platform-health-page';
import { AdminHealthPage } from '../src/features/admin/pages/admin-health-page';
import { AdminAuditPage } from '../src/features/admin/pages/admin-audit-page';
import { AdminDataIndexPage } from '../src/features/admin/pages/admin-data-index-page';
import { AdminDataBrowserPage } from '../src/features/admin/pages/admin-data-browser-page';
import { AdminDataDetailPage } from '../src/features/admin/pages/admin-data-detail-page';
import { AdminMfaEnrollPage } from '../src/features/admin/pages/admin-mfa-enroll-page';
import { AdminMfaChallengePage } from '../src/features/admin/pages/admin-mfa-challenge-page';
import { AdminInvitationAcceptPage } from '../src/features/admin/pages/admin-invitation-accept-page';
import '../src/styles/tokens.css';
import '../src/styles/globals.css';
import '../src/styles/admin-console.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
queryClient.setQueryData(['admin', 'session-state'], {
  state: 'privileged',
  mfa_age_seconds: 0,
});
queryClient.setQueryData(['profile', 'me'], {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'admin',
  displayName: 'UI 測試管理員',
  registrationComplete: true,
  reducedMotion: false,
  timezone: 'Asia/Taipei',
});
const route = new URLSearchParams(location.search).get('route') ?? '/admin';
const root = document.getElementById('root');
if (!root) throw new Error('HARNESS_ROOT_MISSING');
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <AuthContext.Provider
      value={{
        status: 'authenticated',
        session: { userId: '11111111-1111-4111-8111-111111111111' },
        signIn: () => Promise.resolve(),
        signInWithAccount: () => Promise.resolve(),
        signOut: () => Promise.resolve(),
      }}
    >
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route element={<AdminShell />}>
                <Route path="/admin" element={<AdminOverviewPage />} />
                <Route path="/admin/teachers" element={<AdminTeachersPage />} />
                <Route
                  path="/admin/teachers/:teacherId"
                  element={<AdminTeacherDetailPage />}
                />
                <Route
                  path="/admin/access/admins"
                  element={<AdminAccessAdminsPage />}
                />
                <Route
                  path="/admin/access/invitations"
                  element={<AdminAccessInvitationsPage />}
                />
                <Route
                  path="/admin/access/sessions"
                  element={<AdminAccessSessionsPage />}
                />
                <Route
                  path="/admin/monitoring"
                  element={<AdminPlatformHealthPage />}
                />
                <Route path="/admin/health" element={<AdminHealthPage />} />
                <Route path="/admin/audit" element={<AdminAuditPage />} />
                <Route path="/admin/data" element={<AdminDataIndexPage />} />
                <Route
                  path="/admin/data/:domain/:resource"
                  element={<AdminDataBrowserPage />}
                />
                <Route
                  path="/admin/data/:domain/:resource/:rowKey"
                  element={<AdminDataDetailPage />}
                />
              </Route>
              <Route
                path="/admin/mfa/enroll"
                element={<AdminMfaEnrollPage />}
              />
              <Route
                path="/admin/mfa/challenge"
                element={<AdminMfaChallengePage />}
              />
              <Route
                path="/admin/invitations/accept"
                element={<AdminInvitationAcceptPage />}
              />
            </Route>
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </AuthContext.Provider>
  </QueryClientProvider>,
);
