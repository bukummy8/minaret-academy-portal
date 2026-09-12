import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { z } from 'zod';

import { query, pool } from './db.js';
import {
  requireAuth,
  requireRole,
  signUser,
} from './auth.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

app.use(
  cors({
    origin:
      process.env.CLIENT_ORIGIN ||
      'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/* =========================================================
   VALIDATION SCHEMAS
========================================================= */

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

const userSchema = z.object({
  name: z.string().min(2).max(160),

  phone: z
    .string()
    .min(7)
    .max(40)
    .optional(),

  email: z
    .string()
    .email()
    .or(z.literal(''))
    .optional(),

  password: z
    .string()
    .min(8)
    .max(200),

  timezone: z
    .string()
    .min(1)
    .max(80)
    .default('Africa/Lagos'),
});

const passwordChangeSchema = z.object({
  currentPassword: z
    .string()
    .min(1),

  newPassword: z
    .string()
    .min(8)
    .max(200),
});

const passwordResetSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .max(200),
});

const userStatusSchema = z.object({
  active: z.boolean(),
});

const classStatusSchema = z.object({
  status: z.enum([
    'scheduled',
    'cancelled',
    'completed',
  ]),
});

const updateClassSchema = z.object({
  teacherId: z
    .string()
    .uuid(),

  studentIds: z
    .array(z.string().uuid())
    .min(1),

  courseId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('')),

  title: z
    .string()
    .min(2)
    .max(200),

  scheduledAt: z
    .string()
    .datetime({
      offset: true,
    }),

  durationMinutes: z
    .number()
    .int()
    .min(15)
    .max(240),

  meetLink: z
    .string()
    .url(),

  notes: z
    .string()
    .max(5000)
    .optional(),
});

/* =========================================================
   HELPERS
========================================================= */

function publicUser(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    active: r.active,
    timezone: r.timezone,
  };
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  '/api/health',
  (_req, res) =>
    res.json({
      status: 'ok',
      service: 'minaret-academy-api',
    })
);

/* =========================================================
   AUTH
========================================================= */

/* -------------------------
   LOGIN
------------------------- */

app.post(
  '/api/auth/login',
  async (req, res) => {
    const parsed =
      loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Enter your login ID and password',
      });
    }

    const {
      identifier,
      password,
    } = parsed.data;

    const { rows } = await query(
      `SELECT *
       FROM users
       WHERE LOWER(email)=LOWER($1)
          OR phone=$1
       LIMIT 1`,
      [identifier]
    );

    const user = rows[0];

    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        error: 'Invalid login details',
      });
    }

    res.cookie(
      'session',
      signUser(user),
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          'production',
        sameSite: 'lax',
        maxAge:
          8 * 60 * 60 * 1000,
      }
    );

    res.json({
      user: publicUser(user),
    });
  }
);

/* -------------------------
   LOGOUT
------------------------- */

app.post(
  '/api/auth/logout',
  (_req, res) => {
    res.clearCookie('session');

    res.json({
      ok: true,
    });
  }
);

/* -------------------------
   CURRENT USER
------------------------- */

app.get(
  '/api/auth/me',
  requireAuth,
  (req, res) =>
    res.json({
      user: req.user,
    })
);

/* -------------------------
   CHANGE OWN PASSWORD
------------------------- */

app.post(
  '/api/auth/change-password',
  requireAuth,
  async (req, res) => {
    const parsed =
      passwordChangeSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'New password must be at least 8 characters',
      });
    }

    const {
      currentPassword,
      newPassword,
    } = parsed.data;

    const { rows } =
      await query(
        `SELECT password_hash
         FROM users
         WHERE id=$1`,
        [req.user.id]
      );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const valid =
      await bcrypt.compare(
        currentPassword,
        rows[0].password_hash
      );

    if (!valid) {
      return res.status(400).json({
        error:
          'Current password is incorrect',
      });
    }

    const hash =
      await bcrypt.hash(
        newPassword,
        12
      );

    await query(
      `UPDATE users
       SET password_hash=$1
       WHERE id=$2`,
      [hash, req.user.id]
    );

    res.json({
      ok: true,
      message:
        'Password changed successfully',
    });
  }
);

/* -------------------------
   ADMIN RESET USER PASSWORD
------------------------- */

