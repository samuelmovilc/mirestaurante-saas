// MiRestaurante SaaS — Vercel Serverless API
// Mismo patrón que movilcontrol: Express en Vercel Function
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Tenant']
}));

// ── Master DB Pool ──
const masterPool = mysql.createPool({
  host:               process.env.DB_MASTER_HOST     || '89.117.56.39',
  port:               parseInt(process.env.DB_MASTER_PORT) || 3308,
  database:           process.env.DB_MASTER_NAME     || 'mirestaurante_saas',
  user:               process.env.DB_MASTER_USER     || 'saas_user',
  password:           process.env.DB_MASTER_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    5,
  charset:            'utf8mb4'
});

// ── SaaS Admin Auth Middleware ──
const SAAS_ADMIN_SECRET = process.env.SAAS_ADMIN_SECRET || 'saas_admin_secret_2026';

const saasAdminAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'Token requerido' } });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SAAS_ADMIN_SECRET);
    if (decoded.role !== 'saas_admin') throw new Error('Not admin');
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token inválido o expirado' } });
  }
};

// ── Health ──
app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'mirestaurante-saas', status: 'connected' });
});

// ── POST /api/saas/login ──
app.post('/api/saas/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: { code: 'MISSING_PASSWORD', message: 'Password requerido' } });

    const hash = process.env.SAAS_ADMIN_HASH;
    if (!hash) return res.status(500).json({ success: false, error: { code: 'NO_HASH', message: 'SAAS_ADMIN_HASH no configurado' } });

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ success: false, error: { code: 'WRONG_PASSWORD', message: 'Password incorrecto' } });

    const token = jwt.sign({ role: 'saas_admin' }, SAAS_ADMIN_SECRET, { expiresIn: '12h' });
    res.json({ success: true, data: { token } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── GET /api/saas/tenants ──
app.get('/api/saas/tenants', saasAdminAuth, async (req, res) => {
  try {
    const [rows] = await masterPool.query(
      'SELECT id, nombre_negocio, slug, db_name, usuario_login, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, activo, observaciones, created_at FROM tenants ORDER BY id DESC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── POST /api/saas/tenants ──
app.post('/api/saas/tenants', saasAdminAuth, async (req, res) => {
  try {
    const { nombre_negocio, slug, usuario_login, password, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, observaciones } = req.body;

    if (!nombre_negocio || !slug || !usuario_login || !password) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Faltan campos obligatorios' } });
    }

    const slugClean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const dbName    = `tenancy_${slugClean.replace(/-/g, '_')}`;

    const [exist] = await masterPool.query('SELECT id FROM tenants WHERE slug = ?', [slugClean]);
    if (exist.length) return res.status(409).json({ success: false, error: { code: 'SLUG_EXISTS', message: 'El slug ya está en uso' } });

    const hash = await bcrypt.hash(password, 10);

    const [result] = await masterPool.query(
      'INSERT INTO tenants (nombre_negocio, slug, db_name, usuario_login, password_hash, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, activo, observaciones) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)',
      [nombre_negocio, slugClean, dbName, usuario_login, hash, correo||null, telefono||null, fecha_inicio_licencia||null, fecha_fin_licencia||null, modulos||'pos,productos,cartera,finanzas,config', observaciones||null]
    );

    // Crear BD del tenant en Contabo
    await masterPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    // Schema básico del tenant
    const tenantPool = mysql.createPool({
      host: process.env.DB_MASTER_HOST || '89.117.56.39',
      port: parseInt(process.env.DB_MASTER_PORT) || 3308,
      database: dbName,
      user: process.env.DB_MASTER_USER || 'saas_user',
      password: process.env.DB_MASTER_PASSWORD || '',
      connectionLimit: 2,
      charset: 'utf8mb4'
    });

    const schema = [
      `CREATE TABLE IF NOT EXISTS configuracion (id INT PRIMARY KEY DEFAULT 1, nombre_negocio VARCHAR(150), nit VARCHAR(50), direccion VARCHAR(200), telefono VARCHAR(50), email VARCHAR(120), logo_url VARCHAR(500), moneda VARCHAR(10) DEFAULT 'COP', impuesto_porcentaje DECIMAL(5,2) DEFAULT 0, mensaje_factura TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), username VARCHAR(60) UNIQUE, password_hash VARCHAR(255), rol ENUM('admin','cajero','mesero') DEFAULT 'cajero', activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS categorias (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(80) NOT NULL, color VARCHAR(20) DEFAULT '#6366f1', activo TINYINT(1) DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS productos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150) NOT NULL, descripcion TEXT, precio DECIMAL(12,2) NOT NULL DEFAULT 0, costo DECIMAL(12,2) DEFAULT 0, categoria_id INT, imagen_url VARCHAR(500), activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS mesas (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(60) NOT NULL, zona VARCHAR(60), capacidad INT DEFAULT 4, activo TINYINT(1) DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS vendedores (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL, activo TINYINT(1) DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS metodos_pago (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(60) NOT NULL, activo TINYINT(1) DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS pedidos (id INT AUTO_INCREMENT PRIMARY KEY, mesa_id INT, vendedor_id INT, estado ENUM('abierto','pagado','anulado') DEFAULT 'abierto', subtotal DECIMAL(12,2) DEFAULT 0, impuesto DECIMAL(12,2) DEFAULT 0, total DECIMAL(12,2) DEFAULT 0, observaciones TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS pedido_items (id INT AUTO_INCREMENT PRIMARY KEY, pedido_id INT NOT NULL, producto_id INT, nombre_producto VARCHAR(150), precio_unitario DECIMAL(12,2), cantidad INT DEFAULT 1, subtotal DECIMAL(12,2), notas TEXT)`,
      `CREATE TABLE IF NOT EXISTS pagos (id INT AUTO_INCREMENT PRIMARY KEY, pedido_id INT NOT NULL, metodo_pago_id INT, monto DECIMAL(12,2), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS clientes (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(150), documento VARCHAR(60), telefono VARCHAR(50), email VARCHAR(120), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS cartera (id INT AUTO_INCREMENT PRIMARY KEY, cliente_id INT, pedido_id INT, monto_total DECIMAL(12,2), monto_pagado DECIMAL(12,2) DEFAULT 0, saldo DECIMAL(12,2), estado ENUM('pendiente','parcial','pagado') DEFAULT 'pendiente', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `INSERT IGNORE INTO configuracion (id, nombre_negocio) VALUES (1, '${nombre_negocio.replace(/'/g,"''")}')`,
      `INSERT IGNORE INTO usuarios (nombre, username, password_hash, rol) VALUES ('Administrador', '${usuario_login.replace(/'/g,"''")}', '${hash.replace(/'/g,"''")}', 'admin')`,
      `INSERT IGNORE INTO metodos_pago (nombre) VALUES ('Efectivo'),('Tarjeta'),('Transferencia')`,
      `INSERT IGNORE INTO categorias (nombre, color) VALUES ('General','#6366f1')`
    ];

    for (const sql of schema) {
      await tenantPool.query(sql);
    }
    await tenantPool.end();

    res.status(201).json({ success: true, data: { id: result.insertId, slug: slugClean, db_name: dbName } });
  } catch (err) {
    console.error('[POST /saas/tenants]', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── PUT /api/saas/tenants/:id ──
app.put('/api/saas/tenants/:id', saasAdminAuth, async (req, res) => {
  try {
    const { nombre_negocio, usuario_login, password, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, observaciones } = req.body;
    let sets = [], values = [];

    if (nombre_negocio)                       { sets.push('nombre_negocio = ?');        values.push(nombre_negocio); }
    if (usuario_login)                        { sets.push('usuario_login = ?');         values.push(usuario_login); }
    if (correo !== undefined)                 { sets.push('correo = ?');                values.push(correo); }
    if (telefono !== undefined)               { sets.push('telefono = ?');              values.push(telefono); }
    if (fecha_inicio_licencia)                { sets.push('fecha_inicio_licencia = ?'); values.push(fecha_inicio_licencia); }
    if (fecha_fin_licencia !== undefined)     { sets.push('fecha_fin_licencia = ?');    values.push(fecha_fin_licencia||null); }
    if (modulos)                              { sets.push('modulos = ?');               values.push(modulos); }
    if (observaciones !== undefined)          { sets.push('observaciones = ?');         values.push(observaciones); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push('password_hash = ?'); values.push(hash);
    }

    if (!sets.length) return res.status(400).json({ success: false, error: { code: 'NOTHING_TO_UPDATE' } });

    values.push(req.params.id);
    await masterPool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── PATCH /api/saas/tenants/:id/toggle ──
app.patch('/api/saas/tenants/:id/toggle', saasAdminAuth, async (req, res) => {
  try {
    const [rows] = await masterPool.query('SELECT activo FROM tenants WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    const nuevoEstado = rows[0].activo ? 0 : 1;
    await masterPool.query('UPDATE tenants SET activo = ? WHERE id = ?', [nuevoEstado, req.params.id]);
    res.json({ success: true, data: { activo: nuevoEstado } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

module.exports = app;
