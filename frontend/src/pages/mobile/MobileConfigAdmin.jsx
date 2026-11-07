import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import MobileTopBar from '../../components/mobile/MobileTopBar'

function useList(getAll) {
  const [data, setData] = useState([])
  const reload = () => getAll().then(r => setData(r.data || [])).catch(() => {})
  useEffect(() => { reload() }, [])
  return [data, reload]
}

export default function MobileConfigAdmin() {
  const { toast, ToastContainer } = useToast()

  // General Config
  const [cfg, setCfg] = useState({ nombre_negocio: '', nit: '', telefono: '', ciudad: '', direccion: '', slogan: '' })
  const [logoUrl, setLogoUrl] = useState('')
  const [logoInput, setLogoInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Sub-sections
  const [activeSection, setActiveSection] = useState(null) // 'general', 'mesas', 'cats', 'vends', 'mps', 'form_mesa', 'form_cat', 'form_vend', 'form_mp'

  // Data
  const [mesas, reloadMesas] = useList(api.getMesas)
  const [cats, reloadCats]   = useList(api.getCategorias)
  const [vends, reloadVends] = useList(api.getVendedores)
  const [mps, reloadMps]     = useList(api.getMetodosPago)

  // Form states
  const [mesaForm, setMesaForm]    = useState({ nombre: '', activa: 1 })
  const [mesaEditId, setMesaEditId]= useState(null)
  
  const [catForm, setCatForm]      = useState({ nombre: '', icono: '', activa: 1 })
  const [catEditId, setCatEditId]  = useState(null)

  const [vendForm, setVendForm]    = useState({ nombre: '', rol: 'Vendedor', activo: 1 })
  const [vendEditId, setVendEditId]= useState(null)

  const [mpForm, setMpForm]        = useState({ nombre: '', tipo: 'efectivo', icono: '💳' })
  const [mpEditId, setMpEditId]    = useState(null) // mp is not fully updatable by desktop UI but we can recreate the same create logic

  useEffect(() => {
    api.getConfig().then(r => {
      const d = r.data || {}
      setCfg({ nombre_negocio: d.nombre_negocio || '', nit: d.nit || '', telefono: d.telefono || '', ciudad: d.ciudad || '', direccion: d.direccion || '', slogan: d.slogan || '' })
      setLogoUrl(d.logo_url || '')
    }).catch(() => {})
  }, [])

  // ==== LOGO ====
  async function guardarLogo() {
    if (!logoInput.trim()) return toast('Ingresa la URL del logo', 'error')
    try { await api.updateLogo(logoInput); setLogoUrl(logoInput); toast('Logo actualizado') }
    catch (e) { toast(e.message, 'error') }
  }
  async function quitarLogo() {
    try { await api.deleteLogo(); setLogoUrl(''); setLogoInput(''); toast('Logo eliminado') }
    catch (e) { toast(e.message, 'error') }
  }

  // ==== CONFIG ====
  async function guardarConfig() {
    setSaving(true)
    try {
      await api.updateConfig(cfg)
      toast('Configuración guardada', 'success')
      setActiveSection(null)
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  // ==== MESAS ====
  function abrirMesa(m = null) { setMesaEditId(m?.id || null); setMesaForm(m ? { nombre: m.nombre, activa: m.activa } : { nombre: '', activa: 1 }); setActiveSection('form_mesa') }
  async function guardarMesa() {
    if (!mesaForm.nombre) return toast('Nombre requerido', 'error')
    try {
      if (mesaEditId) await api.updateMesa(mesaEditId, mesaForm)
      else            await api.createMesa(mesaForm)
      setActiveSection('mesas'); reloadMesas(); toast('Mesa guardada')
    } catch (e) { toast(e.message, 'error') }
  }

  // ==== CATEGORIAS ====
  function abrirCat(c = null) { setCatEditId(c?.id || null); setCatForm(c ? { nombre: c.nombre, icono: c.icono, activa: c.activa } : { nombre: '', icono: '', activa: 1 }); setActiveSection('form_cat') }
  async function guardarCat() {
    if (!catForm.nombre) return toast('Nombre requerido', 'error')
    try {
      if (catEditId) await api.updateCategoria(catEditId, catForm)
      else           await api.createCategoria({ ...catForm, icono: catForm.icono || '🍽️' })
      setActiveSection('cats'); reloadCats(); toast('Categoría guardada')
    } catch (e) { toast(e.message, 'error') }
  }

  // ==== VENDEDORES ====
  function abrirVend(v = null) { setVendEditId(v?.id || null); setVendForm(v ? { nombre: v.nombre, rol: v.rol, activo: v.activo } : { nombre: '', rol: 'Vendedor', activo: 1 }); setActiveSection('form_vend') }
  async function guardarVend() {
    if (!vendForm.nombre) return toast('Nombre requerido', 'error')
    try {
      if (vendEditId) await api.updateVendedor(vendEditId, vendForm)
      else            await api.createVendedor(vendForm)
      setActiveSection('vends'); reloadVends(); toast('Vendedor guardado')
    } catch (e) { toast(e.message, 'error') }
  }

  // ==== METODOS PAGO ====
  function abrirMp() { setMpForm({ nombre: '', tipo: 'efectivo', icono: '💳' }); setActiveSection('form_mp') }
  async function guardarMp() {
    if (!mpForm.nombre) return toast('Nombre requerido', 'error')
    try { await api.createMetodoPago(mpForm); setActiveSection('mps'); reloadMps(); toast('Método agregado') }
    catch (e) { toast(e.message, 'error') }
  }

  // ==== DELETE HELPERS ====
  async function del(type, id, reloadFunc) {
    if (!window.confirm('¿Eliminar este elemento?')) return
    try {
      if (type === 'mesa') await api.deleteMesa(id)
      if (type === 'cat') await api.deleteCategoria(id)
      if (type === 'vend') await api.deleteVendedor(id)
      if (type === 'mp') await api.deleteMetodoPago(id)
      reloadFunc()
      toast('Eliminado correctamente', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const sections = [
    { id: 'general', title: 'Ajustes Generales', icon: '⚙️', desc: 'Nombre, Logo, NIT, etc' },
    { id: 'mesas', title: 'Mesas / Zonas', icon: '🪑', desc: `${mesas.length} mesas activas` },
    { id: 'cats', title: 'Categorías', icon: '📋', desc: `${cats.length} categorías` },
    { id: 'vends', title: 'Personal', icon: '👥', desc: `${vends.length} empleados` },
    { id: 'mps', title: 'Métodos de Pago', icon: '💳', desc: `${mps.length} métodos` },
    // { id: 'nav_cartera', title: 'Cartera (Cuentas)', icon: '📒', desc: 'Deudas y abonos' },
    { id: 'nav_costeo', title: 'Costeo de Recetas', icon: '🍲', desc: 'Calculadora de utilidad' },
  ]

  const isForm = activeSection && activeSection.startsWith('form_')
  const isList = activeSection && !isForm

  return (
    <>
      <ToastContainer />
      <MobileTopBar title="Configuración" />

      <div className="mobile-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.map(s => (
            <div 
              key={s.id} 
              style={{ background: 'white', padding: 16, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9' }}
              onClick={() => {
                if (s.id.startsWith('nav_')) {
                  window.location.href = s.id === 'nav_cartera' ? '/admin/cartera' : '/admin/costeos'
                } else {
                  setActiveSection(s.id)
                }
              }}
            >
              <div style={{ width: 44, height: 44, background: '#f8fafc', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {s.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{s.desc}</div>
              </div>
              <div style={{ color: '#cbd5e1' }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OVERLAY PARA LISTAS */}
      {isList && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setActiveSection(null)}>
          <div style={{ 
            background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '20px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{sections.find(s => s.id === activeSection)?.title}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {activeSection === 'mesas' && <button className="btn btn-primary btn-sm" onClick={() => abrirMesa()}>+ Agregar</button>}
                {activeSection === 'cats' && <button className="btn btn-primary btn-sm" onClick={() => abrirCat()}>+ Agregar</button>}
                {activeSection === 'vends' && <button className="btn btn-primary btn-sm" onClick={() => abrirVend()}>+ Agregar</button>}
                {activeSection === 'mps' && <button className="btn btn-primary btn-sm" onClick={() => abrirMp()}>+ Agregar</button>}
                <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setActiveSection(null)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* General */}
            {activeSection === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#f8fafc', padding: 12, borderRadius: 12 }}>
                  <div style={{ width: 60, height: 60, borderRadius: 8, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {logoUrl ? <img src={logoUrl} alt="logo" style={{ width: '100%' }} /> : '🍗'}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input className="input" style={{ fontSize: 12, padding: 8 }} placeholder="URL del logo" value={logoInput} onChange={e => setLogoInput(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-xs" onClick={guardarLogo}>Actualizar</button>
                      {logoUrl && <button className="btn btn-danger btn-xs" onClick={quitarLogo}>Quitar</button>}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label">Nombre del Negocio</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={cfg.nombre_negocio} onChange={e => setCfg({...cfg, nombre_negocio: e.target.value})} />
                </div>
                <div>
                  <label className="label">NIT / RUT</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={cfg.nit} onChange={e => setCfg({...cfg, nit: e.target.value})} />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={cfg.telefono} onChange={e => setCfg({...cfg, telefono: e.target.value})} />
                </div>
                <div>
                  <label className="label">Dirección</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={cfg.direccion} onChange={e => setCfg({...cfg, direccion: e.target.value})} />
                </div>
                <div>
                  <label className="label">Slogan</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={cfg.slogan} onChange={e => setCfg({...cfg, slogan: e.target.value})} />
                </div>
                <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12, fontWeight: 700, marginTop: 12 }} onClick={guardarConfig} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar Ajustes'}
                </button>
              </div>
            )}

            {/* Listas */}
            {['mesas', 'cats', 'vends', 'mps'].includes(activeSection) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                
                {activeSection === 'mesas' && mesas.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, display: 'block' }}>{m.nombre}</span>
                      <span className={`badge ${m.activa ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>{m.activa ? 'Activa' : 'Inactiva'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#f1f5f9', borderRadius: 8 }} onClick={() => abrirMesa(m)}>✏️</button>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#fef2f2', borderRadius: 8 }} onClick={() => del('mesa', m.id, reloadMesas)}>🗑️</button>
                    </div>
                  </div>
                ))}

                {activeSection === 'cats' && cats.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, display: 'block' }}>{c.icono} {c.nombre}</span>
                      <span className={`badge ${c.activa ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>{c.activa ? 'Activa' : 'Inactiva'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#f1f5f9', borderRadius: 8 }} onClick={() => abrirCat(c)}>✏️</button>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#fef2f2', borderRadius: 8 }} onClick={() => del('cat', c.id, reloadCats)}>🗑️</button>
                    </div>
                  </div>
                ))}

                {activeSection === 'vends' && vends.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{v.nombre}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{v.rol} • <span style={{ color: v.activo ? '#10b981' : '#ef4444' }}>{v.activo ? 'Activo' : 'Inactivo'}</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#f1f5f9', borderRadius: 8 }} onClick={() => abrirVend(v)}>✏️</button>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#fef2f2', borderRadius: 8 }} onClick={() => del('vend', v.id, reloadVends)}>🗑️</button>
                    </div>
                  </div>
                ))}

                {activeSection === 'mps' && mps.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{m.icono}</span>
                      <div>
                        <span style={{ fontWeight: 600, display: 'block' }}>{m.nombre}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{m.tipo}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="mobile-icon-btn" style={{ padding: 6, background: '#fef2f2', borderRadius: 8 }} onClick={() => del('mp', m.id, reloadMps)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OVERLAY PARA FORMULARIOS */}
      {isForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1100,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setActiveSection(activeSection.replace('form_', '') + 's')}>
          <div style={{ 
            background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '20px', display: 'flex', flexDirection: 'column', gap: 16
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Formulario</h3>
              <button className="mobile-icon-btn" style={{ background: '#f1f5f9', borderRadius: '50%' }} onClick={() => setActiveSection(activeSection.replace('form_', '') + 's')}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Form Mesa */}
            {activeSection === 'form_mesa' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="label">Nombre de Mesa/Zona</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={mesaForm.nombre} onChange={e => setMesaForm({...mesaForm, nombre: e.target.value})} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <input type="checkbox" checked={mesaForm.activa == 1} onChange={e => setMesaForm({...mesaForm, activa: e.target.checked ? 1 : 0})} />
                  Mesa Activa
                </label>
                <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12 }} onClick={guardarMesa}>Guardar Mesa</button>
              </div>
            )}

            {/* Form Categoría */}
            {activeSection === 'form_cat' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="label">Nombre de Categoría</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={catForm.nombre} onChange={e => setCatForm({...catForm, nombre: e.target.value})} />
                </div>
                <div>
                  <label className="label">Ícono (Emoji)</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={catForm.icono} onChange={e => setCatForm({...catForm, icono: e.target.value})} placeholder="🍔" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <input type="checkbox" checked={catForm.activa == 1} onChange={e => setCatForm({...catForm, activa: e.target.checked ? 1 : 0})} />
                  Activa
                </label>
                <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12 }} onClick={guardarCat}>Guardar Categoría</button>
              </div>
            )}

            {/* Form Vendedor */}
            {activeSection === 'form_vend' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="label">Nombre del Personal</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={vendForm.nombre} onChange={e => setVendForm({...vendForm, nombre: e.target.value})} />
                </div>
                <div>
                  <label className="label">Rol</label>
                  <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={vendForm.rol} onChange={e => setVendForm({...vendForm, rol: e.target.value})}>
                    <option value="Vendedor">Vendedor</option>
                    <option value="Cajero">Cajero</option>
                    <option value="Mesero">Mesero</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <input type="checkbox" checked={vendForm.activo == 1} onChange={e => setVendForm({...vendForm, activo: e.target.checked ? 1 : 0})} />
                  Activo
                </label>
                <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12 }} onClick={guardarVend}>Guardar Empleado</button>
              </div>
            )}

            {/* Form Método de Pago */}
            {activeSection === 'form_mp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="label">Nombre (ej: Nequi, Visa)</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={mpForm.nombre} onChange={e => setMpForm({...mpForm, nombre: e.target.value})} />
                </div>
                <div>
                  <label className="label">Tipo Contable</label>
                  <select className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={mpForm.tipo} onChange={e => setMpForm({...mpForm, tipo: e.target.value})}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia (Nequi/Bancos)</option>
                    <option value="tarjeta">Tarjeta (Datáfono)</option>
                    <option value="credito">Crédito (Cartera/Fiado)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Ícono (Emoji)</label>
                  <input className="input" style={{ width: '100%', padding: 12, borderRadius: 12 }} value={mpForm.icono} onChange={e => setMpForm({...mpForm, icono: e.target.value})} placeholder="💳" />
                </div>
                <button className="btn btn-primary" style={{ padding: 16, borderRadius: 12 }} onClick={guardarMp}>Agregar Método</button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  )
}