app.post(
  '/api/admin/users/:id/reset-password',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      passwordResetSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Password must be at least 8 characters',
      });
    }

    const { newPassword } =
      parsed.data;

    const { rows } =
      await query(
        `SELECT id, role
         FROM users
         WHERE id=$1`,
        [req.params.id]
      );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const hash =
      await bcrypt.hash(
        newPassword,
        12
      );

    await query(
      `UPDATE users
       SET password_hash=$1
       WHERE id=$2`,
      [hash, req.params.id]
    );

    res.json({
      ok: true,
      message:
        'Password reset successfully',
    });
  }
);

/* =========================================================
   COURSES
========================================================= */

app.get(
  '/api/courses',
  requireAuth,
  async (_req, res) => {
    const { rows } =
      await query(
        `SELECT *
         FROM courses
         WHERE active=true
         ORDER BY name`
      );

    res.json({
      courses: rows,
    });
  }
);

/* =========================================================
   STUDENTS
========================================================= */

/* -------------------------
   LIST STUDENTS
------------------------- */

app.get(
  '/api/students',
  requireAuth,
  requireRole('ADMIN'),
  async (_req, res) => {
    const { rows } =
      await query(
        `SELECT
           id,
           name,
           phone,
           email,
           timezone,
           active,
           created_at
         FROM users
         WHERE role='STUDENT'
         ORDER BY name`
      );

    res.json({
      students: rows,
    });
  }
);

/* -------------------------
   CREATE STUDENT
------------------------- */

app.post(
  '/api/students',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      userSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Invalid student details',
      });
    }

    const {
      name,
      phone,
      email,
      password,
      timezone,
    } = parsed.data;

    if (!phone) {
      return res.status(400).json({
        error:
          'Student phone number is required',
      });
    }

    try {
      const hash =
        await bcrypt.hash(
          password,
          12
        );

      const { rows } =
        await query(
          `INSERT INTO users(
             name,
             phone,
             email,
             password_hash,
             role,
             timezone
           )
           VALUES(
             $1,
             $2,
             $3,
             $4,
             'STUDENT',
             $5
           )
           RETURNING
             id,
             name,
             phone,
             email,
             role,
             timezone,
             active`,
          [
            name,
            phone,
            email || null,
            hash,
            timezone,
          ]
        );

      res.status(201).json({
        student: rows[0],
      });
    } catch (e) {
      console.error(
        'Create student error:',
        e
      );

      res.status(409).json({
        error:
          e.code === '23505'
            ? 'Phone or email already exists'
            : 'Could not create student',
      });
    }
  }
);

/* -------------------------
   ACTIVATE / DEACTIVATE STUDENT
------------------------- */

app.patch(
  '/api/students/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      userStatusSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Invalid student status',
      });
    }

    const { active } =
      parsed.data;

    const { rows } =
      await query(
        `UPDATE users
         SET active=$1
         WHERE id=$2
           AND role='STUDENT'
         RETURNING
           id,
           name,
           phone,
           email,
           timezone,
           active`,
        [
          active,
          req.params.id,
        ]
      );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Student not found',
      });
    }

    res.json({
      student: rows[0],
      message: active
        ? 'Student activated successfully'
        : 'Student deactivated successfully',
    });
  }
);

/* =========================================================
   DELETE STUDENT
========================================================= */

