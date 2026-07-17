import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { marcarComoEstudado } from '../../lib/topicos.js'

export default function Revisao({ usuario }) {
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const navigate = useNavigate()

  async function carregar() {
    setCarregando(true)

    const { data } = await supabase
      .from('desempenho_topico')
      .select('topico_id, status, ultima_nota, proxima_acao_data, topicos(nome, materia_id, materias(nome))')
      .eq('usuario_id', usuario.id)
      .in('status', ['reforcar', 'dominado'])
      .lte('proxima_acao_data', new Date().toISOString())
      .order('proxima_acao_data')

    setItens(data || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [usuario.id])

  async function handleMarcar(topicoId) {
    await marcarComoEstudado(usuario.id, topicoId)
    carregar()
  }

  // Leva pra Questões já com esse tópico carregado, sem precisar de simulado
  // agendado nem espera — usa o mesmo mecanismo de "Resolver questões",
  // restrito a este único tópico.
  function handlePraticarAgora(item) {
    navigate('/questoes', {
      state: {
        praticarTopico: {
          id: item.topico_id,
          nome: item.topicos?.nome,
          materiaId: item.topicos?.materia_id,
          materiaNome: item.topicos?.materias?.nome,
        },
      },
    })
  }

  if (carregando) return <p className="status">Carregando revisões…</p>

  return (
    <div>
      <h1>Revisão</h1>

      {itens.length === 0 ? (
        <p className="status">Nenhum tópico pendente de revisão por enquanto.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Matéria</th>
              <th>Tópico</th>
              <th>Motivo</th>
              <th>Última nota</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.topico_id}>
                <td>{item.topicos?.materias?.nome}</td>
                <td>{item.topicos?.nome}</td>
                <td>{item.status === 'reforcar' ? 'Reforço (nota baixa)' : 'Revisão programada'}</td>
                <td>{item.ultima_nota != null ? `${item.ultima_nota.toFixed(0)}%` : '—'}</td>
                <td>
                  <button onClick={() => handlePraticarAgora(item)}>Praticar agora</button>
                </td>
                <td>
                  <button onClick={() => handleMarcar(item.topico_id)}>
                    Marcar como estudado
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
