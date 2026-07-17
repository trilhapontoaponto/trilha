import { NavLink, Outlet } from 'react-router-dom'
import { logout } from '../lib/auth.js'

const LINKS_ADMIN = [
  { to: '/admin/alunos', label: 'Alunos' },
  { to: '/admin/usuarios', label: 'Usuários' },
]

const LINKS_ALUNO = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/edital', label: 'Meu edital' },
  { to: '/revisao', label: 'Revisão' },
  { to: '/questoes', label: 'Questões' },
]

export default function Layout({ usuario, onSair }) {
  const links = usuario.perfil === 'admin' ? LINKS_ADMIN : LINKS_ALUNO

  function handleSair() {
    logout()
    onSair()
  }

  return (
    <div className="layout">
      <aside className="menu-lateral">
        <div className="menu-marca">
          <span className="menu-marca-nome">Trilha</span>
        </div>

        <nav className="menu-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => 'menu-link' + (isActive ? ' ativo' : '')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="menu-rodape">
          <span className="menu-usuario">{usuario.nome}</span>
          <button className="menu-sair" onClick={handleSair}>Sair</button>
        </div>
      </aside>

      <section className="conteudo">
        <Outlet />
      </section>
    </div>
  )
}
