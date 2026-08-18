import React, { useEffect, useRef } from 'react';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useCan, STATUS } from './AuthContext.jsx';
import { useT } from './i18n/I18nContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Students from './pages/Students.jsx';
import Student360 from './pages/Student360.jsx';
import StudentForm from './pages/StudentForm.jsx';
import Applications from './pages/Applications.jsx';
import ApplicationDetail from './pages/ApplicationDetail.jsx';
import NewApplication from './pages/NewApplication.jsx';
import Enrolments from './pages/Enrolments.jsx';
import EnrolmentDetail from './pages/EnrolmentDetail.jsx';
import NewEnrolment from './pages/NewEnrolment.jsx';
import Programmes from './pages/Programmes.jsx';
import ProgrammeDetail from './pages/ProgrammeDetail.jsx';
import Intakes from './pages/Intakes.jsx';
import IntakeDetail from './pages/IntakeDetail.jsx';
import LearningCourses from './pages/LearningCourses.jsx';
import LearningCourseDetail from './pages/LearningCourseDetail.jsx';
import LearningEnrolments from './pages/LearningEnrolments.jsx';
import LearningEnrolmentDetail from './pages/LearningEnrolmentDetail.jsx';
import LearningSyncLog from './pages/LearningSyncLog.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import Tickets from './pages/Tickets.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import IntegrationStatus from './pages/IntegrationStatus.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import { Loading } from './components/Ui.jsx';
import Logo from './components/Logo.jsx';
import { Shell, NAV } from './components/Shell.jsx';

/* ------------------------------ route guard ------------------------------ */

/**
 * Renders a route only when the signed-in role holds `permission`.
 *
 * This exists so a user who reaches a URL they cannot use gets an explanation
 * instead of a page of failed requests. It is NOT the access control: that is
 * `requirePermission` in the Catalyst function, which runs whether or not this
 * component did.
 */
function Guarded({ permission, children }) {
  const t = useT();
  const can = useCan();
  if (permission && !can(permission)) {
    return (
      <div className="state" role="alert">
        <h3>{t('app.noAccessTitle')}</h3>
        <p>{t('app.noAccessDetail')}</p>
      </div>
    );
  }
  return children;
}

function NotFound() {
  const t = useT();
  return <div className="state"><h3>{t('app.notFoundTitle')}</h3><p>{t('app.notFoundDetail')}</p></div>;
}

/* --------------------------------- shell --------------------------------- */

function AppShell() {
  const { takeIntendedRoute } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const restored = useRef(false);

  // Return the visitor to whatever they originally asked for, once.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const route = takeIntendedRoute();
    if (route) navigate(route, { replace: true });
  }, [navigate, takeIntendedRoute]);

  const links = NAV.filter((l) => can(l.permission));
  const landing = links.length ? links[0].to : '/dashboard';

  return (
    <Shell links={links}>
        <Routes>
          <Route path="/" element={<Navigate to={landing} replace />} />
          <Route path="/login" element={<Navigate to={landing} replace />} />

          <Route path="/dashboard" element={<Guarded permission="dashboard:read"><Dashboard /></Guarded>} />

          <Route path="/students" element={<Guarded permission="student:read"><Students /></Guarded>} />
          <Route path="/students/new" element={<Guarded permission="student:write"><StudentForm /></Guarded>} />
          <Route path="/students/:id" element={<Guarded permission="student:read"><Student360 /></Guarded>} />
          <Route path="/students/:id/edit" element={<Guarded permission="student:write"><StudentForm /></Guarded>} />

          <Route path="/applications" element={<Guarded permission="application:read"><Applications /></Guarded>} />
          <Route path="/applications/new" element={<Guarded permission="application:write"><NewApplication /></Guarded>} />
          <Route path="/applications/:id" element={<Guarded permission="application:read"><ApplicationDetail /></Guarded>} />

          <Route path="/enrolments" element={<Guarded permission="enrolment:read"><Enrolments /></Guarded>} />
          <Route path="/enrolments/new" element={<Guarded permission="enrolment:write"><NewEnrolment /></Guarded>} />
          <Route path="/enrolments/:id" element={<Guarded permission="enrolment:read"><EnrolmentDetail /></Guarded>} />

          <Route path="/programmes" element={<Guarded permission="programme:read"><Programmes /></Guarded>} />
          <Route path="/programmes/:id" element={<Guarded permission="programme:read"><ProgrammeDetail /></Guarded>} />

          <Route path="/intakes" element={<Guarded permission="intake:read"><Intakes /></Guarded>} />
          <Route path="/intakes/:id" element={<Guarded permission="intake:read"><IntakeDetail /></Guarded>} />

          <Route path="/learning" element={<Navigate to="/learning/courses" replace />} />
          <Route path="/learning/courses" element={<Guarded permission="lms:read"><LearningCourses /></Guarded>} />
          <Route path="/learning/courses/:id" element={<Guarded permission="lms:read"><LearningCourseDetail /></Guarded>} />
          <Route path="/learning/enrolments" element={<Guarded permission="lms:read"><LearningEnrolments /></Guarded>} />
          <Route path="/learning/enrolments/:id" element={<Guarded permission="lms:read"><LearningEnrolmentDetail /></Guarded>} />
          <Route path="/learning/sync-log" element={<Guarded permission="lms:read"><LearningSyncLog /></Guarded>} />

          {/* The Zoho Learn catalogue was replaced by the Learning Hub; keep old links working. */}
          <Route path="/courses" element={<Navigate to="/learning/courses" replace />} />

          <Route path="/invoices" element={<Guarded permission="invoice:read"><Invoices /></Guarded>} />
          <Route path="/invoices/:id" element={<Guarded permission="invoice:read"><InvoiceDetail /></Guarded>} />

          <Route path="/tickets" element={<Guarded permission="ticket:read"><Tickets /></Guarded>} />
          <Route path="/tickets/:id" element={<Guarded permission="ticket:read"><TicketDetail /></Guarded>} />

          <Route path="/activity" element={<Guarded permission="activity:read"><ActivityLog /></Guarded>} />

          <Route path="/integration" element={<Guarded permission="integration:read"><IntegrationStatus /></Guarded>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
    </Shell>
  );
}

/* ------------------------------- entry point ------------------------------ */

/**
 * Every route in this application requires authentication. There is no public
 * branch below: an unauthenticated visitor gets the sign-in screen and nothing
 * else is mounted, so no page-level data fetch can run before sign-in succeeds.
 */
export default function App() {
  const t = useT();
  const { status } = useAuth();

  if (status === STATUS.CHECKING) {
    return (
      <div className="layout-plain">
        <div className="login-card">
          <div className="login-head">
            <Logo size={38} />
            <div>
              <p className="brand">Zylker Academy</p>
              <p className="brand-sub">{t('login.brandSub')}</p>
            </div>
          </div>
          <Loading rows={3} label={t('app.checkingSession')} />
        </div>
      </div>
    );
  }

  if (status !== STATUS.AUTHENTICATED) return <Login />;

  return <AppShell />;
}
