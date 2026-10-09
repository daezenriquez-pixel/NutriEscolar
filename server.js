require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = process.env.JWT_SECRET || 'cambiar';
const q = (sql, p) => pool.query(sql, p).then(r => r.rows);
const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Error del servidor' }); });
const auth = rol => (req, res, next) => {
  try {
    const u = jwt.verify((req.headers.authorization || '').slice(7), SECRET);
    if (u.rol !== rol) throw 0;
    req.u = u; next();
  } catch { res.status(401).json({ error: 'No autorizado' }); }
};
const esp32 = (req, res, next) =>
  req.headers['x-api-key'] === process.env.ESP32_KEY ? next() : res.status(401).json({ error: 'Clave inválida' });

const calcEstado = i => i < 18.5 ? 'Bajo peso' : i < 25 ? 'Peso normal' : i < 30 ? 'Sobrepeso' : 'Obesidad';

// ---------- Login (admin y estudiante) ----------
app.post('/api/login', wrap(async (req, res) => {
  const { usuario, clave } = req.body;
  if (usuario === process.env.ADMIN_USER && clave === process.env.ADMIN_PASS)
    return res.json({ rol: 'admin', token: jwt.sign({ rol: 'admin' }, SECRET, { expiresIn: '8h' }) });
  const [e] = await q('select id,nombre from estudiantes where documento=$1', [String(usuario || '')]);
  if (e && usuario === clave)
    return res.json({ rol: 'est', nombre: e.nombre, token: jwt.sign({ rol: 'est', id: e.id }, SECRET, { expiresIn: '4h' }) });
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
}));

// ---------- Administrador ----------
app.get('/api/grados', auth('admin'), wrap(async (_, res) => res.json(await q('select * from grados order by id'))));

app.post('/api/estudiantes', auth('admin'), wrap(async (req, res) => {
  const { nombre, grado_id, documento } = req.body;
  if (!nombre || !grado_id || !/^\d{5,15}$/.test(documento || ''))
    return res.status(400).json({ error: 'Completa nombre, grado y un documento numérico válido' });
  try {
    const [e] = await q('insert into estudiantes(nombre,grado_id,documento) values($1,$2,$3) returning *', [nombre.trim(), grado_id, documento]);
    res.json(e);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ese documento ya está registrado' });
    throw err;
  }
}));

app.get('/api/estudiantes', auth('admin'), wrap(async (req, res) =>
  res.json(await q('select * from estudiantes where grado_id=$1 order by nombre', [req.query.grado_id]))));

app.put('/api/estudiantes/:id', auth('admin'), wrap(async (req, res) => {
  const peso = parseFloat(req.body.peso), altura = parseFloat(req.body.altura_cm);
  if (!(peso > 5 && peso < 250) || !(altura > 50 && altura < 230))
    return res.status(400).json({ error: 'Peso o altura fuera de rango' });
  const imc = +(peso / ((altura / 100) ** 2)).toFixed(1), estado = calcEstado(imc);
  const [e] = await q(
    'update estudiantes set peso=$1,altura_cm=$2,imc=$3,estado=$4,actualizado=now() where id=$5 returning *',
    [peso, altura, imc, estado, req.params.id]);
  await q('insert into historial(estudiante_id,peso,altura_cm,imc,estado) values($1,$2,$3,$4,$5)', [e.id, peso, altura, imc, estado]);
  res.json(e);
}));

// ---------- Botón "Medir altura" (web -> API -> ESP32) ----------
app.post('/api/medir', auth('admin'), wrap(async (_, res) => {
  await q("update solicitudes set estado='error' where estado in ('pendiente','midiendo')");
  const [s] = await q('insert into solicitudes default values returning id');
  res.json(s);
}));

app.get('/api/medir/:id', auth('admin'), wrap(async (req, res) => {
  const [s] = await q("select estado,altura_cm,creado < now()-interval '40 seconds' as vencida from solicitudes where id=$1", [req.params.id]);
  if (!s) return res.status(404).json({ error: 'No existe' });
  res.json({ estado: s.vencida && s.estado !== 'listo' ? 'timeout' : s.estado, altura_cm: s.altura_cm });
}));

// ---------- Endpoints del ESP32 ----------
app.get('/api/esp32/pendiente', esp32, wrap(async (_, res) => {
  const r = await q(`update solicitudes set estado='midiendo' where id=(
      select id from solicitudes where estado='pendiente' and creado>now()-interval '30 seconds'
      order by id limit 1) returning id`);
  res.json(r[0] || {});
}));

app.post('/api/esp32/resultado', esp32, wrap(async (req, res) => {
  const { id, altura_cm } = req.body;
  const ok = altura_cm >= 50 && altura_cm <= 230;
  await q('update solicitudes set estado=$1, altura_cm=$2 where id=$3', [ok ? 'listo' : 'error', ok ? altura_cm : null, id]);
  res.json({ ok });
}));

// ---------- Estudiante ----------
app.get('/api/mi-panel', auth('est'), wrap(async (req, res) => {
  const [e] = await q(`select e.nombre,e.documento,g.nombre grado,e.peso,e.altura_cm,e.imc,e.estado,e.actualizado
                       from estudiantes e join grados g on g.id=e.grado_id where e.id=$1`, [req.u.id]);
  const [d] = e.estado ? await q('select titulo,recomendaciones from dietas where estado=$1', [e.estado]) : [];
  const h = await q('select imc,estado,peso,altura_cm,fecha from historial where estudiante_id=$1 order by fecha desc limit 12', [req.u.id]);
  res.json({ ...e, dieta: d || null, historial: h });
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Comfandi IMC en puerto ' + port));
