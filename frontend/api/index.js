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

// ── Master DB Pool (lazy) ──
let masterPool = null;
function getPool() {
  if (!masterPool) {
    masterPool = mysql.createPool({
      host:               process.env.DB_MASTER_HOST     || '89.117.56.39',
      port:               parseInt(process.env.DB_MASTER_PORT) || 3308,
      database:           process.env.DB_MASTER_NAME     || 'mirestaurante_saas',
      user:               process.env.DB_MASTER_USER     || 'saas_user',
      password:           process.env.DB_MASTER_PASSWORD || '',
      waitForConnections: true,
      connectionLimit:    5,
      charset:            'utf8mb4'
    });
  }
  return masterPool;
}

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
app.post('/saas-api/saas/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: { code: 'MISSING_PASSWORD', message: 'Password requerido' } });

    // Hash hardcodeado como fallback si env var falla por caracteres especiales ($)
    const HASH_FALLBACK = '$2a$10$3nzYvXb.Qz.zDFPXjuk6i.mVPjGFsRugJmKs1T1ZJLNXJzqwIxOWq';
    const hash = process.env.SAAS_ADMIN_HASH || HASH_FALLBACK;

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ success: false, error: { code: 'WRONG_PASSWORD', message: 'Password incorrecto' } });

    const token = jwt.sign({ role: 'saas_admin' }, SAAS_ADMIN_SECRET, { expiresIn: '12h' });
    res.json({ success: true, data: { token } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── GET /api/saas/tenants ──
app.get('/saas-api/saas/tenants', saasAdminAuth, async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, nombre_negocio, slug, db_name, usuario_login, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, activo, observaciones, created_at FROM tenants ORDER BY id DESC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── POST /api/saas/tenants ──
app.post('/saas-api/saas/tenants', saasAdminAuth, async (req, res) => {
  try {
    const { nombre_negocio, slug, usuario_login, password, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, observaciones } = req.body;

    if (!nombre_negocio || !slug || !usuario_login || !password) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Faltan campos obligatorios' } });
    }

    const slugClean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const dbName    = `tenancy_${slugClean.replace(/-/g, '_')}`;

    const [exist] = await getPool().query('SELECT id FROM tenants WHERE slug = ?', [slugClean]);
    if (exist.length) return res.status(409).json({ success: false, error: { code: 'SLUG_EXISTS', message: 'El slug ya está en uso' } });

    const hash = await bcrypt.hash(password, 10);

    const [result] = await getPool().query(
      'INSERT INTO tenants (nombre_negocio, slug, db_name, usuario_login, password_hash, correo, telefono, fecha_inicio_licencia, fecha_fin_licencia, modulos, activo, observaciones) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)',
      [nombre_negocio, slugClean, dbName, usuario_login, hash, correo||null, telefono||null, fecha_inicio_licencia||null, fecha_fin_licencia||null, modulos||'pos,productos,cartera,finanzas,config', observaciones||null]
    );

    // Crear BD del tenant en Contabo
    await getPool().query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

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

    // Schema completo — idéntico al backend en Contabo (createTenantDB.js)
    const schemaSQL = `
      CREATE TABLE IF NOT EXISTS contadores (nombre VARCHAR(50) PRIMARY KEY, valor INT NOT NULL DEFAULT 0) ENGINE=InnoDB;
      INSERT IGNORE INTO contadores (nombre, valor) VALUES ('pedido', 0), ('venta', 0);
      CREATE TABLE IF NOT EXISTS configuracion (id INT PRIMARY KEY DEFAULT 1, nombre_negocio VARCHAR(100) NOT NULL DEFAULT 'Mi Restaurante', nit VARCHAR(50), telefono VARCHAR(30), ciudad VARCHAR(80), direccion VARCHAR(150), logo_url VARCHAR(500), imprimir_auto TINYINT(1) DEFAULT 0, mostrar_costos TINYINT(1) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL, email VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, rol ENUM('admin','vendedor') DEFAULT 'vendedor', activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS categorias (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(80) NOT NULL, orden INT DEFAULT 0, activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS mesas (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(50) NOT NULL, activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS vendedores (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100) NOT NULL, activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS metodos_pago (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(60) NOT NULL, tipo ENUM('efectivo','transferencia','tarjeta','credito','otro') DEFAULT 'otro', activo TINYINT(1) DEFAULT 1) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS productos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(120) NOT NULL, descripcion TEXT, categoria_id INT, precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0, precio_costo DECIMAL(12,2) DEFAULT 0, imagen_url VARCHAR(500), visible_formulario TINYINT(1) DEFAULT 1, activo TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS pedidos (id INT AUTO_INCREMENT PRIMARY KEY, numero INT NOT NULL UNIQUE, cliente_nombre VARCHAR(100), mesa_id INT, vendedor_nombre VARCHAR(100), tipo ENUM('mesa','domicilio','para_llevar') DEFAULT 'para_llevar', estado ENUM('pendiente','en_preparacion','listo','entregado','cancelado') DEFAULT 'pendiente', domicilio DECIMAL(12,2) DEFAULT 0, observaciones TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON DELETE SET NULL) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS pedido_detalle (id INT AUTO_INCREMENT PRIMARY KEY, pedido_id INT NOT NULL, producto_id INT, nombre_producto VARCHAR(120) NOT NULL, cantidad INT NOT NULL DEFAULT 1, precio_unitario DECIMAL(12,2) NOT NULL, precio_costo DECIMAL(12,2) DEFAULT 0, subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED, FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE, FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS ventas (id INT AUTO_INCREMENT PRIMARY KEY, folio VARCHAR(30) NOT NULL UNIQUE, numero INT, pedido_id INT, cliente_nombre VARCHAR(100), vendedor_nombre VARCHAR(100), total DECIMAL(12,2) NOT NULL DEFAULT 0, utilidad_bruta DECIMAL(12,2) DEFAULT 0, estado ENUM('aceptada','anulada') DEFAULT 'aceptada', observaciones TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS venta_metodos_pago (id INT AUTO_INCREMENT PRIMARY KEY, venta_id INT NOT NULL, metodo_id INT, metodo_nombre VARCHAR(60), tipo VARCHAR(30), monto DECIMAL(12,2) NOT NULL DEFAULT 0, FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS cartera (id INT AUTO_INCREMENT PRIMARY KEY, numero VARCHAR(20) NOT NULL UNIQUE, pedido_id INT, venta_id INT, trabajador_nombre VARCHAR(100) NOT NULL, total DECIMAL(12,2) NOT NULL DEFAULT 0, pagado DECIMAL(12,2) DEFAULT 0, pendiente DECIMAL(12,2) GENERATED ALWAYS AS (total - pagado) STORED, fecha_emision DATE, fecha_vencimiento DATE, estado ENUM('pendiente','pagado','parcial') DEFAULT 'pendiente', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS cartera_pagos (id INT AUTO_INCREMENT PRIMARY KEY, cartera_id INT NOT NULL, fecha_pago DATE NOT NULL, metodo_pago VARCHAR(60), referencia VARCHAR(100), monto DECIMAL(12,2) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (cartera_id) REFERENCES cartera(id) ON DELETE CASCADE) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS costeos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(120) NOT NULL, porciones INT DEFAULT 1, precio_venta DECIMAL(12,2) DEFAULT 0, costo_total DECIMAL(12,2) DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS costeo_ingredientes (id INT AUTO_INCREMENT PRIMARY KEY, costeo_id INT NOT NULL, nombre VARCHAR(100) NOT NULL, cantidad DECIMAL(10,3) DEFAULT 1, unidad VARCHAR(20), costo_unitario DECIMAL(12,2) DEFAULT 0, FOREIGN KEY (costeo_id) REFERENCES costeos(id) ON DELETE CASCADE) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS turnos_caja (id INT AUTO_INCREMENT PRIMARY KEY, base_caja DECIMAL(12,2) DEFAULT 0, estado ENUM('abierto','cerrado') DEFAULT 'abierto', fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP, fecha_cierre TIMESTAMP NULL, total_ventas DECIMAL(12,2) DEFAULT 0, total_gastos DECIMAL(12,2) DEFAULT 0, efectivo_esperado DECIMAL(12,2) DEFAULT 0) ENGINE=InnoDB;
      CREATE TABLE IF NOT EXISTS caja_gastos (id INT AUTO_INCREMENT PRIMARY KEY, turno_id INT NOT NULL, descripcion VARCHAR(200) NOT NULL, monto DECIMAL(12,2) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (turno_id) REFERENCES turnos_caja(id) ON DELETE CASCADE) ENGINE=InnoDB;
    `;

    const statements = schemaSQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const sql of statements) {
      await tenantPool.query(sql);
    }

    // Seeds iniciales
    await tenantPool.query(`INSERT IGNORE INTO configuracion (id, nombre_negocio) VALUES (1, ?)`, [nombre_negocio]);
    await tenantPool.query(`INSERT IGNORE INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')`,
      [usuario_login, `${usuario_login}@${dbName}.local`, hash]);
    await tenantPool.query(`INSERT IGNORE INTO metodos_pago (nombre, tipo) VALUES ('Efectivo','efectivo'),('Transferencia','transferencia'),('Tarjeta','tarjeta')`);
    await tenantPool.query(`INSERT IGNORE INTO categorias (nombre, orden) VALUES ('Combos',1),('Bebidas',2),('Acompañamientos',3)`);

    await tenantPool.end();

    res.status(201).json({ success: true, data: { id: result.insertId, slug: slugClean, db_name: dbName } });
  } catch (err) {
    console.error('[POST /saas/tenants]', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── PUT /api/saas/tenants/:id ──
app.put('/saas-api/saas/tenants/:id', saasAdminAuth, async (req, res) => {
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

    // Datos actuales del tenant (para sincronizar el usuario admin dentro de su BD)
    const [[actual]] = await getPool().query('SELECT db_name, usuario_login FROM tenants WHERE id = ?', [req.params.id]);
    if (!actual) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

    values.push(req.params.id);
    await getPool().query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, values);

    // El login del restaurante valida contra `usuarios` en SU base de datos, no contra `tenants`.
    // Si cambió la contraseña (o el usuario), se sincroniza ahí para que sea la que realmente abre su programa.
    if (password || (usuario_login && usuario_login !== actual.usuario_login)) {
      const tenantPool = mysql.createPool({
        host: process.env.DB_MASTER_HOST || '89.117.56.39',
        port: parseInt(process.env.DB_MASTER_PORT) || 3308,
        database: actual.db_name,
        user: process.env.DB_MASTER_USER || 'saas_user',
        password: process.env.DB_MASTER_PASSWORD || '',
        connectionLimit: 1,
        charset: 'utf8mb4'
      });
      try {
        const nuevoUsuario = usuario_login || actual.usuario_login;
        const uSets = ['nombre = ?'], uVals = [nuevoUsuario];
        if (password) { uSets.push('password_hash = ?'); uVals.push(await bcrypt.hash(password, 10)); }
        const emailViejo = `${actual.usuario_login}@${actual.db_name}.local`;
        let [r] = await tenantPool.query(`UPDATE usuarios SET ${uSets.join(', ')} WHERE email = ? OR nombre = ?`, [...uVals, emailViejo, actual.usuario_login]);
        if (!r.affectedRows) {
          // Respaldo: el primer administrador de esa base
          [r] = await tenantPool.query(`UPDATE usuarios SET ${uSets.join(', ')} WHERE rol = 'admin' ORDER BY id LIMIT 1`, uVals);
        }
        if (!r.affectedRows) throw new Error('No se encontró el usuario administrador en la base del restaurante');
      } finally {
        await tenantPool.end();
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ── PATCH /api/saas/tenants/:id/toggle ──
app.patch('/saas-api/saas/tenants/:id/toggle', saasAdminAuth, async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT activo FROM tenants WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    const nuevoEstado = rows[0].activo ? 0 : 1;
    await getPool().query('UPDATE tenants SET activo = ? WHERE id = ?', [nuevoEstado, req.params.id]);
    res.json({ success: true, data: { activo: nuevoEstado } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

module.exports = app;
