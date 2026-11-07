import { Outlet } from 'react-router-dom'
import MobileBottomNav from '../../components/mobile/MobileBottomNav'

export default function MobileAdminLayout() {
  return (
    <div className="mobile-layout">
      {/* 
        El TopBar puede depender de cada vista (por el título y acciones derechas), 
        por lo que dejaremos que cada página defina su propio MobileTopBar.
        Pero si queremos uno global, podríamos ponerlo aquí. 
        Para máxima flexibilidad, dejaremos que las páginas (Outlet) lo manejen. 
      */}
      
      <main className="mobile-content">
        <Outlet />
      </main>

      <MobileBottomNav />
    </div>
  )
}
