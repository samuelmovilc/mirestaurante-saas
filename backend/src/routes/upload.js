// Subida de imágenes de productos (sin dependencias externas).
// El frontend reduce la foto y la envía como data URL en JSON; aquí se valida que sea una
// imagen real (por sus primeros bytes, no por lo que diga el cliente) y se guarda en disco,
// separada por restaurante: <UPLOAD_DIR>/<slug>/<nombre-aleatorio>.<ext>
const express = require('express')
const crypto  = require('crypto')
const fs      = require('fs')
const path    = require('path')
const { authMiddleware, soloAdmin } = require('../middleware/auth')

const router = express.Router()

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads')
const MAX_BYTES  = 3.5 * 1024 * 1024

// Formato por firma de archivo. SVG se rechaza a propósito (puede contener scripts).
function detectar(buf) {
  if (buf.length > 12 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg'
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png'
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  if (buf.length > 12 && /^GIF8[79]a/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif'
  return null
}

router.post('/', authMiddleware, soloAdmin, async (req, res) => {
  try {
    const slug = String(req.tenant?.slug || '')
    if (!/^[a-z0-9_-]{1,60}$/.test(slug)) {
      return res.status(400).json({ success: false, error: { message: 'Restaurante inválido' } })
    }

    const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(String(req.body?.imagen || ''))
    if (!m) return res.status(400).json({ success: false, error: { message: 'Imagen no recibida o en formato inválido' } })

    const buf = Buffer.from(m[1], 'base64')
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({ success: false, error: { message: 'La imagen es demasiado pesada (máx 3.5 MB)' } })
    }

    const ext = detectar(buf)
    if (!ext) return res.status(400).json({ success: false, error: { message: 'El archivo no es una imagen válida (JPG, PNG, WEBP o GIF)' } })

    const dir = path.join(UPLOAD_DIR, slug)
    await fs.promises.mkdir(dir, { recursive: true })
    const nombre = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`
    await fs.promises.writeFile(path.join(dir, nombre), buf)

    res.status(201).json({ success: true, data: { url: `/api/uploads/${slug}/${nombre}` } })
  } catch (err) { res.status(500).json({ success: false, error: { message: err.message } }) }
})

module.exports = { router, UPLOAD_DIR }