app.delete(
  '/api/students/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      /* -------------------------
         Verify student
      ------------------------- */

      const student =
        await client.query(
          `SELECT
             id,
             name,
             role
           FROM users
           WHERE id=$1
           FOR UPDATE`,
          [req.params.id]
        );

      if (!student.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error: 'Student not found',
        });
      }

      if (
        student.rows[0].role !==
        'STUDENT'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'Only student accounts can be deleted here',
        });
      }

      /* -------------------------
         Remove student from
         teacher rosters
      ------------------------- */

      await client.query(
        `DELETE FROM teacher_students
         WHERE student_id=$1`,
        [req.params.id]
      );

      /* -------------------------
         Remove student from
         all classes
      ------------------------- */

      await client.query(
        `DELETE FROM class_students
         WHERE student_id=$1`,
        [req.params.id]
      );

      /* -------------------------
         Delete student account
      ------------------------- */

      const deleted =
        await client.query(
          `DELETE FROM users
           WHERE id=$1
             AND role='STUDENT'
           RETURNING
             id,
             name`,
          [req.params.id]
        );

      if (!deleted.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Student could not be deleted',
        });
      }

      await client.query(
        'COMMIT'
      );

      res.json({
        ok: true,
        message:
          'Student deleted successfully',
        student: deleted.rows[0],
      });
    } catch (e) {
      await client.query(
        'ROLLBACK'
      );

      console.error(
        'Delete student error:',
        e
      );

      res.status(500).json({
        error:
          'Could not delete student',
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   TEACHERS
========================================================= */

/* -------------------------
   LIST TEACHERS
------------------------- */

app.get(
  '/api/teachers',
  requireAuth,
  requireRole('ADMIN'),
  async (_req, res) => {
    const { rows } =
      await query(
        `SELECT
           id,
           name,
           phone,
           email,
           timezone,
           active,
           created_at
         FROM users
         WHERE role='TEACHER'
         ORDER BY name`
      );

    res.json({
      teachers: rows,
    });
  }
);

/* -------------------------
   CREATE TEACHER
------------------------- */

app.post(
  '/api/teachers',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      userSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Invalid teacher details',
      });
    }

    const {
      name,
      phone,
      email,
      password,
      timezone,
    } = parsed.data;

    if (!phone) {
      return res.status(400).json({
        error:
          'Teacher phone number is required',
      });
    }

    try {
      const hash =
        await bcrypt.hash(
          password,
          12
        );

      const { rows } =
        await query(
          `INSERT INTO users(
             name,
             phone,
             email,
             password_hash,
             role,
             timezone
           )
           VALUES(
             $1,
             $2,
             $3,
             $4,
             'TEACHER',
             $5
           )
           RETURNING
             id,
             name,
             phone,
             email,
             role,
             timezone,
             active`,
          [
            name,
            phone,
            email || null,
            hash,
            timezone,
          ]
        );

      res.status(201).json({
        teacher: rows[0],
      });
    } catch (e) {
      console.error(
        'Create teacher error:',
        e
      );

      res.status(409).json({
        error:
          e.code === '23505'
            ? 'Phone or email already exists'
            : 'Could not create teacher',
      });
    }
  }
);

/* -------------------------
   ACTIVATE / DEACTIVATE TEACHER
------------------------- */

app.patch(
  '/api/teachers/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      userStatusSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Invalid teacher status',
      });
    }

    const { active } =
      parsed.data;

    const { rows } =
      await query(
        `UPDATE users
         SET active=$1
         WHERE id=$2
           AND role='TEACHER'
         RETURNING
           id,
           name,
           phone,
           email,
           timezone,
           active`,
        [
          active,
          req.params.id,
        ]
      );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Teacher not found',
      });
    }

    res.json({
      teacher: rows[0],
      message: active
        ? 'Teacher activated successfully'
        : 'Teacher deactivated successfully',
    });
  }
);

/* =========================================================
   DELETE TEACHER
========================================================= */

