import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

import LoginPage       from './pages/LoginPage'
import PedidoPage      from './pages/PedidoPage'
import AdminLayout     from './pages/admin/AdminLayout'
import PedidosAdmin    from './pages/admin/PedidosAdmin'
import CajaAdmin       from './pages/admin/CajaAdmin'
import ProductosAdmin  from './pages/admin/ProductosAdmin'
import CarteraAdmin    from './pages/admin/CarteraAdmin'
import CosteoAdmin     from './pages/admin/CosteoAdmin'
import ConfigAdmin     from './pages/admin/ConfigAdmin'


function getTenantParam() {
  const p = new URLSearchParams(window.location.search)
  const t = p.get('tenant') || localStorage.getItem('tenant') || ''
  return t ? `?tenant=${t}` : ''
}

function PrivateRoute({ children }) {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner" /></div>
  if (!usuario) return <Navigate to={`/login${getTenantParam()}`} replace />
  return children
}

function PublicRoute({ children }) {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner" /></div>
  if (usuario) return <Navigate to={`/admin${getTenantParam()}`} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Público */}
          <Route path="/" element={<PedidoPage />} />

          {/* Auth */}
          <Route path="/login" element={
            <PublicRoute><LoginPage /></PublicRoute>
          } />

          {/* Admin protegido */}
          <Route path="/admin" element={
            <PrivateRoute>
              <AdminLayout />
            </PrivateRoute>
          }>
            <Route index              element={<PedidosAdmin />} />
            <Route path="caja"        element={<CajaAdmin />} />
            <Route path="productos"   element={<ProductosAdmin />} />
            <Route path="cartera"     element={<CarteraAdmin />} />
            <Route path="costeo"      element={<CosteoAdmin />} />
            <Route path="config"      element={<ConfigAdmin />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
