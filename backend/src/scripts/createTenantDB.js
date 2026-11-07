// Crea la BD de un nuevo tenant y ejecuta el schema completo
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

async function createTenantDB(dbName, nombreNegocio, usuarioLogin, passwordHash) {
  // Conectar sin BD específica para poder crear la nueva
  const conn = await mysql.createConnection({
    host:     process.env.DB_MASTER_HOST || '127.0.0.1',
    port:     parseInt(process.env.DB_MASTER_PORT || '3308'),
    user:     process.env.DB_MASTER_USER,
    password: process.env.DB_MASTER_PASSWORD,
  })

  try {
    console.log(`[createTenantDB] Creando BD: ${dbName}`)
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await conn.query(`USE \`${dbName}\``)

    // ── SCHEMA COMPLETO (mismo que restaurante-api) ─────────────────────────
    const schema = `
      CREATE TABLE IF NOT EXISTS contadores (
        nombre VARCHAR(50) PRIMARY KEY,
        valor  INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB;

      INSERT IGNORE INTO contadores (nombre, valor) VALUES ('pedido', 0), ('venta', 0);

      CREATE TABLE IF NOT EXISTS configuracion (
        id              INT PRIMARY KEY DEFAULT 1,
        nombre_negocio  VARCHAR(100) NOT NULL DEFAULT 'Mi Restaurante',
        nit             VARCHAR(50),
        telefono        VARCHAR(30),
        ciudad          VARCHAR(80),
        direccion       VARCHAR(150),
        logo_url        VARCHAR(500),
        imprimir_auto   TINYINT(1) DEFAULT 0,
        mostrar_costos  TINYINT(1) DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS usuarios (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        nombre        VARCHAR(100) NOT NULL,
        email         VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        rol           ENUM('admin','vendedor') DEFAULT 'vendedor',
        activo        TINYINT(1) DEFAULT 1,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS categorias (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        nombre     VARCHAR(80) NOT NULL,
        orden      INT DEFAULT 0,
        activo     TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS mesas (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        nombre     VARCHAR(50) NOT NULL,
        activo     TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS vendedores (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        nombre     VARCHAR(100) NOT NULL,
        activo     TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS metodos_pago (
        id     INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(60) NOT NULL,
        tipo   ENUM('efectivo','transferencia','tarjeta','credito','otro') DEFAULT 'otro',
        activo TINYINT(1) DEFAULT 1
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS productos (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        nombre        VARCHAR(120) NOT NULL,
        descripcion   TEXT,
        categoria_id  INT,
        precio_venta  DECIMAL(12,2) NOT NULL DEFAULT 0,
        precio_costo  DECIMAL(12,2) DEFAULT 0,
        imagen_url    VARCHAR(500),
        activo        TINYINT(1) DEFAULT 1,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS pedidos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        numero          INT NOT NULL UNIQUE,
        cliente_nombre  VARCHAR(100),
        mesa_id         INT,
        vendedor_nombre VARCHAR(100),
        tipo            ENUM('mesa','domicilio','para_llevar') DEFAULT 'para_llevar',
        estado          ENUM('pendiente','en_preparacion','listo','entregado','cancelado') DEFAULT 'pendiente',
        domicilio       DECIMAL(12,2) DEFAULT 0,
        observaciones   TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS pedido_detalle (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        pedido_id        INT NOT NULL,
        producto_id      INT,
        nombre_producto  VARCHAR(120) NOT NULL,
        cantidad         INT NOT NULL DEFAULT 1,
        precio_unitario  DECIMAL(12,2) NOT NULL,
        precio_costo     DECIMAL(12,2) DEFAULT 0,
        subtotal         DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
        FOREIGN KEY (pedido_id)   REFERENCES pedidos(id)   ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS ventas (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        folio            VARCHAR(30) NOT NULL UNIQUE,
        numero           INT,
        pedido_id        INT,
        cliente_nombre   VARCHAR(100),
        vendedor_nombre  VARCHAR(100),
        total            DECIMAL(12,2) NOT NULL DEFAULT 0,
        utilidad_bruta   DECIMAL(12,2) DEFAULT 0,
        estado           ENUM('aceptada','anulada') DEFAULT 'aceptada',
        observaciones    TEXT,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS venta_metodos_pago (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        venta_id    INT NOT NULL,
        metodo_id   INT,
        metodo_nombre VARCHAR(60),
        tipo        VARCHAR(30),
        monto       DECIMAL(12,2) NOT NULL DEFAULT 0,
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS cartera (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        numero           VARCHAR(20) NOT NULL UNIQUE,
        pedido_id        INT,
        venta_id         INT,
        trabajador_nombre VARCHAR(100) NOT NULL,
        total            DECIMAL(12,2) NOT NULL DEFAULT 0,
        pagado           DECIMAL(12,2) DEFAULT 0,
        pendiente        DECIMAL(12,2) GENERATED ALWAYS AS (total - pagado) STORED,
        fecha_emision    DATE,
        fecha_vencimiento DATE,
        estado           ENUM('pendiente','pagado','parcial') DEFAULT 'pendiente',
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS cartera_pagos (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        cartera_id   INT NOT NULL,
        fecha_pago   DATE NOT NULL,
        metodo_pago  VARCHAR(60),
        referencia   VARCHAR(100),
        monto        DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cartera_id) REFERENCES cartera(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS costeos (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        nombre       VARCHAR(120) NOT NULL,
        porciones    INT DEFAULT 1,
        precio_venta DECIMAL(12,2) DEFAULT 0,
        costo_total  DECIMAL(12,2) DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS costeo_ingredientes (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        costeo_id    INT NOT NULL,
        nombre       VARCHAR(100) NOT NULL,
        cantidad     DECIMAL(10,3) DEFAULT 1,
        unidad       VARCHAR(20),
        costo_unitario DECIMAL(12,2) DEFAULT 0,
        FOREIGN KEY (costeo_id) REFERENCES costeos(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS turnos_caja (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        base_caja     DECIMAL(12,2) DEFAULT 0,
        estado        ENUM('abierto','cerrado') DEFAULT 'abierto',
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_cierre  TIMESTAMP NULL,
        total_ventas  DECIMAL(12,2) DEFAULT 0,
        total_gastos  DECIMAL(12,2) DEFAULT 0,
        efectivo_esperado DECIMAL(12,2) DEFAULT 0
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS caja_gastos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        turno_id    INT NOT NULL,
        descripcion VARCHAR(200) NOT NULL,
        monto       DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (turno_id) REFERENCES turnos_caja(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `

    // Ejecutar sentencias una por una
    const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0)
    for (const sql of statements) {
      await conn.query(sql)
    }

    // Seed inicial
    await conn.query(`INSERT IGNORE INTO configuracion (id, nombre_negocio) VALUES (1, ?)`, [nombreNegocio])
    await conn.query(`INSERT IGNORE INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')`,
      [usuarioLogin, `admin@${dbName}.local`, passwordHash])

    // Seeds de catálogos básicos
    await conn.query(`INSERT IGNORE INTO metodos_pago (nombre, tipo) VALUES ('Efectivo','efectivo'),('Transferencia','transferencia'),('Tarjeta','tarjeta')`)
    await conn.query(`INSERT IGNORE INTO categorias (nombre, orden) VALUES ('Combos',1),('Bebidas',2),('Acompañamientos',3)`)

    console.log(`[createTenantDB] ✅ BD ${dbName} creada con éxito`)
  } finally {
    await conn.end()
  }
}

module.exports = { createTenantDB }