app.delete(
  '/api/teachers/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      /* -------------------------
         Verify teacher
      ------------------------- */

      const teacher =
        await client.query(
          `SELECT
             id,
             name,
             role
           FROM users
           WHERE id=$1
           FOR UPDATE`,
          [req.params.id]
        );

      if (!teacher.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error: 'Teacher not found',
        });
      }

      if (
        teacher.rows[0].role !==
        'TEACHER'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'Only teacher accounts can be deleted here',
        });
      }

      /* -------------------------
         Find teacher classes
      ------------------------- */

      const classes =
        await client.query(
          `SELECT id
           FROM classes
           WHERE teacher_id=$1`,
          [req.params.id]
        );

      const classIds =
        classes.rows.map(
          (row) => row.id
        );

      /* -------------------------
         Remove class students
      ------------------------- */

      if (classIds.length > 0) {
        await client.query(
          `DELETE FROM class_students
           WHERE class_id = ANY($1::uuid[])`,
          [classIds]
        );
      }

      /* -------------------------
         Delete teacher classes
      ------------------------- */

      await client.query(
        `DELETE FROM classes
         WHERE teacher_id=$1`,
        [req.params.id]
      );

      /* -------------------------
         Remove teacher rosters
      ------------------------- */

      await client.query(
        `DELETE FROM teacher_students
         WHERE teacher_id=$1`,
        [req.params.id]
      );

      /* -------------------------
         Delete teacher account
      ------------------------- */

      const deleted =
        await client.query(
          `DELETE FROM users
           WHERE id=$1
             AND role='TEACHER'
           RETURNING
             id,
             name`,
          [req.params.id]
        );

      if (!deleted.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Teacher could not be deleted',
        });
      }

      await client.query(
        'COMMIT'
      );

      res.json({
        ok: true,
        message:
          'Teacher deleted successfully',
        teacher: deleted.rows[0],
      });
    } catch (e) {
      await client.query(
        'ROLLBACK'
      );

      console.error(
        'Delete teacher error:',
        e
      );

      res.status(500).json({
        error:
          'Could not delete teacher',
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   TEACHER ROSTERS
========================================================= */

/* -------------------------
   GET TEACHER ROSTER
------------------------- */

app.get(
  '/api/rosters/:teacherId',
  requireAuth,
  async (req, res) => {
    if (
      req.user.role !== 'ADMIN' &&
      req.user.id !==
        req.params.teacherId
    ) {
      return res.status(403).json({
        error: 'Forbidden',
      });
    }

    const { rows } =
      await query(
        `SELECT
           u.id,
           u.name,
           u.phone,
           u.email,
           u.timezone,
           u.active
         FROM teacher_students ts
         JOIN users u
           ON u.id=ts.student_id
         WHERE ts.teacher_id=$1
           AND u.role='STUDENT'
         ORDER BY u.name`,
        [req.params.teacherId]
      );

    res.json({
      students: rows,
    });
  }
);

/* -------------------------
   ASSIGN STUDENT
------------------------- */

app.post(
  '/api/rosters/:teacherId',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      z.object({
        studentId:
          z.string().uuid(),
      }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid student',
      });
    }

    const {
      studentId,
    } = parsed.data;

    const { rows: teacherRows } =
      await query(
        `SELECT id
         FROM users
         WHERE id=$1
           AND role='TEACHER'
           AND active=true`,
        [req.params.teacherId]
      );

    const { rows: studentRows } =
      await query(
        `SELECT id
         FROM users
         WHERE id=$1
           AND role='STUDENT'
           AND active=true`,
        [studentId]
      );

    if (
      !teacherRows[0] ||
      !studentRows[0]
    ) {
      return res.status(400).json({
        error:
          'Teacher or student not found or inactive',
      });
    }

    await query(
      `INSERT INTO teacher_students(
         teacher_id,
         student_id
       )
       VALUES($1,$2)
       ON CONFLICT DO NOTHING`,
      [
        req.params.teacherId,
        studentId,
      ]
    );

    res.json({
      ok: true,
    });
  }
);

/* -------------------------
   REMOVE STUDENT FROM ROSTER
------------------------- */

app.delete(
  '/api/rosters/:teacherId/:studentId',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    await query(
      `DELETE FROM teacher_students
       WHERE teacher_id=$1
         AND student_id=$2`,
      [
        req.params.teacherId,
        req.params.studentId,
      ]
    );

    res.json({
      ok: true,
      message:
        'Student removed from teacher roster',
    });
  }
);

/* -------------------------
   ASSIGNED ACTIVE STUDENTS
------------------------- */

app.get(
  '/api/teachers/:teacherId/assigned-students',
  requireAuth,
  async (req, res) => {
    if (
      req.user.role !== 'ADMIN' &&
      req.user.id !==
        req.params.teacherId
    ) {
      return res.status(403).json({
        error: 'Forbidden',
      });
    }

    const { rows } =
      await query(
        `SELECT
           u.id,
           u.name,
           u.phone,
           u.timezone
         FROM teacher_students ts
         JOIN users u
           ON u.id=ts.student_id
         JOIN users t
           ON t.id=ts.teacher_id
         WHERE ts.teacher_id=$1
           AND u.role='STUDENT'
           AND u.active=true
           AND t.role='TEACHER'
           AND t.active=true
         ORDER BY u.name`,
        [req.params.teacherId]
      );

    res.json({
      students: rows,
    });
  }
);

/* =========================================================
   CLASSES
========================================================= */

/* -------------------------
   LIST CLASSES
------------------------- */

