import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import logo from './assets/minaret-logo.png';

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

/* =========================================================
   LANGUAGE
========================================================= */

const LangContext = React.createContext(null);

const useLang = () => React.useContext(LangContext);

function I18n({ children }) {
  const [ar, setAr] = useState(false);

  useEffect(() => {
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    document.documentElement.lang = ar ? 'ar' : 'en';
  }, [ar]);

  return (
    <LangContext.Provider value={{ ar, setAr }}>
      {children}
    </LangContext.Provider>
  );
}

/* =========================================================
   APP
========================================================= */

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await api('/api/auth/me');
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <I18n>
      {user ? (
        <Portal
          user={user}
          onLogout={() => setUser(null)}
        />
      ) : (
        <Login onLogin={setUser} />
      )}
    </I18n>
  );
}

/* =========================================================
   LOGIN
========================================================= */

function Login({ onLogin }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { ar, setAr } = useLang();

  const submit = async (e) => {
    e.preventDefault();

    setError('');
    setBusy(true);

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: id,
          password,
        }),
      });

      onLogin(data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-brand">
        <img
          src={logo}
          alt="Minaret Academy"
        />

        <p>Inspiring Excellence Everyday</p>

        <div className="arch-art">
          {ar
            ? 'تعلم • قرآن • لغة • إسلام'
            : 'QURAN • ARABIC • ISLAMIC STUDIES'}
        </div>
      </section>

      <form
        className="login-card"
        onSubmit={submit}
      >
        <div className="lang-switch">
          <button
            type="button"
            className={!ar ? 'active' : ''}
            onClick={() => setAr(false)}
          >
            English
          </button>

          <button
            type="button"
            className={ar ? 'active' : ''}
            onClick={() => setAr(true)}
          >
            العربية
          </button>
        </div>

        <span className="eyebrow">
          {ar ? 'بوابة الأكاديمية' : 'ACADEMY PORTAL'}
        </span>

        <h1>
          {ar ? 'مرحباً بكم' : 'Welcome back'}
        </h1>

        <p className="muted">
          {ar
            ? 'سجّل الدخول إلى حسابك.'
            : 'Sign in to your Minaret Academy account.'}
        </p>

        {error && (
          <div className="alert">
            {error}
          </div>
        )}

        <label>
          {ar
            ? 'رقم الهاتف أو البريد الإلكتروني'
            : 'Phone number or email'}

          <input
            value={id}
            onChange={(e) =>
              setId(e.target.value)
            }
            required
          />
        </label>

        <label>
          {ar ? 'كلمة المرور' : 'Password'}

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
          />
        </label>

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ? 'Signing in…'
            : ar
              ? 'تسجيل الدخول'
              : 'Sign in'}
        </button>

        <small>
          Students & teachers use their phone number.
          Admin uses email.
        </small>
      </form>
    </main>
  );
}

/* =========================================================
   PORTAL
========================================================= */

