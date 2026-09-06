import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { z } from 'zod';
import { query, pool } from './db.js';
import { requireAuth, requireRole, signUser } from './auth.js';
dotenv.config();
const app = express();
const port = Number(process.env.PORT || 4000);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const loginSchema = z.object({ identifier: z.string().min(3), password: z.string().min(1) });
const userSchema = z.object({ name:z.string().min(2).max(160), phone:z.string().min(7).max(40).optional(), email:z.string().email().or(z.literal('')).optional(), password:z.string().min(8), timezone:z.string().min(1).max(80).default('Africa/Lagos') });
function publicUser(r){ return {id:r.id,name:r.name,email:r.email,phone:r.phone,role:r.role,active:r.active,timezone:r.timezone}; }
app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'minaret-academy-api'}));
app.post('/api/auth/login', async (req,res)=>{
  const parsed=loginSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Enter your login ID and password'});
  const {identifier,password}=parsed.data;
  const {rows}=await query('SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1 LIMIT 1',[identifier]);
  const user=rows[0];
  if(!user || !user.active || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Invalid login details'});
  res.cookie('session',signUser(user),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000});
  res.json({user:publicUser(user)});
});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('session');res.json({ok:true});});
app.get('/api/auth/me',requireAuth,(req,res)=>res.json({user:req.user}));
app.post('/api/auth/change-password',requireAuth,async(req,res)=>{
  const s=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(8).max(200)}).safeParse(req.body);
  if(!s.success)return res.status(400).json({error:'New password must be at least 8 characters'});
  const {rows}=await query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
  if(!(await bcrypt.compare(s.data.currentPassword,rows[0].password_hash)))return res.status(400).json({error:'Current password is incorrect'});
  await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(s.data.newPassword,12),req.user.id]);
  res.json({ok:true});
});
app.get('/api/courses',requireAuth,async(_req,res)=>{const {rows}=await query('SELECT * FROM courses WHERE active=true ORDER BY name');res.json({courses:rows});});
app.get('/api/students',requireAuth,requireRole('ADMIN'),async(_req,res)=>{const {rows}=await query(`SELECT id,name,phone,email,timezone,active,created_at FROM users WHERE role='STUDENT' ORDER BY name`);res.json({students:rows});});
app.post('/api/students',requireAuth,requireRole('ADMIN'),async(req,res)=>{
  const s=userSchema.safeParse(req.body);if(!s.success)return res.status(400).json({error:'Invalid student details'});
  const {name,phone,email,password,timezone}=s.data;if(!phone)return res.status(400).json({error:'Student phone number is required'});
  try{const hash=await bcrypt.hash(password,12);const {rows}=await query(`INSERT INTO users(name,phone,email,password_hash,role,timezone) VALUES($1,$2,$3,$4,'STUDENT',$5) RETURNING id,name,phone,email,role,timezone,active`,[name,phone,email||null,hash,timezone]);res.status(201).json({student:rows[0]});}catch(e){res.status(409).json({error:e.code==='23505'?'Phone or email already exists':'Could not create student'});}
});
app.get('/api/teachers',requireAuth,requireRole('ADMIN'),async(_req,res)=>{const {rows}=await query(`SELECT id,name,phone,email,timezone,active,created_at FROM users WHERE role='TEACHER' ORDER BY name`);res.json({teachers:rows});});
app.post('/api/teachers',requireAuth,requireRole('ADMIN'),async(req,res)=>{
  const s=userSchema.safeParse(req.body);if(!s.success)return res.status(400).json({error:'Invalid teacher details'});const {name,phone,email,password,timezone}=s.data;if(!phone)return res.status(400).json({error:'Teacher phone number is required'});
  try{const hash=await bcrypt.hash(password,12);const {rows}=await query(`INSERT INTO users(name,phone,email,password_hash,role,timezone) VALUES($1,$2,$3,$4,'TEACHER',$5) RETURNING id,name,phone,email,role,timezone,active`,[name,phone,email||null,hash,timezone]);res.status(201).json({teacher:rows[0]});}catch(e){res.status(409).json({error:e.code==='23505'?'Phone or email already exists':'Could not create teacher'});}
});
app.get('/api/rosters/:teacherId',requireAuth,async(req,res)=>{
  if(req.user.role!=='ADMIN' && req.user.id!==req.params.teacherId)return res.status(403).json({error:'Forbidden'});
  const {rows}=await query(`SELECT u.id,u.name,u.phone,u.email,u.timezone,u.active FROM teacher_students ts JOIN users u ON u.id=ts.student_id WHERE ts.teacher_id=$1 AND u.role='STUDENT' ORDER BY u.name`,[req.params.teacherId]);res.json({students:rows});
});
app.post('/api/rosters/:teacherId',requireAuth,requireRole('ADMIN'),async(req,res)=>{const s=z.object({studentId:z.string().uuid()}).safeParse(req.body);if(!s.success)return res.status(400).json({error:'Invalid student'});const {rows:t}=await query(`SELECT id FROM users WHERE id=$1 AND role='TEACHER'`,[req.params.teacherId]);const {rows:st}=await query(`SELECT id FROM users WHERE id=$1 AND role='STUDENT'`,[s.data.studentId]);if(!t[0]||!st[0])return res.status(400).json({error:'Teacher or student not found'});await query(`INSERT INTO teacher_students(teacher_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.params.teacherId,s.data.studentId]);res.json({ok:true});});
app.delete('/api/rosters/:teacherId/:studentId',requireAuth,requireRole('ADMIN'),async(req,res)=>{await query('DELETE FROM teacher_students WHERE teacher_id=$1 AND student_id=$2',[req.params.teacherId,req.params.studentId]);res.json({ok:true});});
app.get('/api/classes',requireAuth,async(req,res)=>{
  let sql=`SELECT c.*, t.name teacher_name, co.name course_name, co.name_ar course_name_ar, COALESCE(json_agg(json_build_object('id',s.id,'name',s.name,'phone',s.phone)) FILTER (WHERE s.id IS NOT NULL),'[]') students FROM classes c JOIN users t ON t.id=c.teacher_id LEFT JOIN courses co ON co.id=c.course_id LEFT JOIN class_students cs ON cs.class_id=c.id LEFT JOIN users s ON s.id=cs.student_id`;
  const params=[]; if(req.user.role==='TEACHER'){params.push(req.user.id);sql+=' WHERE c.teacher_id=$1';} else if(req.user.role==='STUDENT'){params.push(req.user.id);sql+=' WHERE cs.student_id=$1';}
  sql+=' GROUP BY c.id,t.name,co.name,co.name_ar ORDER BY c.scheduled_at ASC'; const {rows}=await query(sql,params);res.json({classes:rows});
});
app.get('/api/teachers/:teacherId/assigned-students',requireAuth,async(req,res)=>{if(req.user.role!=='ADMIN'&&req.user.id!==req.params.teacherId)return res.status(403).json({error:'Forbidden'});const {rows}=await query(`SELECT u.id,u.name,u.phone,u.timezone FROM teacher_students ts JOIN users u ON u.id=ts.student_id WHERE ts.teacher_id=$1 AND u.active=true ORDER BY u.name`,[req.params.teacherId]);res.json({students:rows});});
app.post('/api/classes',requireAuth,requireRole('ADMIN'),async(req,res)=>{
 const s=z.object({teacherId:z.string().uuid(),studentIds:z.array(z.string().uuid()).min(1),courseId:z.string().uuid().optional(),title:z.string().min(2).max(200),scheduledAt:z.string().datetime({offset:true}),durationMinutes:z.number().int().min(15).max(240).default(60),meetLink:z.string().url(),notes:z.string().max(5000).optional()}).safeParse(req.body);if(!s.success)return res.status(400).json({error:'Check the class details and Google Meet link'});
 const c=s.data;const client=await pool.connect();try{await client.query('BEGIN');const allowed=await client.query(`SELECT student_id FROM teacher_students WHERE teacher_id=$1 AND student_id=ANY($2::uuid[])`,[c.teacherId,c.studentIds]);if(allowed.rows.length!==c.studentIds.length){await client.query('ROLLBACK');return res.status(400).json({error:'Every invited student must be assigned to the selected teacher'});}const {rows}=await client.query(`INSERT INTO classes(teacher_id,course_id,title,scheduled_at,duration_minutes,meet_link,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[c.teacherId,c.courseId||null,c.title,c.scheduledAt,c.durationMinutes,c.meetLink,c.notes||null]);for(const id of c.studentIds)await client.query('INSERT INTO class_students(class_id,student_id) VALUES($1,$2)',[rows[0].id,id]);await client.query('COMMIT');res.status(201).json({class:rows[0]});}catch(e){await client.query('ROLLBACK');res.status(500).json({error:'Could not schedule class'});}finally{client.release();}
});
app.patch('/api/classes/:id/status',requireAuth,requireRole('ADMIN'),async(req,res)=>{const s=z.object({status:z.enum(['scheduled','cancelled','completed'])}).safeParse(req.body);if(!s.success)return res.status(400).json({error:'Invalid status'});const {rows}=await query('UPDATE classes SET status=$1 WHERE id=$2 RETURNING *',[s.data.status,req.params.id]);if(!rows[0])return res.status(404).json({error:'Class not found'});res.json({class:rows[0]});});
app.get('/api/admin/overview',requireAuth,requireRole('ADMIN'),async(_req,res)=>{const [{rows:s},{rows:t},{rows:c},{rows:today}]=await Promise.all([query(`SELECT COUNT(*)::int count FROM users WHERE role='STUDENT' AND active=true`),query(`SELECT COUNT(*)::int count FROM users WHERE role='TEACHER' AND active=true`),query(`SELECT COUNT(*)::int count FROM classes WHERE status='scheduled' AND scheduled_at>=NOW()`),query(`SELECT COUNT(*)::int count FROM classes WHERE status='scheduled' AND scheduled_at>=date_trunc('day',NOW()) AND scheduled_at<date_trunc('day',NOW())+interval '1 day'`)]);res.json({students:s[0].count,teachers:t[0].count,upcoming:c[0].count,today:today[0].count});});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Internal server error'});});
export default app;
