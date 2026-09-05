# The Minaret Academy — Madrasha Portal

Production-oriented full-stack portal for The Minaret Academy. It supports Admin, Teacher and Student roles, phone-based student/teacher accounts, teacher rosters, one-on-one class scheduling, pasted Google Meet links, bilingual English/Arabic UI, and secure password changes.

## Stack
- React + Vite frontend
- Node.js + Express API
- PostgreSQL database
- bcrypt password hashing
- JWT in an HTTP-only cookie
- Docker Compose for local PostgreSQL

## MVP rules implemented
- Only Admin can create teachers and students.
- Only Admin can assign students to teachers.
- A class can invite only students assigned to its selected teacher.
- Teachers see only their own classes and assigned students.
- Students see only classes in which they are invited.
- Google Meet links are pasted by Admin; the portal does not create Google Calendar/Meet events.
- Everyone can change their own password after verifying the current password.
- Students/teachers do not need email addresses; phone is the login identifier.
- Time zones are stored per user and classes are stored as UTC timestamps.

## Run locally
1. Install Node.js 22+ and Docker.
2. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` and admin password.
3. Start PostgreSQL: `docker compose up -d postgres`
4. Install dependencies: `npm install && npm --prefix server install && npm --prefix client install`
5. Migrate: `npm --prefix server run migrate`
6. Seed admin/courses: `npm --prefix server run seed`
7. Start: `npm run dev`
8. Open `http://localhost:5173`

Default seeded admin email is from `ADMIN_EMAIL`; never use the example password in production.

## Production
Build the client with `npm run build`, serve the generated client behind HTTPS, run the Express API with a process manager/container, and use managed PostgreSQL. Set `NODE_ENV=production`, a strong `JWT_SECRET`, production `DATABASE_URL`, and the exact HTTPS `CLIENT_ORIGIN`.

## Brand
The supplied official Minaret Academy logo is included at `client/src/assets/minaret-logo.png`. The UI uses the logo's deep brown identity with warm ivory, sand and restrained gold accents.
