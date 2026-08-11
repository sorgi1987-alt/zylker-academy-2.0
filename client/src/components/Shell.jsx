import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState
} from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useCan } from '../AuthContext.jsx';
import { api } from '../api.js';
import { useDebounced } from '../useApi.js';
import { Modal } from './Ui.jsx';

/* ============================== icons ================================== */
/*
 * Inline so the shell has no icon dependency and no network request. Each is
 * aria-hidden: the link text is the accessible name, and a decorative glyph
 * announced twice is noise for a screen reader.
 */
const Icon = ({ d, label }) => (
  <svg className="ic" viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
    {d}
  </svg>
);

const ICONS = {
  dashboard: <Icon d={<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>} />,
  students: <Icon d={<><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 11.2a3 3 0 0 0 0-6" /><path d="M18 20a6 6 0 0 0-3-5.2" /></>} />,
  applications: <Icon d={<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>} />,
  enrolments: <Icon d={<><path d="M12 3 2 8l10 5 10-5z" /><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" /></>} />,
  programmes: <Icon d={<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>} />,
  intakes: <Icon d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>} />,
  learning: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>} />,
  finance: <Icon d={<><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>} />,
  support: <Icon d={<><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13v4a2 2 0 0 0 2 2h1v-6H5a1 1 0 0 0-1 1z" /><path d="M20 13v4a2 2 0 0 1-2 2h-1v-6h1a1 1 0 0 1 1 1z" /><path d="M14 19a2 2 0 0 1-2 2h-1" /></>} />,
  integration: <Icon d={<><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.9 15.8 7.1M8.2 13.1l7.6 3.8" /></>} />
};

const IconSearch = <Icon d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>} />;
const IconPlus = <Icon d={<><path d="M12 5v14M5 12h14" /></>} />;
const IconMenu = <Icon d={<><path d="M4 6h16M4 12h16M4 18h16" /></>} />;
const IconChevron = <Icon d={<><path d="m9 6 6 6-6 6" /></>} />;

/* ========================== navigation model =========================== */

/**
 * One row per destination: path, label, the permission it requires and its
 * icon. The menu is derived from this and the signed-in role, so a link the
 * user cannot use is never rendered. Hiding it is presentation only — the
 * matching backend route refuses the call regardless.
 */
export const NAV = [
  { to: '/dashboard', label: 'Dashboard', permission: 'dashboard:read', icon: ICONS.dashboard },
  { to: '/students', label: 'Students', permission: 'student:read', icon: ICONS.students },
  { to: '/applications', label: 'Applications', permission: 'application:read', icon: ICONS.applications },
  { to: '/enrolments', label: 'Enrolments', permission: 'enrolment:read', icon: ICONS.enrolments },
  { to: '/programmes', label: 'Programmes', permission: 'programme:read', icon: ICONS.programmes },
  { to: '/intakes', label: 'Intakes', permission: 'intake:read', icon: ICONS.intakes },
  { to: '/learning/courses', label: 'Learning Hub', permission: 'lms:read', icon: ICONS.learning },
  { to: '/invoices', label: 'Finance', permission: 'invoice:read', icon: ICONS.finance },
  { to: '/tickets', label: 'Support', permission: 'ticket:read', icon: ICONS.support },
  { to: '/integration', label: 'Integration Status', permission: 'integration:read', icon: ICONS.integration }
];

/**
 * Everything the global Create button can open, with the permission each needs.
 *
 * Programmes and intakes are created from a dialog on their list page, so those
 * entries carry a query flag the page reads rather than a dedicated route —
 * reusing the working form instead of building a second one.
 *
 * Creating an LMS demonstration record is deliberately absent until the Learning
 * Hub work: there is no create form for it yet, and a menu item that leads
 * nowhere is worse than one that is not there.
 */
const CREATE_ITEMS = [
  { to: '/students/new', label: 'New student', permission: 'student:write' },
  { to: '/applications/new', label: 'New application', permission: 'application:write' },
  { to: '/enrolments/new', label: 'New enrolment', permission: 'enrolment:write' },
  { to: '/programmes?new=1', label: 'New programme', permission: 'programme:write' },
  { to: '/intakes?new=1', label: 'New intake', permission: 'intake:write' }
];

/* ============================ popup plumbing =========================== */

/** Closes a popup on outside click, Escape, or a route change. */
function useDismiss(open, close) {
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  useEffect(() => { if (open) close(); /* eslint-disable-next-line */ }, [location.pathname, location.search]);
  return ref;
}

/* ============================= breadcrumbs ============================= */

const CrumbCtx = createContext({ setLeaf: () => {} });

/**
 * Lets a detail page name itself in the breadcrumb trail, e.g. the student's
 * name instead of a record id. Pages that do not call this fall back to a label
 * derived from the URL.
 */
export function useBreadcrumbLeaf(label) {
  const { setLeaf } = useContext(CrumbCtx);
  useEffect(() => {
    setLeaf(label || null);
    return () => setLeaf(null);
  }, [label, setLeaf]);
}

const SECTION = {
  dashboard: 'Dashboard',
  students: 'Students',
  applications: 'Applications',
  enrolments: 'Enrolments',
  programmes: 'Programmes',
  intakes: 'Intakes',
  learning: 'Learning Hub',
  courses: 'Courses',
  'sync-log': 'Synchronisation log',
  invoices: 'Finance',
  integration: 'Integration Status',
  new: 'New',
  edit: 'Edit'
};

/**
 * Trail for detail and edit pages. A single-segment path is already named by
 * the page heading, so no trail is drawn there — a breadcrumb with one entry is
 * decoration, not navigation.
 */
function Breadcrumbs({ leaf }) {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const crumbs = [];
  let acc = '';
  parts.forEach((seg, i) => {
    acc += `/${seg}`;
    const last = i === parts.length - 1;
    const isId = /^\d+$/.test(seg);
    let label = SECTION[seg] || (isId ? 'Details' : seg.replace(/-/g, ' '));
    if (last && leaf) label = leaf;
    crumbs.push({ to: acc, label, last, isId });
  });

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c) => (
          <li key={c.to}>
            {c.last || c.isId
              ? <span aria-current={c.last ? 'page' : undefined}>{c.label}</span>
              : <Link to={c.to}>{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ============================ global search ============================ */

const MIN_QUERY = 2;

/**
 * Search across every entity the signed-in role may read.
 *
 * The query goes to an authenticated Catalyst function which decides what this
 * role may see; the browser holds no CRM credential and cannot widen the search
 * by asking differently. Results are grouped by entity, reachable with the
 * arrow keys, and each one links straight to its record.
 */
function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [state, setState] = useState({ status: 'idle', groups: [], total: 0, error: null });
  const debounced = useDebounced(term, 300);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const close = useCallback(() => setOpen(false), []);
  const boxRef = useDismiss(open, close);

  // Ctrl/Cmd+K is the conventional shortcut and costs nothing to support.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current && inputRef.current.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < MIN_QUERY) {
      setState({ status: q.length ? 'short' : 'idle', groups: [], total: 0, error: null });
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api.search(q, { signal: ctrl.signal })
      .then((res) => {
        setActive(0);
        setState({
          status: 'ready',
          groups: (res.data && res.data.groups) || [],
          total: (res.data && res.data.total) || 0,
          error: null
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', groups: [], total: 0, error: err });
      });
    // A superseded request is cancelled, so a slow early keystroke can never
    // overwrite the results of a later one.
    return () => ctrl.abort();
  }, [debounced]);

  // Flattened once so arrow keys can walk the whole list across group headings.
  const flat = useMemo(
    () => state.groups.flatMap((g) => g.items.map((it) => ({ ...it, entity: g.entity }))),
    [state.groups]
  );

  const go = useCallback((item) => {
    if (!item) return;
    setOpen(false);
    setTerm('');
    navigate(item.to);
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((i) => (i - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
  };

  const showPanel = open && term.trim().length > 0;
  let index = -1;

  return (
    <div className="gsearch" ref={boxRef}>
      <label className="sr-only" htmlFor="global-search">Search students, applications, enrolments, programmes and intakes</label>
      <span className="gsearch-ic" aria-hidden="true">{IconSearch}</span>
      <input
        id="global-search"
        ref={inputRef}
        type="search"
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        aria-activedescendant={showPanel && flat[active] ? `gs-opt-${active}` : undefined}
        placeholder="Search records…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd className="gsearch-kbd" aria-hidden="true">⌘K</kbd>

      {showPanel && (
        <div className="gsearch-pop" id="global-search-results" role="listbox"
          aria-label="Search results">
          {state.status === 'short' && (
            <p className="gsearch-msg">Type at least {MIN_QUERY} characters.</p>
          )}
          {state.status === 'loading' && (
            <p className="gsearch-msg" role="status">Searching…</p>
          )}
          {state.status === 'error' && (
            <p className="gsearch-msg err" role="alert">
              {state.error && state.error.status === 403
                ? 'Your role does not allow searching these records.'
                : (state.error && state.error.message) || 'The search could not be completed.'}
            </p>
          )}
          {state.status === 'ready' && !flat.length && (
            <p className="gsearch-msg">No records match “{debounced.trim()}”.</p>
          )}
          {state.status === 'ready' && state.groups.map((g) => (
            // A listbox may only contain options and groups, so the heading is
            // the group's label rather than a bare paragraph inside it.
            <div className="gsearch-group" key={g.entity} role="group" aria-label={g.label}>
              <p className="gsearch-h" role="presentation">
                {g.label}
                {g.total > g.items.length && (
                  <span className="muted"> · showing {g.items.length} of {g.total}</span>
                )}
              </p>
              {g.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <button
                    type="button"
                    key={`${g.entity}-${item.id}`}
                    id={`gs-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`gsearch-item${i === active ? ' on' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                  >
                    <span className="gsearch-item-main">
                      <span className="gsearch-item-label">{item.label}</span>
                      {item.secondary && <span className="gsearch-item-sub">{item.secondary}</span>}
                    </span>
                    {item.reference && <span className="pill mute mono">{item.reference}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================= create menu ============================= */

/** The Create button. Renders nothing at all for a role that may create nothing. */
function CreateMenu() {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const items = CREATE_ITEMS.filter((i) => can(i.permission));
  if (!items.length) return null;

  return (
    <div className="pop-wrap" ref={ref}>
      <button type="button" className="btn primary hdr-btn" aria-haspopup="menu"
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {IconPlus}<span className="btn-label">Create</span>
      </button>
      {open && (
        <div className="pop" role="menu" aria-label="Create">
          {items.map((i) => (
            <Link key={i.to} to={i.to} role="menuitem" className="pop-item" onClick={close}>
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================ about =============================== */

/** Plain statement of what this application reads, writes and only pretends to. */
function AboutDialog({ onClose, environment }) {
  return (
    <Modal title="About Zylker Academy" onClose={onClose}>
      <dl className="dl compact">
        <dt>Environment</dt>
        <dd>{environment ? environment.label : 'Unknown'}</dd>
        <dt>Students, Applications, Programmes, Intakes, Enrolments</dt>
        <dd>Read and written in Zoho CRM.</dd>
        <dt>Invoices</dt>
        <dd>Read from Zoho Books. This application makes no accounting change; corrections are made in Zoho Books.</dd>
        <dt>Learning Hub</dt>
        <dd>
          A demonstration dataset held in the Catalyst Data Store. Provider names are
          labels on those rows — no request is made to Moodle, Canvas, TrainerCentral
          or any other learning platform. The mapping to CRM and the push into it are real.
        </dd>
        <dt>Access</dt>
        <dd>Every route requires a Catalyst session, and every backend endpoint re-checks your role independently of this interface.</dd>
      </dl>
    </Modal>
  );
}

/* ================================ header ============================== */

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  if (!user) return null;

  return (
    <div className="pop-wrap" ref={ref}>
      <button type="button" className="btn hdr-btn user-btn" aria-haspopup="menu"
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">{(user.name || '?').slice(0, 1).toUpperCase()}</span>
        <span className="user-btn-text">
          <span className="user-btn-name">{user.name}</span>
          <span className="user-btn-role">{user.roleLabel}</span>
        </span>
      </button>
      {open && (
        <div className="pop right" role="menu" aria-label="Account">
          <div className="pop-id">
            <strong>{user.name}</strong>
            <span className="muted">{user.email}</span>
            <span className="pill info">{user.roleLabel}</span>
          </div>
          <button type="button" role="menuitem" className="pop-item" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function Header({ onOpenNav, leaf }) {
  const { environment } = useAuth();
  const [about, setAbout] = useState(false);
  const dev = environment && environment.name !== 'production';

  return (
    <header className="app-header">
      <button type="button" className="icon-btn nav-toggle" onClick={onOpenNav}
        aria-label="Open navigation menu">{IconMenu}</button>

      <div className="app-header-lead">
        <Breadcrumbs leaf={leaf} />
      </div>

      <GlobalSearch />

      <div className="app-header-actions">
        {environment && (
          <span className={`pill ${dev ? 'warn' : 'ok'} env-badge`}
            title={`This interface is talking to the ${environment.label.toLowerCase()} backend`}>
            {environment.label}
          </span>
        )}
        <CreateMenu />
        <button type="button" className="btn hdr-btn" onClick={() => setAbout(true)}>Help</button>
        <UserMenu />
      </div>

      {about && <AboutDialog environment={environment} onClose={() => setAbout(false)} />}
    </header>
  );
}

/* =============================== sidebar ============================== */

function Sidebar({ links, collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const ref = useRef(null);

  // On mobile the sidebar is a dialog over the page: Escape closes it and focus
  // moves into it, so a keyboard user is not left operating a hidden panel.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCloseMobile(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('a,button');
    if (first) first.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen && <div className="nav-scrim" onClick={onCloseMobile} aria-hidden="true" />}
      <nav
        className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' open' : ''}`}
        aria-label="Main navigation"
        ref={ref}
      >
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <p className="brand">{collapsed ? 'ZA' : 'Zylker Academy'}</p>
            {!collapsed && <p className="brand-sub">Education Management</p>}
          </div>
          <button type="button" className="icon-btn collapse-btn" onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <span className={collapsed ? 'flip' : undefined}>{IconChevron}</span>
          </button>
        </div>

        <div className="nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              // A collapsed rail shows icons only, so the label has to survive
              // somewhere the pointer and the screen reader can both reach it.
              title={collapsed ? l.label : undefined}
              aria-label={collapsed ? l.label : undefined}
              onClick={onCloseMobile}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <span className="nav-ic" aria-hidden="true">{l.icon}</span>
              <span className="nav-label">{l.label}</span>
            </NavLink>
          ))}
        </div>

        {!collapsed && (
          <div className="sidebar-foot">
            Signed in as <strong>{user.name}</strong> ({user.roleLabel}).
            Zoho Books is read-only. Learning data is a demonstration dataset in Catalyst.
          </div>
        )}
      </nav>
    </>
  );
}

/* ================================ shell =============================== */

/**
 * The authenticated frame: navigation rail, global header and the page itself.
 *
 * The collapsed/expanded preference is stored per user id, so two people
 * sharing a browser profile do not inherit each other's layout.
 */
export function Shell({ links, children }) {
  const { user } = useAuth();
  const key = `zylker:${user && user.id}:navCollapsed`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [leaf, setLeafState] = useState(null);
  const setLeaf = useCallback((v) => setLeafState(v), []);
  const crumbValue = useMemo(() => ({ setLeaf }), [setLeaf]);
  const location = useLocation();

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(key, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }, [key]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <CrumbCtx.Provider value={crumbValue}>
      <div className={`layout${collapsed ? ' nav-collapsed' : ''}`}>
        {/* First stop for a keyboard user, so nine navigation links can be
            passed over on every page. */}
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <Sidebar
          links={links}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="main-col">
          <Header onOpenNav={() => setMobileOpen(true)} leaf={leaf} />
          <main className="main" id="main-content">{children}</main>
        </div>
      </div>
    </CrumbCtx.Provider>
  );
}
