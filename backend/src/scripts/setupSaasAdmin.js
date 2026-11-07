// Genera el hash bcrypt del password del superadmin SaaS
// y lo muestra para pegarlo en el .env como SAAS_ADMIN_HASH
// Uso: node src/scripts/setupSaasAdmin.js MiPasswordAqui
require('dotenv').config()
const bcrypt = require('bcryptjs')

const password = process.argv[2]
if (!password) {
  console.error('Uso: node src/scripts/setupSaasAdmin.js <password>')
  process.exit(1)
}

bcrypt.hash(password, 10).then(hash => {
  console.log('\n✅ Hash generado. Agrega esta línea a tu .env:\n')
  console.log(`SAAS_ADMIN_HASH=${hash}\n`)
})
