import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])

  async function carregar() {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil, ativo')
      .order('perfil')
      .order('nome')
    setUsuarios(data || [])
  }

  useEffect(() => {
    carregar()
  }, [])

  async function mudarPerfil(usuario, novoPerfil) {
    await supabase.from('usuarios').update({ perfil: novoPerfil }).eq('id', usuario.id)
    carregar()
  }

  async function alternarAtivo(usuario) {
    await supabase.from('usuarios').update({ ativo: !usuario.ativo }).eq('id', usuario.id)
    carregar()
  }

  return (
    <div>
      <h1>Usuários</h1>
      <p className="status">Controle de quem tem acesso ao sistema e com qual perfil.</p>

      <table className="tabela">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.perfil} onChange={(e) => mudarPerfil(u, e.target.value)}>
                  <option value="aluno">Aluno</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td>{u.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                <button onClick={() => alternarAtivo(u)}>
                  {u.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