app.get(
  '/api/classes',
  requireAuth,
  async (req, res) => {
    let sql = `
      SELECT
        c.*,
        t.name teacher_name,
        t.active teacher_active,
        co.name course_name,
        co.name_ar course_name_ar,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'name', s.name,
              'phone', s.phone,
              'active', s.active
            )
          )
          FILTER (
            WHERE s.id IS NOT NULL
          ),
          '[]'
        ) students
      FROM classes c
      JOIN users t
        ON t.id=c.teacher_id
      LEFT JOIN courses co
        ON co.id=c.course_id
      LEFT JOIN class_students cs
        ON cs.class_id=c.id
      LEFT JOIN users s
        ON s.id=cs.student_id
    `;

    const params = [];

    if (
      req.user.role ===
      'TEACHER'
    ) {
      params.push(req.user.id);

      sql += `
        WHERE c.teacher_id=$1
      `;
    } else if (
      req.user.role ===
      'STUDENT'
    ) {
      params.push(req.user.id);

      sql += `
        WHERE cs.student_id=$1
      `;
    }

    sql += `
      GROUP BY
        c.id,
        t.name,
        t.active,
        co.name,
        co.name_ar
      ORDER BY
        c.scheduled_at ASC
    `;

    const { rows } =
      await query(
        sql,
        params
      );

    res.json({
      classes: rows,
    });
  }
);

/* -------------------------
   CREATE CLASS
------------------------- */

app.post(
  '/api/classes',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      z.object({
        teacherId:
          z.string().uuid(),

        studentIds:
          z.array(
            z.string().uuid()
          ).min(1),

        courseId:
          z
            .string()
            .uuid()
            .optional(),

        title:
          z
            .string()
            .min(2)
            .max(200),

        scheduledAt:
          z.string().datetime({
            offset: true,
          }),

        durationMinutes:
          z
            .number()
            .int()
            .min(15)
            .max(240)
            .default(60),

        meetLink:
          z.string().url(),

        notes:
          z
            .string()
            .max(5000)
            .optional(),
      }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Check the class details and Google Meet link',
      });
    }

    const c =
      parsed.data;

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      /* -------------------------
         Verify active teacher
      ------------------------- */

      const teacher =
        await client.query(
          `SELECT id
           FROM users
           WHERE id=$1
             AND role='TEACHER'
             AND active=true`,
          [c.teacherId]
        );

      if (!teacher.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'Selected teacher is not active',
        });
      }

      /* -------------------------
         Verify active assigned students
      ------------------------- */

      const allowed =
        await client.query(
          `SELECT
             ts.student_id
           FROM teacher_students ts
           JOIN users s
             ON s.id=ts.student_id
           WHERE ts.teacher_id=$1
             AND ts.student_id=ANY($2::uuid[])
             AND s.role='STUDENT'
             AND s.active=true`,
          [
            c.teacherId,
            c.studentIds,
          ]
        );

      if (
        allowed.rows.length !==
        c.studentIds.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'Every invited student must be active and assigned to the selected teacher',
        });
      }

      /* -------------------------
         Create class
      ------------------------- */

      const { rows } =
        await client.query(
          `INSERT INTO classes(
             teacher_id,
             course_id,
             title,
             scheduled_at,
             duration_minutes,
             meet_link,
             notes
           )
           VALUES(
             $1,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7
           )
           RETURNING *`,
          [
            c.teacherId,
            c.courseId ||
              null,
            c.title,
            c.scheduledAt,
            c.durationMinutes,
            c.meetLink,
            c.notes ||
              null,
          ]
        );

      for (
        const id of c.studentIds
      ) {
        await client.query(
          `INSERT INTO class_students(
             class_id,
             student_id
           )
           VALUES($1,$2)`,
          [
            rows[0].id,
            id,
          ]
        );
      }

      await client.query(
        'COMMIT'
      );

      res.status(201).json({
        class: rows[0],
      });
    } catch (e) {
      await client.query(
        'ROLLBACK'
      );

      console.error(
        'Schedule class error:',
        e
      );

      res.status(500).json({
        error:
          'Could not schedule class',
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   EDIT / RESCHEDULE CLASS
========================================================= */

app.patch(
  '/api/classes/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      updateClassSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Check the class details',
      });
    }

    const c =
      parsed.data;

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      /* -------------------------
         Check class
      ------------------------- */

      const existing =
        await client.query(
          `SELECT *
           FROM classes
           WHERE id=$1
           FOR UPDATE`,
          [req.params.id]
        );

      if (!existing.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Class not found',
        });
      }

      /* -------------------------
         Verify teacher
      ------------------------- */

      const teacher =
        await client.query(
          `SELECT id
           FROM users
           WHERE id=$1
             AND role='TEACHER'
             AND active=true`,
          [c.teacherId]
        );

      if (!teacher.rows[0]) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'Selected teacher is not active',
        });
      }

      /* -------------------------
         Verify students belong
         to teacher
      ------------------------- */

      const allowed =
        await client.query(
          `SELECT
             ts.student_id
           FROM teacher_students ts
           JOIN users s
             ON s.id=ts.student_id
           WHERE ts.teacher_id=$1
             AND ts.student_id=ANY($2::uuid[])
             AND s.role='STUDENT'
             AND s.active=true`,
          [
            c.teacherId,
            c.studentIds,
          ]
        );

      if (
        allowed.rows.length !==
        c.studentIds.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'Every student must be active and assigned to the selected teacher',
        });
      }

      /* -------------------------
         Update class
      ------------------------- */

      const { rows } =
        await client.query(
          `UPDATE classes
           SET
             teacher_id=$1,
             course_id=$2,
             title=$3,
             scheduled_at=$4,
             duration_minutes=$5,
             meet_link=$6,
             notes=$7
           WHERE id=$8
           RETURNING *`,
          [
            c.teacherId,
            c.courseId ||
              null,
            c.title,
            c.scheduledAt,
            c.durationMinutes,
            c.meetLink,
            c.notes ||
              null,
            req.params.id,
          ]
        );

      /* -------------------------
         Replace class students
      ------------------------- */

      await client.query(
        `DELETE FROM class_students
         WHERE class_id=$1`,
        [req.params.id]
      );

      for (
        const studentId of c.studentIds
      ) {
        await client.query(
          `INSERT INTO class_students(
             class_id,
             student_id
           )
           VALUES($1,$2)`,
          [
            req.params.id,
            studentId,
          ]
        );
      }

      await client.query(
        'COMMIT'
      );

      res.json({
        class: rows[0],
        message:
          'Class updated successfully',
      });
    } catch (e) {
      await client.query(
        'ROLLBACK'
      );

      console.error(
        'Update class error:',
        e
      );

      res.status(500).json({
        error:
          'Could not update class',
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   CLASS STATUS
========================================================= */

app.patch(
  '/api/classes/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const parsed =
      classStatusSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Invalid status',
      });
    }

    const { status } =
      parsed.data;

    const { rows } =
      await query(
        `UPDATE classes
         SET status=$1
         WHERE id=$2
         RETURNING *`,
        [
          status,
          req.params.id,
        ]
      );

    if (!rows[0]) {
      return res.status(404).json({
        error:
          'Class not found',
      });
    }

    res.json({
      class: rows[0],
      message:
        status ===
        'cancelled'
          ? 'Class cancelled successfully'
          : status ===
              'completed'
            ? 'Class marked as completed'
            : 'Class restored successfully',
    });
  }
);