function Portal({ user, onLogout }) {
  const [section, setSection] = useState('dashboard');
  const { ar, setAr } = useLang();

  const nav =
    user.role === 'ADMIN'
      ? [
          ['dashboard', 'Overview'],
          ['students', 'Students'],
          ['teachers', 'Teachers'],
          ['classes', 'Classes'],
          ['rosters', 'Teacher Rosters'],
        ]
      : user.role === 'TEACHER'
        ? [
            ['dashboard', 'My Classes'],
            ['students', 'My Students'],
          ]
        : [
            ['dashboard', 'My Classes'],
          ];

  const handleLogout = async () => {
    try {
      await api('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      onLogout();
    }
  };

  return (
    <div className="app">
      <aside>
        <div className="side-brand">
          <img
            src={logo}
            alt="Minaret Academy"
          />
        </div>

        <div className="role-pill">
          {user.role}
        </div>

        <nav>
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={
                section === id
                  ? 'selected'
                  : ''
              }
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="side-bottom">
          <button
            onClick={() => setAr(!ar)}
          >
            {ar ? 'English' : 'العربية'}
          </button>

          <button
            onClick={() =>
              setSection('password')
            }
          >
            Change password
          </button>

          <button onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <header>
          <div>
            <span className="eyebrow">
              THE MINARET ACADEMY
            </span>

            <h2>
              {section === 'dashboard'
                ? user.role === 'STUDENT'
                  ? 'السلام عليكم'
                  : 'Good day'
                : nav.find(
                    (x) => x[0] === section
                  )?.[1] || 'Account'}
            </h2>
          </div>

          <div className="profile">
            <span>{user.name}</span>
            <b>{user.role[0]}</b>
          </div>
        </header>

        {section === 'dashboard' && (
          <Dashboard user={user} />
        )}

        {section === 'students' && (
          <Students user={user} />
        )}

        {section === 'teachers' && (
          <Teachers />
        )}

        {section === 'classes' && (
          <Classes
            admin={user.role === 'ADMIN'}
          />
        )}

        {section === 'rosters' && (
          <Rosters />
        )}

        {section === 'password' && (
          <Password />
        )}
      </main>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({ user }) {
  const [classes, setClasses] = useState([]);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        setError('');

        const classData =
          await api('/api/classes');

        setClasses(
          classData.classes || []
        );

        if (user.role === 'ADMIN') {
          const overviewData =
            await api('/api/admin/overview');

          setOverview(overviewData);
        }
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
    }

    loadDashboard();
  }, [user]);

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">
            {user.role === 'ADMIN'
              ? 'ADMINISTRATION'
              : 'LEARNING PORTAL'}
          </span>

          <h1>
            {user.role === 'STUDENT'
              ? 'Your learning journey starts here.'
              : 'A calm, focused place to manage learning.'}
          </h1>

          <p>
            Quranic studies, Arabic language and
            Islamic education—organized around
            each learner.
          </p>
        </div>

        <div className="hero-motif">
          ﷽
        </div>
      </section>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {overview && (
        <div className="stats">
          <Stat
            n={overview.students}
            l="Active students"
          />

          <Stat
            n={overview.teachers}
            l="Teachers"
          />

          <Stat
            n={overview.today}
            l="Today’s classes"
          />

          <Stat
            n={overview.upcoming}
            l="Upcoming classes"
          />
        </div>
      )}

      <h3>Upcoming classes</h3>

      <ClassList
        classes={classes.slice(0, 8)}
      />
    </>
  );
}

const Stat = ({ n, l }) => (
  <div className="stat">
    <strong>{n}</strong>
    <span>{l}</span>
  </div>
);

/* =========================================================
   CLASS LIST
========================================================= */

