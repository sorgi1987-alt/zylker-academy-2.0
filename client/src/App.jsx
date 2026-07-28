import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useCan, STATUS } from './AuthContext.jsx';
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
import IntegrationStatus from './pages/IntegrationStatus.jsx';
import { Loading } from './components/Ui.jsx';

/**
 * Navigation. Each entry names the permission required to see it, so the menu
 * is derived from the signed-in role rather than maintained separately. A link
 * the user cannot use is not rendered — but hiding it is presentation only:
 * typing the URL still reaches a route whose data call the server refuses.
 */
const LINKS = [
  ['/dashboard', 'Dashboard', 'dashboard:read'],
  ['/students', 'Students', 'student:read'],
  ['/applications', 'Applications', 'application:read'],
  ['/enrolments', 'Enrolments', 'enrolment:read'],
  ['/programmes', 'Programmes', 'programme:read'],
  ['/intakes', 'Intakes', 'intake:read'],
  ['/learning/courses', 'Learning Hub', 'lms:read'],
  ['/invoices', 'Finance', 'invoice:read'],
  ['/integration', 'Integration Status', 'integration:read']
];

/* ------------------------------- user menu ------------------------------- */

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {user.name} · {user.roleLabel}
      </button>
      {open && (
        <div className="user-menu-pop" role="menu">
          <div className="user-menu-id">
            <strong>{user.name}</strong>
            <span className="muted">{user.email}</span>
            <span className="pill info">{user.roleLabel}</span>
          </div>
          <button type="button" role="menuitem" className="user-menu-item" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

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
  const can = useCan();
  if (permission && !can(permission)) {
    return (
      <div className="state" role="alert">
        <h3>You do not have access to this area</h3>
        <p>Your role does not include permission to view this. Ask an administrator if you need it.</p>
      </div>
    );
  }
  return children;
}

/* --------------------------------- shell --------------------------------- */

function AppShell() {
  const { user, takeIntendedRoute } = useAuth();
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

  const links = LINKS.filter(([, , permission]) => can(permission));
  const landing = links.length ? links[0][0] : '/dashboard';

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Main navigation">
        <p className="brand">Zylker Academy</p>
        <p className="brand-sub">Education Management</p>
        <div className="nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-foot">
          Signed in as <strong>{user.name}</strong> ({user.roleLabel}).
          Zoho Books is read-only. Learning data is a demonstration dataset in Catalyst.
        </div>
      </nav>

      <main className="main">
        <div className="top-bar">
          <UserMenu />
        </div>

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

          <Route path="/integration" element={<Guarded permission="integration:read"><IntegrationStatus /></Guarded>} />

          <Route path="*" element={<div className="state"><h3>Page not found</h3><p>Use the navigation to continue.</p></div>} />
        </Routes>
      </main>
    </div>
  );
}

/* ------------------------------- entry point ------------------------------ */

/**
 * Every route in this application requires authentication. There is no public
 * branch below: an unauthenticated visitor gets the sign-in screen and nothing
 * else is mounted, so no page-level data fetch can run before sign-in succeeds.
 */
export default function App() {
  const { status } = useAuth();

  if (status === STATUS.CHECKING) {
    return (
      <div className="layout-plain">
        <div className="login-card">
          <p className="brand">Zylker Academy</p>
          <p className="brand-sub">Education Management Portal</p>
          <Loading rows={3} label="Checking your session" />
        </div>
      </div>
    );
  }

  if (status !== STATUS.AUTHENTICATED) return <Login />;

  return <AppShell />;
}
