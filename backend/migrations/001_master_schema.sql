-- ============================================================
-- MiRestaurante SaaS — BD Maestra
-- Ejecutar en: mirestaurante_saas
-- ============================================================

CREATE DATABASE IF NOT EXISTS `mirestaurante_saas`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `mirestaurante_saas`;

CREATE TABLE IF NOT EXISTS tenants (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  nombre_negocio        VARCHAR(150) NOT NULL,
  slug                  VARCHAR(60)  NOT NULL UNIQUE,       -- identificador URL: "labrasa"
  db_name               VARCHAR(80)  NOT NULL UNIQUE,       -- "tenancy_labrasa"
  usuario_login         VARCHAR(80)  NOT NULL,              -- nombre usuario admin del tenant
  password_hash         VARCHAR(255) NOT NULL,              -- bcrypt
  correo                VARCHAR(120),
  telefono              VARCHAR(30),
  fecha_inicio_licencia DATE,
  fecha_fin_licencia    DATE,                               -- NULL = ilimitada
  modulos               VARCHAR(255) DEFAULT 'pos,productos,cartera,finanzas,config',
  activo                TINYINT(1)  DEFAULT 1,
  observaciones         TEXT,
  created_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug   (slug),
  INDEX idx_activo (activo)
) ENGINE=InnoDB;