function ClassList({
  classes,
  admin = false,
  onStatusChange,
}) {
  const [busyId, setBusyId] =
    useState(null);

  const [error, setError] =
    useState('');

  const changeStatus = async (
    id,
    status
  ) => {
    if (status === 'cancelled') {
      const confirmed =
        window.confirm(
          'Are you sure you want to cancel this class?'
        );

      if (!confirmed) return;
    }

    try {
      setBusyId(id);
      setError('');

      await api(
        `/api/classes/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
          }),
        }
      );

      if (onStatusChange) {
        await onStatusChange();
      }
    } catch (e) {
      console.error(
        'Failed to update class:',
        e
      );

      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!classes.length) {
    return (
      <div className="empty">
        No upcoming classes scheduled.
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      <div className="class-list">
        {classes.map((c) => {
          const date = new Date(
            c.scheduled_at
          );

          const status =
            c.status || 'scheduled';

          const isBusy =
            busyId === c.id;

          return (
            <article
              className={`class-card class-status-${status}`}
              key={c.id}
            >
              <div className="date-block">
                <b>
                  {date.toLocaleDateString(
                    undefined,
                    {
                      day: '2-digit',
                    }
                  )}
                </b>

                <span>
                  {date.toLocaleDateString(
                    undefined,
                    {
                      month: 'short',
                    }
                  )}
                </span>
              </div>

              <div className="class-main">
                <span className="eyebrow">
                  {c.course_name ||
                    'Academy class'}
                </span>

                <h4>{c.title}</h4>

                <p>
                  {c.teacher_name} ·{' '}
                  {date.toLocaleTimeString(
                    [],
                    {
                      hour: 'numeric',
                      minute: '2-digit',
                    }
                  )}{' '}
                  · {c.duration_minutes} min
                </p>

                {c.students?.length > 0 && (
                  <small>
                    Student:{' '}
                    {c.students
                      .map(
                        (student) =>
                          student.name
                      )
                      .join(', ')}
                  </small>
                )}

                <div className="class-meta">
                  <span
                    className={`class-status ${status}`}
                  >
                    {status ===
                      'scheduled' &&
                      'Scheduled'}

                    {status ===
                      'completed' &&
                      'Completed'}

                    {status ===
                      'cancelled' &&
                      'Cancelled'}
                  </span>
                </div>
              </div>

              <div className="class-actions">
                {status === 'scheduled' &&
                  c.meet_link && (
                    <a
                      className="join"
                      href={c.meet_link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join class ↗
                    </a>
                  )}

                {admin && (
                  <div className="admin-class-actions">
                    {status ===
                      'scheduled' && (
                      <>
                        <button
                          type="button"
                          className="class-action-btn"
                          disabled={isBusy}
                          onClick={() =>
                            changeStatus(
                              c.id,
                              'completed'
                            )
                          }
                        >
                          {isBusy
                            ? 'Updating…'
                            : 'Mark completed'}
                        </button>

                        <button
                          type="button"
                          className="class-action-btn danger"
                          disabled={isBusy}
                          onClick={() =>
                            changeStatus(
                              c.id,
                              'cancelled'
                            )
                          }
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {status ===
                      'cancelled' && (
                      <button
                        type="button"
                        className="class-action-btn"
                        disabled={isBusy}
                        onClick={() =>
                          changeStatus(
                            c.id,
                            'scheduled'
                          )
                        }
                      >
                        {isBusy
                          ? 'Updating…'
                          : 'Restore'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

/* =========================================================
   STUDENTS
========================================================= */

function Students({ user }) {
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');

      const path =
        user.role === 'ADMIN'
          ? '/api/students'
          : `/api/rosters/${user.id}`;

      const data = await api(path);
      setItems(data.students || []);
    } catch (e) {
      console.error('Failed to load students:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = async (student) => {
    const action = student.active ? 'deactivate' : 'reactivate';

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${student.name}?`
    );

    if (!confirmed) return;

    try {
      setError('');
      setBusyId(student.id);

      await api(`/api/students/${student.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          active: !student.active,
        }),
      });

      await load();
    } catch (e) {
      console.error('Failed to update student status:', e);
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const deleteStudent = async (student) => {
    const confirmed = window.confirm(
      `Delete student "${student.name}" permanently? This will remove the student from teacher rosters and scheduled classes.`
    );

    if (!confirmed) return;

    try {
      setError('');
      setBusyId(student.id);

      await api(`/api/students/${student.id}`, {
        method: 'DELETE',
      });

      setItems((current) =>
        current.filter((item) => item.id !== student.id)
      );
    } catch (e) {
      console.error('Failed to delete student:', e);
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  return (
    <>
      <div className="toolbar">
        <p className="muted">
          {items.length} students
        </p>

        {user.role === 'ADMIN' && (
          <button
            className="primary small"
            onClick={() => setShow(true)}
          >
            + Create student
          </button>
        )}
      </div>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      <div className="table-card">
        {loading ? (
          <div className="empty">
            Loading students…
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            No students found.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Time zone</th>
                <th>Status</th>
                {user.role === 'ADMIN' && <th>Actions</th>}
              </tr>
            </thead>

            <tbody>
              {items.map((student) => {
                const isBusy = busyId === student.id;

                return (
                  <tr key={student.id}>
                    <td>{student.name}</td>

                    <td>
                      {student.phone || '—'}
                    </td>

                    <td>
                      {student.timezone || '—'}
                    </td>

                    <td>
                      <span
                        className={
                          student.active
                            ? 'status'
                            : 'status inactive'
                        }
                      >
                        {student.active
                          ? 'Active'
                          : 'Inactive'}
                      </span>
                    </td>

                    {user.role === 'ADMIN' && (
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className={
                              student.active
                                ? 'text-btn danger-text'
                                : 'text-btn'
                            }
                            disabled={isBusy}
                            onClick={() => toggleStudent(student)}
                          >
                            {isBusy
                              ? 'Updating…'
                              : student.active
                                ? 'Deactivate'
                                : 'Reactivate'}
                          </button>

                          <button
                            type="button"
                            className="text-btn danger-text"
                            disabled={isBusy}
                            onClick={() => deleteStudent(student)}
                          >
                            {isBusy ? 'Working…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {show && (
        <UserModal
          type="student"
          onClose={() => setShow(false)}
          onDone={load}
        />
      )}
    </>
  );
}

/* =========================================================
   TEACHERS
========================================================= */

function Teachers() {
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      setError('');

      const data = await api('/api/teachers');
      setItems(data.teachers || []);
    } catch (e) {
      console.error('Failed to load teachers:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTeacher = async (teacher) => {
    const action = teacher.active ? 'deactivate' : 'reactivate';

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${teacher.name}?`
    );

    if (!confirmed) return;

    try {
      setError('');
      setBusyId(teacher.id);

      await api(`/api/teachers/${teacher.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          active: !teacher.active,
        }),
      });

      await load();
    } catch (e) {
      console.error('Failed to update teacher status:', e);
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const deleteTeacher = async (teacher) => {
    const confirmed = window.confirm(
      `Delete teacher "${teacher.name}" permanently? This will also remove the teacher's rosters and classes.`
    );

    if (!confirmed) return;

    try {
      setError('');
      setBusyId(teacher.id);

      await api(`/api/teachers/${teacher.id}`, {
        method: 'DELETE',
      });

      setItems((current) =>
        current.filter((item) => item.id !== teacher.id)
      );
    } catch (e) {
      console.error('Failed to delete teacher:', e);
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="toolbar">
        <p className="muted">
          {items.length} teachers
        </p>

        <button
          className="primary small"
          onClick={() => setShow(true)}
        >
          + Create teacher
        </button>
      </div>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty">
          Loading teachers…
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          No teachers found.
        </div>
      ) : (
        <div className="people-grid">
          {items.map((teacher) => {
            const isBusy = busyId === teacher.id;

            return (
              <div
                className={`person-card ${
                  teacher.active ? '' : 'person-inactive'
                }`}
                key={teacher.id}
              >
                <div className="avatar">
                  {teacher.name?.[0] || 'T'}
                </div>

                <div>
                  <h4>{teacher.name}</h4>

                  <p>
                    {teacher.phone || 'No phone'}
                  </p>

                  <small>
                    {teacher.email || 'No email'}
                  </small>

                  <small>
                    {teacher.timezone}
                  </small>

                  <div className="person-actions">
                    <span
                      className={
                        teacher.active
                          ? 'status'
                          : 'status inactive'
                      }
                    >
                      {teacher.active ? 'Active' : 'Inactive'}
                    </span>

                    <button
                      type="button"
                      className={
                        teacher.active
                          ? 'text-btn danger-text'
                          : 'text-btn'
                      }
                      disabled={isBusy}
                      onClick={() => toggleTeacher(teacher)}
                    >
                      {isBusy
                        ? 'Updating…'
                        : teacher.active
                          ? 'Deactivate'
                          : 'Reactivate'}
                    </button>

                    <button
                      type="button"
                      className="text-btn danger-text"
                      disabled={isBusy}
                      onClick={() => deleteTeacher(teacher)}
                    >
                      {isBusy ? 'Working…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {show && (
        <UserModal
          type="teacher"
          onClose={() => setShow(false)}
          onDone={load}
        />
      )}
    </>
  );
}

/* =========================================================
   CREATE STUDENT / TEACHER MODAL
========================================================= */

function UserModal({
  type,
  onClose,
  onDone,
}) {
  const [form, setForm] =
    useState({
      name: '',
      phone: '',
      email: '',
      password: '',
      timezone: 'Africa/Lagos',
    });

  const [error, setError] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const submit = async (e) => {
    e.preventDefault();

    setError('');
    setBusy(true);

    try {
      await api(
        `/api/${
          type === 'teacher'
            ? 'teachers'
            : 'students'
        }`,
        {
          method: 'POST',
          body: JSON.stringify(form),
        }
      );

      await onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Create ${type}`}
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={submit}
      >
        {error && (
          <div className="alert">
            {error}
          </div>
        )}

        <label>
          Full name

          <input
            required
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
          />
        </label>

        <label>
          Phone

          <input
            required
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value,
              })
            }
          />
        </label>

        <label>
          Email (optional)

          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value,
              })
            }
          />
        </label>

        <label>
          Temporary password

          <input
            required
            minLength="8"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm({
                ...form,
                password:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Time zone

          <input
            value={form.timezone}
            onChange={(e) =>
              setForm({
                ...form,
                timezone:
                  e.target.value,
              })
            }
          />
        </label>

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ? 'Creating…'
            : 'Create account'}
        </button>
      </form>
    </Modal>
  );
}

/* =========================================================
   TEACHER ROSTERS
========================================================= */

function Rosters() {
  const [teachers, setTeachers] =
    useState([]);

  const [students, setStudents] =
    useState([]);

  const [teacher, setTeacher] =
    useState('');

  const [assigned, setAssigned] =
    useState([]);

  const [student, setStudent] =
    useState('');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError('');

        const [
          teacherData,
          studentData,
        ] = await Promise.all([
          api('/api/teachers'),
          api('/api/students'),
        ]);

        setTeachers(
          teacherData.teachers || []
        );

        setStudents(
          studentData.students || []
        );

        if (teacherData.teachers?.[0]) {
          setTeacher(
            teacherData.teachers[0].id
          );
        }
      } catch (e) {
        console.error(e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    async function loadAssigned() {
      if (!teacher) {
        setAssigned([]);
        return;
      }

      try {
        const data = await api(
          `/api/rosters/${teacher}`
        );

        setAssigned(
          data.students || []
        );
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
    }

    loadAssigned();
  }, [teacher]);

  const add = async () => {
    if (!teacher || !student) {
      return;
    }

    try {
      setError('');

      await api(
        `/api/rosters/${teacher}`,
        {
          method: 'POST',
          body: JSON.stringify({
            studentId: student,
          }),
        }
      );

      setStudent('');

      const data = await api(
        `/api/rosters/${teacher}`
      );

      setAssigned(
        data.students || []
      );
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (
    studentId
  ) => {
    try {
      setError('');

      await api(
        `/api/rosters/${teacher}/${studentId}`,
        {
          method: 'DELETE',
        }
      );

      setAssigned((current) =>
        current.filter(
          (item) =>
            item.id !== studentId
        )
      );
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="empty">
        Loading teacher rosters…
      </div>
    );
  }

  return (
    <div className="roster">
      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      <div className="toolbar">
        <select
          value={teacher}
          onChange={(e) =>
            setTeacher(e.target.value)
          }
        >
          <option value="">
            Select teacher…
          </option>

          {teachers.map((item) => (
            <option
              value={item.id}
              key={item.id}
            >
              {item.name}
            </option>
          ))}
        </select>

        <div className="inline">
          <select
            value={student}
            onChange={(e) =>
              setStudent(
                e.target.value
              )
            }
          >
            <option value="">
              Add assigned student…
            </option>

            {students
              .filter(
                (s) =>
                  !assigned.some(
                    (a) =>
                      a.id === s.id
                  )
              )
              .map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                >
                  {s.name}
                </option>
              ))}
          </select>

          <button
            className="primary small"
            onClick={add}
            disabled={
              !teacher || !student
            }
          >
            Assign
          </button>
        </div>
      </div>

      <div className="table-card">
        {assigned.length === 0 ? (
          <div className="empty">
            No students assigned to
            this teacher.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  Assigned students
                </th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {assigned.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>

                  <td>
                    {s.phone || '—'}
                  </td>

                  <td>
                    <button
                      className="text-btn"
                      onClick={() =>
                        remove(s.id)
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   CLASSES
========================================================= */

function Classes({ admin = false }) {
  const [classes, setClasses] =
    useState([]);

  const [show, setShow] =
    useState(false);

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const load = async () => {
    try {
      setLoading(true);
      setError('');

      const data =
        await api('/api/classes');

      setClasses(
        data.classes || []
      );
    } catch (e) {
      console.error(
        'Failed to load classes:',
        e
      );

      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="toolbar">
        <p className="muted">
          {classes.length} classes
        </p>

        {admin && (
          <button
            className="primary small"
            onClick={() =>
              setShow(true)
            }
          >
            + Schedule class
          </button>
        )}
      </div>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty">
          Loading classes…
        </div>
      ) : (
        <ClassList
          classes={classes}
          admin={admin}
          onStatusChange={load}
        />
      )}

      {show && (
        <ScheduleModal
          onClose={() =>
            setShow(false)
          }
          onDone={load}
        />
      )}
    </>
  );
}

/* =========================================================
   SCHEDULE CLASS MODAL
========================================================= */

function ScheduleModal({
  onClose,
  onDone,
}) {
  const [teachers, setTeachers] =
    useState([]);

  const [students, setStudents] =
    useState([]);

  const [courses, setCourses] =
    useState([]);

  const [form, setForm] =
    useState({
      teacherId: '',
      studentIds: [],
      courseId: '',
      title: 'Quran & Tajweed',
      scheduledAt: '',
      durationMinutes: 60,
      meetLink: '',
      notes: '',
    });

  const [error, setError] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  useEffect(() => {
    async function loadOptions() {
      try {
        setError('');

        const [
          teacherData,
          courseData,
        ] = await Promise.all([
          api('/api/teachers'),
          api('/api/courses'),
        ]);

        const teacherList =
          teacherData.teachers || [];

        const courseList =
          courseData.courses || [];

        setTeachers(teacherList);
        setCourses(courseList);

        if (teacherList[0]) {
          setForm((current) => ({
            ...current,
            teacherId:
              teacherList[0].id,
          }));
        }
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
    }

    loadOptions();
  }, []);

  useEffect(() => {
    async function loadAssignedStudents() {
      if (!form.teacherId) {
        setStudents([]);
        return;
      }

      try {
        const data = await api(
          `/api/teachers/${form.teacherId}/assigned-students`
        );

        setStudents(
          data.students || []
        );

        setForm((current) => ({
          ...current,
          studentIds: [],
        }));
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
    }

    loadAssignedStudents();
  }, [form.teacherId]);

  const submit = async (e) => {
    e.preventDefault();

    setError('');

    if (!form.teacherId) {
      setError(
        'Please select a teacher.'
      );
      return;
    }

    if (!form.studentIds.length) {
      setError(
        'Please select an assigned student.'
      );
      return;
    }

    if (!form.scheduledAt) {
      setError(
        'Please select a date and time.'
      );
      return;
    }

    if (!form.meetLink) {
      setError(
        'Please enter the Google Meet link.'
      );
      return;
    }

    setBusy(true);

    try {
      await api('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          durationMinutes: Number(
            form.durationMinutes
          ),
        }),
      });

      await onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Schedule one-on-one class"
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={submit}
      >
        {error && (
          <div className="alert">
            {error}
          </div>
        )}

        <label>
          Teacher

          <select
            value={form.teacherId}
            onChange={(e) =>
              setForm({
                ...form,
                teacherId:
                  e.target.value,
                studentIds: [],
              })
            }
          >
            <option value="">
              Select teacher…
            </option>

            {teachers.map((teacher) => (
              <option
                key={teacher.id}
                value={teacher.id}
              >
                {teacher.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Assigned student

          <select
            value={
              form.studentIds[0] || ''
            }
            onChange={(e) =>
              setForm({
                ...form,
                studentIds:
                  e.target.value
                    ? [e.target.value]
                    : [],
              })
            }
          >
            <option value="">
              Select student…
            </option>

            {students.map((student) => (
              <option
                key={student.id}
                value={student.id}
              >
                {student.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Course

          <select
            value={form.courseId}
            onChange={(e) =>
              setForm({
                ...form,
                courseId:
                  e.target.value,
              })
            }
          >
            <option value="">
              Select course…
            </option>

            {courses.map((course) => (
              <option
                key={course.id}
                value={course.id}
              >
                {course.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Title

          <input
            required
            value={form.title}
            onChange={(e) =>
              setForm({
                ...form,
                title: e.target.value,
              })
            }
          />
        </label>

        <div className="two">
          <label>
            Date & time

            <input
              required
              type="datetime-local"
              onChange={(e) =>
                setForm({
                  ...form,
                  scheduledAt:
                    new Date(
                      e.target.value
                    ).toISOString(),
                })
              }
            />
          </label>

          <label>
            Duration

            <select
              value={
                form.durationMinutes
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  durationMinutes:
                    e.target.value,
                })
              }
            >
              <option value="60">
                60 minutes
              </option>

              <option value="45">
                45 minutes
              </option>

              <option value="90">
                90 minutes
              </option>
            </select>
          </label>
        </div>

        <label>
          Google Meet link

          <input
            required
            type="url"
            placeholder="https://meet.google.com/..."
            value={form.meetLink}
            onChange={(e) =>
              setForm({
                ...form,
                meetLink:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Notes

          <textarea
            value={form.notes}
            onChange={(e) =>
              setForm({
                ...form,
                notes: e.target.value,
              })
            }
          />
        </label>

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ? 'Scheduling…'
            : 'Schedule class'}
        </button>
      </form>
    </Modal>
  );
}

/* =========================================================
   PASSWORD
========================================================= */

function Password() {
  const [currentPassword, setCurrent] =
    useState('');

  const [newPassword, setNew] =
    useState('');

  const [msg, setMsg] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const submit = async (e) => {
    e.preventDefault();

    setMsg('');
    setBusy(true);

    try {
      await api(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );

      setMsg(
        'Password changed successfully.'
      );

      setCurrent('');
      setNew('');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-card">
      <span className="eyebrow">
        SECURITY
      </span>

      <h3>Change password</h3>

      <p className="muted">
        Your current password is required
        before setting a new one.
      </p>

      {msg && (
        <div className="alert">
          {msg}
        </div>
      )}

      <form
        className="modal-form"
        onSubmit={submit}
      >
        <label>
          Current password

          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) =>
              setCurrent(
                e.target.value
              )
            }
          />
        </label>

        <label>
          New password

          <input
            type="password"
            minLength="8"
            required
            value={newPassword}
            onChange={(e) =>
              setNew(
                e.target.value
              )
            }
          />
        </label>

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ? 'Updating…'
            : 'Update password'}
        </button>
      </form>
    </div>
  );
}

/* =========================================================
   MODAL
========================================================= */

function Modal({
  title,
  onClose,
  children,
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>

          <button
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/* =========================================================
   START APP
========================================================= */

createRoot(
  document.getElementById('root')
).render(
  <App />
);
