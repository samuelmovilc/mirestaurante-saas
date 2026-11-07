# INSTRUCCIONES ANTIGRAVITY — MiRestaurante SaaS
# Puerto: 3010 | BD: mirestaurante_saas en MariaDB puerto 3308
# ⚠️ NUNCA TOCAR: restaurante-api (puerto 3006, Amarillo Pollo en producción)

---

## PRE-REQUISITOS
- Node.js 20+ ya instalado ✓
- MariaDB corriendo en puerto 3308 ✓
- PM2 ya instalado ✓
- Código del backend subido a: /var/www/mirestaurante-saas/

---

## PASO 1 — Crear usuario y BD maestra en MariaDB (puerto 3308)

```bash
mysql -u root -p --port=3308 <<'EOF'
CREATE DATABASE IF NOT EXISTS `mirestaurante_saas`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'saas_user'@'127.0.0.1'
  IDENTIFIED BY 'SaaS_Password_2025!';

GRANT ALL PRIVILEGES ON `mirestaurante_saas`.*   TO 'saas_user'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `tenancy_%`.*             TO 'saas_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF
```

**Verificar:**
```bash
mysql -u saas_user -p'SaaS_Password_2025!' --port=3308 \
  -e "SHOW DATABASES LIKE 'mirestaurante_saas';"
```

---

## PASO 2 — Correr el schema de la BD maestra

```bash
mysql -u saas_user -p'SaaS_Password_2025!' --port=3308 mirestaurante_saas <<'EOF'
CREATE TABLE IF NOT EXISTS tenants (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  nombre_negocio        VARCHAR(150) NOT NULL,
  slug                  VARCHAR(60)  NOT NULL UNIQUE,
  db_name               VARCHAR(80)  NOT NULL UNIQUE,
  usuario_login         VARCHAR(80)  NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  correo                VARCHAR(120),
  telefono              VARCHAR(30),
  fecha_inicio_licencia DATE,
  fecha_fin_licencia    DATE,
  modulos               VARCHAR(255) DEFAULT 'pos,productos,cartera,finanzas,config',
  activo                TINYINT(1)   DEFAULT 1,
  observaciones         TEXT,
  created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug   (slug),
  INDEX idx_activo (activo)
) ENGINE=InnoDB;
EOF
```

**Verificar:**
```bash
mysql -u saas_user -p'SaaS_Password_2025!' --port=3308 mirestaurante_saas \
  -e "SHOW TABLES;"
```
Debe mostrar: `tenants`

---

## PASO 3 — Subir el backend a Contabo

```bash
# Crear carpeta
mkdir -p /var/www/mirestaurante-saas

# Subir via SFTP/SCP la carpeta backend/ al servidor como /var/www/mirestaurante-saas/
# O clonar desde GitHub:
# git clone https://github.com/TU_USUARIO/mirestaurante-saas.git /var/www/mirestaurante-saas
```

---

## PASO 4 — Instalar dependencias

```bash
cd /var/www/mirestaurante-saas
npm install --omit=dev
```

---

## PASO 5 — Crear el archivo .env

```bash
cat > /var/www/mirestaurante-saas/.env << 'EOF'
PORT=3010
DB_MASTER_HOST=127.0.0.1
DB_MASTER_PORT=3308
DB_MASTER_USER=saas_user
DB_MASTER_PASSWORD=SaaS_Password_2025!
DB_MASTER_NAME=mirestaurante_saas
JWT_SECRET=CAMBIA_ESTO_jwt_secret_muy_largo_2025
SAAS_ADMIN_SECRET=CAMBIA_ESTO_saas_admin_secret_diferente_2025
SAAS_ADMIN_HASH=PENDIENTE_VER_PASO_6
CORS_ORIGIN=https://mirestaurante.vercel.app
NODE_ENV=production
EOF
```

---

## PASO 6 — Generar el hash del password del panel admin SaaS

```bash
cd /var/www/mirestaurante-saas
node src/scripts/setupSaasAdmin.js TU_PASSWORD_ELEGIDO
```

Copiará algo como:
```
SAAS_ADMIN_HASH=$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Pegar ese hash en el .env:
```bash
# Editar .env y reemplazar PENDIENTE_VER_PASO_6 con el hash
nano /var/www/mirestaurante-saas/.env
```

---

## PASO 7 — Levantar con PM2

```bash
cd /var/www/mirestaurante-saas

pm2 start src/server.js \
  --name "mirestaurante-saas" \
  --env production

pm2 save
```

---

## PASO 8 — Verificar que arrancó correctamente

```bash
# Estado PM2
pm2 list

# Logs en tiempo real (Ctrl+C para salir)
pm2 logs mirestaurante-saas --lines 30

# Health check
curl http://localhost:3010/health
```

**Respuesta esperada:**
```json
{"success":true,"service":"mirestaurante-saas","port":3010,"status":"connected"}
```

---

## PASO 9 — Abrir puerto 3010 en el firewall

```bash
# Si usan ufw:
ufw allow 3010/tcp
ufw status

# Si usan iptables:
iptables -A INPUT -p tcp --dport 3010 -j ACCEPT
```

---

## PASO 10 — Verificar acceso externo

```bash
curl http://89.117.56.39:3010/health
```

Debe responder igual que el paso 8.

---

## PASO 11 — Verificar que Amarillo Pollo sigue intacto

```bash
pm2 list
curl http://localhost:3006/health
```

El proceso `restaurante-api` en puerto 3006 debe seguir con estado `online`.

---

## VERIFICACIÓN FINAL

```bash
# Los dos servicios deben estar ONLINE:
pm2 list | grep -E "restaurante-api|mirestaurante-saas"

# Ambos health checks deben responder:
curl http://localhost:3006/health
curl http://localhost:3010/health

# BD maestra existe:
mysql -u saas_user -p'SaaS_Password_2025!' --port=3308 \
  -e "SELECT COUNT(*) FROM mirestaurante_saas.tenants;"
```

---

## ROLLBACK (si algo sale mal)

```bash
# Solo detener el nuevo servicio — Amarillo Pollo no se toca
pm2 stop mirestaurante-saas
pm2 delete mirestaurante-saas

# Eliminar BD maestra si se quiere empezar de cero
# mysql -u root -p --port=3308 -e "DROP DATABASE IF EXISTS mirestaurante_saas;"
```

---

## NOTAS IMPORTANTES

- El password `SaaS_Password_2025!` en estos comandos es de EJEMPLO.
  Usa uno seguro y actualiza el .env
- `GRANT ALL PRIVILEGES ON tenancy_%.*` permite que `saas_user`
  cree y gestione TODAS las BDs futuras de tenants automáticamente
- Cada nuevo restaurante que se registre desde el panel SaaS
  crea su propia BD `tenancy_xxx` automáticamente desde el backend
