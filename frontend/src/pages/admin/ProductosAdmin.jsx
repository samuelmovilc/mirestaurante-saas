import { useState, useEffect } from 'react'
import { api, fmt } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

const EMPTY = { nombre: '', descripcion: '', precio_venta: '', precio_costo: '', categoria_id: '', imagen_url: '', visible_formulario: 1, activo: 1 }

export default function ProductosAdmin() {
  const { toast, ToastContainer } = useToast()
  const [productos, setProductos]   = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [editId, setEditId]         = useState(null)
  const [guardando, setGuardando]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [subiendoImg, setSubiendoImg] = useState(false)

  async function cargar() {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([api.getProductos(), api.getCategorias()])
      setProductos(p.data || [])
      setCategorias(c.data || [])
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  function abrirNuevo() { setForm(EMPTY); setEditId(null); setModal(true) }
  function abrirEditar(p) {
    setForm({ nombre: p.nombre, descripcion: p.descripcion || '', precio_venta: p.precio_venta, precio_costo: p.precio_costo, categoria_id: p.categoria_id || '', imagen_url: p.imagen_url || '', visible_formulario: p.visible_formulario, activo: p.activo })
    setEditId(p.id)
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre || !form.precio_venta) return toast('Nombre y precio de venta son requeridos', 'error')
    setGuardando(true)
    try {
      const payload = { ...form, precio_venta: parseFloat(form.precio_venta), precio_costo: parseFloat(form.precio_costo || 0), categoria_id: form.categoria_id || null }
      if (editId) await api.updateProducto(editId, payload)
      else        await api.createProducto(payload)
      toast(editId ? 'Producto actualizado' : 'Producto creado')
      setModal(false)
      cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setSubiendoImg(true)
    try {
      const res = await api.uploadImage(file)
      setForm(f => ({ ...f, imagen_url: res.data.url }))
      toast('Imagen subida correctamente')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubiendoImg(false)
      e.target.value = ''
    }
  }

  async function eliminar(id, nombre) {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    try { const r = await api.deleteProducto(id); toast(r?.data?.desactivado ? 'Tiene ventas asociadas: se desactivó en lugar de borrarse' : 'Producto eliminado'); cargar() }
    catch (e) { toast(e.message, 'error') }
  }

  const ENCABEZADO = ['Nombre', 'Categoría', 'Descripción', 'Precio Venta', 'Precio Costo', 'Visible (Si/No)', 'Estado (Activo/Inactivo)']

  async function descargarPlantilla() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ENCABEZADO,
      ['Combo Ejemplo', 'Combos', 'Descripción del producto', 24000, 10000, 'Si', 'Activo'],
      ['Cappuccino', 'Cafetería', 'Espresso con leche vaporizada', 8900, 4000, 'Si', 'Activo'],
    ])
    ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 42 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 24 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla_productos.xlsx')
  }

  // Parser CSV que respeta campos entre comillas. Acepta coma o punto y coma (Excel en español guarda con ";").
  function parseCSVLine(line, sep) {
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === sep && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += c }
    }
    cols.push(cur.trim())
    return cols
  }

  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  // "24000", "24.000", "$ 24,000" -> 24000 ; "8900.50" -> 8900.5
  function parsePrecio(v) {
    let t = String(v || '').replace(/[^0-9.,]/g, '')
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '')
    else t = t.replace(',', '.')
    const n = parseFloat(t)
    return Number.isFinite(n) ? n : 0
  }

  // Lee el archivo (Excel o CSV) y devuelve las filas como arreglos de texto.
  async function leerFilas(file) {
    if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
        .map(r => r.map(c => (c === null || c === undefined) ? '' : String(c).trim()))
        .filter(r => r.some(c => c !== ''))
    }
    const texto = (await file.text()).replace(/^\uFEFF/, '')
    const lines = texto.split(/\r?\n/).filter(l => l.trim())
    const sep = (lines[0]?.match(/;/g) || []).length > (lines[0]?.match(/,/g) || []).length ? ';' : ','
    return lines.map(l => parseCSVLine(l, sep))
  }

  async function importarArchivo(e) {
    const file = e.target.files[0]; e.target.value = ''
    if (!file) return
    try {
      const filas = await leerFilas(file)
      if (filas.length < 2) return toast('Archivo vacío', 'error')
      // Categorías existentes; las que no existan se crean con el nombre del archivo.
      const cats = {}
      ;((await api.getCategorias()).data || []).forEach(c => { cats[norm(c.nombre)] = c.id })
      let importados = 0; const errores = []
      for (let i = 1; i < filas.length; i++) {
        const cols = filas[i]
        const nombre = cols[0]
        const precio = parsePrecio(cols[3])
        if (!nombre || !precio) { errores.push(`Fila ${i + 1}: falta nombre o precio`); continue }
        try {
          let categoria_id = null
          const catNom = (cols[1] || '').trim()
          if (catNom) {
            if (!cats[norm(catNom)]) { const r = await api.createCategoria({ nombre: catNom, activo: 1 }); cats[norm(catNom)] = r.data.id }
            categoria_id = cats[norm(catNom)]
          }
          const visible = /^(no|0|false)$/i.test(norm(cols[5])) ? 0 : 1
          const inactivo = /^inactiv/i.test(norm(cols[6]))
          const data = { nombre, descripcion: cols[2] || null, categoria_id, precio_venta: precio, precio_costo: parsePrecio(cols[4]), imagen_url: null, visible_formulario: visible }
          const r = await api.createProducto(data)
          if (inactivo) await api.updateProducto(r.data.id, { ...data, activo: 0 })
          importados++
        } catch (err) { errores.push(`Fila ${i + 1} (${nombre}): ${err.message}`) }
      }
      setImportResult({ importados, errores })
      toast(`${importados} productos importados${errores.length ? ` · ${errores.length} con error` : ''}`, errores.length ? 'error' : undefined)
      cargar()
    } catch (err) { toast('No se pudo leer el archivo: ' + err.message, 'error') }
  }

  return (
    <div>
      <ToastContainer />
      <div className="page-header">
        <div><h2>Productos</h2><p>Catálogo del menú.</p></div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={descargarPlantilla}>Descargar plantilla Excel</button>
          <button className="btn btn-dark" onClick={() => document.getElementById('csvImport').click()}>Carga masiva (Excel)</button>
          <input type="file" id="csvImport" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={importarArchivo} />
          <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo producto</button>
        </div>
      </div>

      {importResult && (
        <div style={{ background: 'var(--vd-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--vd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ {importResult.importados} producto(s) importados{importResult.errores?.length ? ` · ${importResult.errores.length} con error` : ''}</span>
          <button style={{ background: 'none', border: 'none', color: 'var(--vd)', cursor: 'pointer', fontSize: 16 }} onClick={() => setImportResult(null)}>×</button>
        </div>
      )}
      {importResult?.errores?.length > 0 && (
        <div style={{ border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--rd, #ef4444)' }}>
          {importResult.errores.slice(0, 10).map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Catálogo activo</h3></div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="table-wrap">
            <table className="tbl-prod">
              <thead>
                <tr><th>Imagen</th><th>Producto</th><th>Categoría</th><th>Precio venta</th><th>Precio costo</th><th>Descripción</th><th>Visible</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {productos.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }} />
                        : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{p.categoria_icono || '🍽️'}</div>
                      }
                    </td>
                    <td><strong>{p.nombre}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.categoria_nombre || '—'}</td>
                    <td><strong style={{ color: 'var(--primary)' }}>{fmt(p.precio_venta)}</strong></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{fmt(p.precio_costo)}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion || '—'}</td>
                    <td><span className={`badge ${p.visible_formulario ? 'badge-green' : 'badge-gray'}`}>{p.visible_formulario ? 'Sí' : 'No'}</span></td>
                    <td><span className={`badge ${p.activo ? 'badge-green' : 'badge-red'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => abrirEditar(p)}>Editar</button>
                        <button className="btn btn-danger btn-xs" onClick={() => eliminar(p.id, p.nombre)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!productos.length && <tr><td colSpan="9" style={{ textAlign: 'center', padding: 28, color: 'var(--text3)' }}>Sin productos</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <h3>{editId ? 'Editar producto' : 'Nuevo producto'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="label">Nombre del producto *</label>
                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Combo 1/4 de Pollo" />
              </div>
              <div className="form-group">
                <label className="label">Categoría</label>
                <select className="select" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                  <option value="">Sin categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Descripción</label>
                <input className="input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción breve" />
              </div>
              <div className="form-group">
                <label className="label">Precio de venta *</label>
                <input className="input" type="number" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))} placeholder="24000" />
              </div>
              <div className="form-group">
                <label className="label">Precio de costo</label>
                <input className="input" type="number" value={form.precio_costo} onChange={e => setForm(f => ({ ...f, precio_costo: e.target.value }))} placeholder="12000" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="label">Imagen del producto</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input type="file" accept="image/*" onChange={handleImageUpload} disabled={subiendoImg} className="input" style={{ padding: '4px' }} />
                  {subiendoImg && <span style={{ fontSize: 12, color: 'var(--primary)' }}>Subiendo...</span>}
                </div>
                <input className="input" value={form.imagen_url} onChange={e => setForm(f => ({ ...f, imagen_url: e.target.value }))} placeholder="O si prefieres, pega una URL (https://...)" />
                {form.imagen_url && <img src={form.imagen_url} alt="" style={{ marginTop: 8, height: 80, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)' }} />}
              </div>
              <div className="form-group">
                <label className="label">Estado</label>
                <select className="select" value={form.activo} onChange={e => setForm(f => ({ ...f, activo: parseInt(e.target.value) }))}>
                  <option value={1}>Activo</option>
                  <option value={0}>Inactivo</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Visible en formulario</label>
                <select className="select" value={form.visible_formulario} onChange={e => setForm(f => ({ ...f, visible_formulario: parseInt(e.target.value) }))}>
                  <option value={1}>Sí</option>
                  <option value={0}>No</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar producto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
