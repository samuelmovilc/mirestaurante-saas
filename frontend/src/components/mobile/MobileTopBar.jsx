import { useAuth } from '../../context/AuthContext'

export default function MobileTopBar({ title, onMenuClick, rightAction }) {
  const { usuario } = useAuth()

  return (
    <header className="mobile-top-bar">
      {onMenuClick ? (
        <button className="mobile-icon-btn" onClick={onMenuClick}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      ) : (
        <div className="mobile-icon-placeholder" />
      )}
      
      <h1 className="mobile-top-title">{title}</h1>
      
      <div className="mobile-top-right">
        {rightAction || (
          <div className="mobile-user-avatar">
            {usuario ? usuario.nombre?.charAt(0).toUpperCase() : 'A'}
          </div>
        )}
      </div>
    </header>
  )
}