/* =========================================================
   ADMIN OVERVIEW
========================================================= */

app.get(
  '/api/admin/overview',
  requireAuth,
  requireRole('ADMIN'),
  async (_req, res) => {
    const [
      {
        rows: studentRows,
      },
      {
        rows: teacherRows,
      },
      {
        rows: upcomingRows,
      },
      {
        rows: todayRows,
      },
      {
        rows: cancelledRows,
      },
      {
        rows: completedRows,
      },
      {
        rows: inactiveStudentRows,
      },
      {
        rows: inactiveTeacherRows,
      },
    ] =
      await Promise.all([
        query(
          `SELECT
             COUNT(*)::int count
           FROM users
           WHERE role='STUDENT'
             AND active=true`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM users
           WHERE role='TEACHER'
             AND active=true`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM classes
           WHERE status='scheduled'
             AND scheduled_at>=NOW()`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM classes
           WHERE status='scheduled'
             AND scheduled_at>=date_trunc(
               'day',
               NOW()
             )
             AND scheduled_at<
               date_trunc(
                 'day',
                 NOW()
               ) +
               interval '1 day'`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM classes
           WHERE status='cancelled'`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM classes
           WHERE status='completed'`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM users
           WHERE role='STUDENT'
             AND active=false`
        ),

        query(
          `SELECT
             COUNT(*)::int count
           FROM users
           WHERE role='TEACHER'
             AND active=false`
        ),
      ]);

    res.json({
      students:
        studentRows[0].count,

      teachers:
        teacherRows[0].count,

      upcoming:
        upcomingRows[0].count,

      today:
        todayRows[0].count,

      cancelled:
        cancelledRows[0].count,

      completed:
        completedRows[0].count,

      inactiveStudents:
        inactiveStudentRows[0].count,

      inactiveTeachers:
        inactiveTeacherRows[0].count,
    });
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(err);

    res.status(500).json({
      error:
        'Internal server error',
    });
  }
);

/* =========================================================
   EXPORT
========================================================= */

export default app;