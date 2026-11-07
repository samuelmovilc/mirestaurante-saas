import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

function useList(getAll) {
  const [data, setData] = useState([])
  const reload = () => getAll().then(r => setData(r.data || [])).catch(() => {})
  useEffect(() => { reload() }, [])
  return [data, reload]
}

export default function ConfigAdmin() {
  const { toast, ToastContainer } = useToast()

  // Config
  const [cfg, setCfg]         = useState({ nombre_negocio: '', nit: '', telefono: '', ciudad: '', direccion: '', slogan: '' })
  const [logoUrl, setLogoUrl] = useState('')
  const [logoInput, setLogoInput] = useState('')
  const [saving, setSaving]   = useState(false)

  // Mesas
  const [mesas, reloadMesas]       = useList(api.getMesas)
  const [mesaModal, setMesaModal]  = useState(false)
  const [mesaForm, setMesaForm]    = useState({ nombre: '', activa: 1 })
  const [mesaEditId, setMesaEditId]= useState(null)

  // Categorías
  const [cats, reloadCats]         = useList(api.getCategorias)
  const [catModal, setCatModal]    = useState(false)
  const [catForm, setCatForm]      = useState({ nombre: '', icono: '', activa: 1 })
  const [catEditId, setCatEditId]  = useState(null)

  // Vendedores
  const [vends, reloadVends]       = useList(api.getVendedores)
  const [vendModal, setVendModal]  = useState(false)
  const [vendForm, setVendForm]    = useState({ nombre: '', rol: 'Vendedor', activo: 1 })
  const [vendEditId, setVendEditId]= useState(null)

  // Métodos de pago
  const [mps, reloadMps]           = useList(api.getMetodosPago)
  const [mpModal, setMpModal]      = useState(false)
  const [mpForm, setMpForm]        = useState({ nombre: '', tipo: 'efectivo', icono: '💳' })

  // Carga masiva
  const [importResult, setImportResult] = useState(null)

  useEffect(() => {
    api.getConfig().then(r => {
      const d = r.data || {}
      setCfg({ nombre_negocio: d.nombre_negocio || '', nit: d.nit || '', telefono: d.telefono || '', ciudad: d.ciudad || '', direccion: d.direccion || '', slogan: d.slogan || '' })
      setLogoUrl(d.logo_url || '')
    }).catch(() => {})
  }, [])

  async function guardarConfig() {
    setSaving(true)
    try {
      await api.updateConfig(cfg)
      toast('Configuración guardada')
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function guardarLogo() {
    if (!logoInput.trim()) return toast('Ingresa la URL del logo', 'error')
    try { await api.updateLogo(logoInput); setLogoUrl(logoInput); toast('Logo actualizado') }
    catch (e) { toast(e.message, 'error') }
  }

  async function quitarLogo() {
    try { await api.deleteLogo(); setLogoUrl(''); setLogoInput(''); toast('Logo eliminado') }
    catch (e) { toast(e.message, 'error') }
  }

  // MESAS
  function abrirMesa(m = null) { setMesaEditId(m?.id || null); setMesaForm(m ? { nombre: m.nombre, activa: m.activa } : { nombre: '', activa: 1 }); setMesaModal(true) }
  async function guardarMesa() {
    if (!mesaForm.nombre) return toast('Nombre requerido', 'error')
    try {
      if (mesaEditId) await api.updateMesa(mesaEditId, mesaForm)
      else            await api.createMesa(mesaForm)
      setMesaModal(false); reloadMesas(); toast('Mesa guardada')
    } catch (e) { toast(e.message, 'error') }
  }
  async function eliminarMesa(id) {
    if (!confirm('¿Eliminar esta mesa?')) return
    try { await api.deleteMesa(id); reloadMesas(); toast('Mesa eliminada') }
    catch (e) { toast(e.message, 'error') }
  }

  // CATEGORÍAS
  function abrirCat(c = null) { setCatEditId(c?.id || null); setCatForm(c ? { nombre: c.nombre, icono: c.icono, activa: c.activa } : { nombre: '', icono: '', activa: 1 }); setCatModal(true) }
  async function guardarCat() {
    if (!catForm.nombre) return toast('Nombre requerido', 'error')
    try {
      if (catEditId) await api.updateCategoria(catEditId, catForm)
      else           await api.createCategoria({ ...catForm, icono: catForm.icono || '🍽️' })
      setCatModal(false); reloadCats(); toast('Categoría guardada')
    } catch (e) { toast(e.message, 'error') }
  }
  async function eliminarCat(id) {
    if (!confirm('¿Eliminar esta categoría?')) return
    try { await api.deleteCategoria(id); reloadCats(); toast('Eliminada') }
    catch (e) { toast(e.message, 'error') }
  }

  // VENDEDORES
  function abrirVend(v = null) { setVendEditId(v?.id || null); setVendForm(v ? { nombre: v.nombre, rol: v.rol, activo: v.activo } : { nombre: '', rol: 'Vendedor', activo: 1 }); setVendModal(true) }
  async function guardarVend() {
    if (!vendForm.nombre) return toast('Nombre requerido', 'error')
    try {
      if (vendEditId) await api.updateVendedor(vendEditId, vendForm)
      else            await api.createVendedor(vendForm)
      setVendModal(false); reloadVends(); toast('Vendedor guardado')
    } catch (e) { toast(e.message, 'error') }
  }
  async function eliminarVend(id) {
    if (!confirm('¿Eliminar?')) return
    try { await api.deleteVendedor(id); reloadVends(); toast('Eliminado') }
    catch (e) { toast(e.message, 'error') }
  }

  // MÉTODOS DE PAGO
  async function guardarMP() {
    if (!mpForm.nombre) return toast('Nombre requerido', 'error')
    try { await api.createMetodoPago(mpForm); setMpModal(false); reloadMps(); toast('Método de pago agregado') }
    catch (e) { toast(e.message, 'error') }
  }
  async function eliminarMP(id) {
    if (!confirm('¿Eliminar?')) return
    try { await api.deleteMetodoPago(id); reloadMps(); toast('Eliminado') }
    catch (e) { toast(e.message, 'error') }
  }

  // CARGA MASIVA
  function importarCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const lines = ev.target.result.split('\n').filter(l => l.trim())
      if (lines.length < 2) return toast('Archivo vacío', 'error')
      const items = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        if (cols.length < 4) continue
        items.push({ nombre: cols[0], categoria_nombre: cols[1], descripcion: cols[2], precio_venta: cols[3], precio_costo: cols[4] || '0', visible_formulario: cols[5], estado: cols[6] })
      }
      try {
        const res = await api.importProductos(items)
        setImportResult(res.data)
        toast(`${res.data.importados} productos importados`)
      } catch (err) { toast(err.message, 'error') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function descargarPlantilla() {
    const csv = 'Nombre,Categoría,Descripción,Precio Venta,Precio Costo,Visible (Si/No),Estado (Activo/Inactivo)\nCombo Ejemplo,Combos,Descripción,24000,10000,Si,Activo\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plantilla_productos.csv'; a.click()
  }

  return (
    <div>
      <ToastContainer />
      <div className="page-header">
        <div><h2>Configuración</h2></div>
        <button className="btn btn-primary" onClick={guardarConfig} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* COLUMNA IZQUIERDA */}
        <div>
          {/* DATOS NEGOCIO */}
          <div className="card">
            <div className="card-header"><h3>Datos del negocio</h3></div>
            <div className="card-body">
              {/* LOGO */}
              <div className="logo-area">
                <div className="logo-preview">
                  {logoUrl ? <img src={logoUrl} alt="logo" /> : '🍗'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Logo del negocio</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>URL directa (Cloudinary, etc.)</div>
                  <input className="input" style={{ fontSize: 12, marginBottom: 6 }} placeholder="https://..." value={logoInput} onChange={e => setLogoInput(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={guardarLogo}>Guardar logo</button>
                    {logoUrl && <button className="btn btn-danger btn-xs" onClick={quitarLogo}>Quitar</button>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['nombre_negocio','Nombre del negocio'],['nit','NIT / Documento'],['telefono','Teléfono'],['ciudad','Ciudad']].map(([k, l]) => (
                  <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="label">{l}</label>
                    <input className="input" value={cfg[k]} onChange={e => setCfg(c => ({ ...c, [k]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
                  <label className="label">Dirección</label>
                  <input className="input" value={cfg.direccion} onChange={e => setCfg(c => ({ ...c, direccion: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1', marginBottom: 0 }}>
                  <label className="label">Eslogan</label>
                  <input className="input" value={cfg.slogan} onChange={e => setCfg(c => ({ ...c, slogan: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* MESAS */}
          <div className="card">
            <div className="card-header"><div><h3>Mesas</h3><p>Visibles en el formulario de pedidos.</p></div><button className="btn btn-primary btn-sm" onClick={() => abrirMesa()}>+ Agregar</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {mesas.map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.nombre}</strong></td>
                      <td><span className={`badge ${m.activa ? 'badge-green' : 'badge-red'}`}>{m.activa ? 'Activa' : 'Inactiva'}</span></td>
                      <td><div style={{ display: 'flex', gap: 4 }}><button className="btn btn-ghost btn-xs" onClick={() => abrirMesa(m)}>Editar</button><button className="btn btn-danger btn-xs" onClick={() => eliminarMesa(m.id)}>Eliminar</button></div></td>
                    </tr>
                  ))}
                  {!mesas.length && <tr><td colSpan="3" style={{ textAlign: 'center', padding: 16, color: 'var(--text3)', fontSize: 12 }}>Sin mesas</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* MÉTODOS DE PAGO */}
          <div className="card">
            <div className="card-header"><div><h3>Métodos de pago</h3></div><button className="btn btn-primary btn-sm" onClick={() => { setMpForm({ nombre: '', tipo: 'efectivo', icono: '💳' }); setMpModal(true) }}>+ Agregar</button></div>
            <div className="card-body">
              {mps.map(m => (
                <div key={m.id} className="mp-cfg-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{m.icono}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{m.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{{ efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta',credito:'Crédito → va a Cartera' }[m.tipo]}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`badge ${m.activo ? 'badge-green' : 'badge-gray'}`}>{m.activo ? 'Activo' : 'Inactivo'}</span>
                    <button className="btn btn-danger btn-xs" onClick={() => eliminarMP(m.id)}>Eliminar</button>
                  </div>
                </div>
              ))}
              {!mps.length && <div style={{ textAlign: 'center', padding: 16, color: 'var(--text3)', fontSize: 12 }}>Sin métodos de pago</div>}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div>
          {/* VENDEDORES */}
          <div className="card">
            <div className="card-header"><div><h3>Vendedores</h3><p>Usuarios que toman pedidos.</p></div><button className="btn btn-primary btn-sm" onClick={() => abrirVend()}>+ Agregar</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {vends.map(v => (
                    <tr key={v.id}>
                      <td><strong>{v.nombre}</strong></td>
                      <td style={{ color: 'var(--text3)', fontSize: 12 }}>{v.rol}</td>
                      <td><span className={`badge ${v.activo ? 'badge-green' : 'badge-red'}`}>{v.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td><div style={{ display: 'flex', gap: 4 }}><button className="btn btn-ghost btn-xs" onClick={() => abrirVend(v)}>Editar</button><button className="btn btn-danger btn-xs" onClick={() => eliminarVend(v.id)}>Eliminar</button></div></td>
                    </tr>
                  ))}
                  {!vends.length && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 16, color: 'var(--text3)', fontSize: 12 }}>Sin vendedores</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* CATEGORÍAS */}
          <div className="card">
            <div className="card-header"><div><h3>Categorías</h3></div><button className="btn btn-primary btn-sm" onClick={() => abrirCat()}>+ Agregar</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Icono</th><th>Nombre</th><th>Acciones</th></tr></thead>
                <tbody>
                  {cats.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize: 20 }}>{c.icono}</td>
                      <td><strong>{c.nombre}</strong></td>
                      <td><div style={{ display: 'flex', gap: 4 }}><button className="btn btn-ghost btn-xs" onClick={() => abrirCat(c)}>Editar</button><button className="btn btn-danger btn-xs" onClick={() => eliminarCat(c.id)}>Eliminar</button></div></td>
                    </tr>
                  ))}
                  {!cats.length && <tr><td colSpan="3" style={{ textAlign: 'center', padding: 16, color: 'var(--text3)', fontSize: 12 }}>Sin categorías</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARGA MASIVA */}
          <div className="card">
            <div className="card-header"><div><h3>Carga masiva de productos</h3><p>Importa desde archivo CSV.</p></div></div>
            <div className="card-body">
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                Columnas: <strong style={{ color: 'var(--text)' }}>Nombre, Categoría, Descripción, Precio Venta, Precio Costo, Visible (Si/No), Estado</strong>
              </div>
              <div className="upload-box" onClick={() => document.getElementById('csvConfig').click()}>
                <div style={{ fontSize: 28 }}>📂</div>
                <p>Haz clic para subir archivo CSV</p>
                <span>O arrastra y suelta aquí</span>
              </div>
              <input type="file" id="csvConfig" accept=".csv" style={{ display: 'none' }} onChange={importarCSV} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={descargarPlantilla}>Descargar plantilla</button>
                <button className="btn btn-dark btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => document.getElementById('csvConfig').click()}>Importar CSV</button>
              </div>
              {importResult && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--vd-dim)', borderRadius: 7, border: '1px solid rgba(34,197,94,0.2)', fontSize: 13, color: 'var(--vd)' }}>
                  ✓ {importResult.importados} producto(s) importados{importResult.errores?.length ? ` · ${importResult.errores.length} con errores` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODALES */}
      {mesaModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMesaModal(false)}>
          <div className="modal-box" style={{ maxWidth: 360 }}>
            <h3>{mesaEditId ? 'Editar mesa' : 'Nueva mesa'}</h3>
            <div className="form-group"><label className="label">Nombre</label><input className="input" value={mesaForm.nombre} onChange={e => setMesaForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Mesa 5, Terraza, Barra VIP" autoFocus /></div>
            <div className="form-group"><label className="label">Estado</label><select className="select" value={mesaForm.activa} onChange={e => setMesaForm(f => ({ ...f, activa: parseInt(e.target.value) }))}><option value={1}>Activa</option><option value={0}>Inactiva</option></select></div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setMesaModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarMesa}>Guardar</button></div>
          </div>
        </div>
      )}

      {catModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCatModal(false)}>
          <div className="modal-box" style={{ maxWidth: 360 }}>
            <h3>{catEditId ? 'Editar categoría' : 'Nueva categoría'}</h3>
            <div className="form-group"><label className="label">Nombre</label><input className="input" value={catForm.nombre} onChange={e => setCatForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Ensaladas" autoFocus /></div>
            <div className="form-group"><label className="label">Icono (emoji)</label><input className="input" value={catForm.icono} onChange={e => setCatForm(f => ({ ...f, icono: e.target.value }))} placeholder="🥗" maxLength={4} /></div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setCatModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarCat}>Guardar</button></div>
          </div>
        </div>
      )}

      {vendModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setVendModal(false)}>
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <h3>{vendEditId ? 'Editar vendedor' : 'Nuevo vendedor'}</h3>
            <div className="form-group"><label className="label">Nombre completo</label><input className="input" value={vendForm.nombre} onChange={e => setVendForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Laura Gómez" autoFocus /></div>
            <div className="form-group"><label className="label">Rol</label><select className="select" value={vendForm.rol} onChange={e => setVendForm(f => ({ ...f, rol: e.target.value }))}><option value="Administrador">Administrador</option><option value="Vendedor">Vendedor</option><option value="Mesero">Mesero</option></select></div>
            <div className="form-group"><label className="label">Estado</label><select className="select" value={vendForm.activo} onChange={e => setVendForm(f => ({ ...f, activo: parseInt(e.target.value) }))}><option value={1}>Activo</option><option value={0}>Inactivo</option></select></div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setVendModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarVend}>Guardar</button></div>
          </div>
        </div>
      )}

      {mpModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMpModal(false)}>
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <h3>Nuevo método de pago</h3>
            <div className="form-group"><label className="label">Nombre</label><input className="input" value={mpForm.nombre} onChange={e => setMpForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Nequi, Crédito quincena" autoFocus /></div>
            <div className="form-group"><label className="label">Tipo</label><select className="select" value={mpForm.tipo} onChange={e => setMpForm(f => ({ ...f, tipo: e.target.value }))}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="credito">Crédito — va a Cartera</option></select></div>
            <div className="form-group"><label className="label">Icono (emoji)</label><input className="input" value={mpForm.icono} onChange={e => setMpForm(f => ({ ...f, icono: e.target.value }))} placeholder="💳" maxLength={4} /></div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setMpModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarMP}>Guardar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
