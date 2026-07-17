import { logout } from '../lib/auth.js'

export default function Dashboard({ usuario, onSair }) {
  function handleSair() {
    logout()
    onSair()
  }

  return (
    <main className="tela-central">
      <h1>Olá, {usuario.nome}</h1>
      <p className="status">
        Perfil: {usuario.perfil === 'admin' ? 'Administrador' : 'Aluno'}
      </p>
      <button onClick={handleSair}>Sair</button>
    </main>
  )
}
