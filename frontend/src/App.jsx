import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useIsMobile } from './hooks/useIsMobile'

// Desktop imports
import LoginPage       from './pages/LoginPage'
import PedidoPage      from './pages/PedidoPage'
import AdminLayout     from './pages/admin/AdminLayout'
import PedidosAdmin    from './pages/admin/PedidosAdmin'
import CajaAdmin       from './pages/admin/CajaAdmin'
import ProductosAdmin  from './pages/admin/ProductosAdmin'
import CarteraAdmin    from './pages/admin/CarteraAdmin'
import CosteoAdmin     from './pages/admin/CosteoAdmin'
import ConfigAdmin     from './pages/admin/ConfigAdmin'

// Mobile imports
import MobilePedidoPage     from './pages/mobile/MobilePedidoPage'
import MobileAdminLayout    from './pages/mobile/MobileAdminLayout'
import MobilePedidosAdmin   from './pages/mobile/MobilePedidosAdmin'
import MobileCajaAdmin      from './pages/mobile/MobileCajaAdmin'
import MobileProductosAdmin from './pages/mobile/MobileProductosAdmin'
import MobileCarteraAdmin   from './pages/mobile/MobileCarteraAdmin'
import MobileCosteoAdmin    from './pages/mobile/MobileCosteoAdmin'
import MobileConfigAdmin    from './pages/mobile/MobileConfigAdmin'

function PrivateRoute({ children }) {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner" /></div>
  if (!usuario) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { usuario, loading } = useAuth()
  if (loading) return <div className="loading-page"><div className="spinner" /></div>
  if (usuario) return <Navigate to="/admin" replace />
  return children
}

export default function App() {
  const isMobile = useIsMobile()

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Público */}
          <Route path="/" element={isMobile ? <MobilePedidoPage /> : <PedidoPage />} />

          {/* Auth */}
          <Route path="/login" element={
            <PublicRoute><LoginPage /></PublicRoute>
          } />

          {/* Admin protegido */}
          <Route path="/admin" element={
            <PrivateRoute>
              {isMobile ? <MobileAdminLayout /> : <AdminLayout />}
            </PrivateRoute>
          }>
            <Route index              element={isMobile ? <MobilePedidosAdmin /> : <PedidosAdmin />} />
            <Route path="caja"        element={isMobile ? <MobileCajaAdmin /> : <CajaAdmin />} />
            <Route path="productos"   element={isMobile ? <MobileProductosAdmin /> : <ProductosAdmin />} />
            <Route path="cartera"     element={isMobile ? <MobileCarteraAdmin /> : <CarteraAdmin />} />
            <Route path="costeo"      element={isMobile ? <MobileCosteoAdmin /> : <CosteoAdmin />} />
            <Route path="config"      element={isMobile ? <MobileConfigAdmin /> : <ConfigAdmin />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
