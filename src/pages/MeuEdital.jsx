import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { marcarComoEstudado } from '../../lib/topicos.js'

const ROTULO_STATUS = {
  nao_iniciado: 'Não iniciado',
  aguardando_simulado: 'Aguardando simulado',
  reforcar: 'Reforçar',
  dominado: 'Dominado',
}

export default function MeuEdital({ usuario }) {
  const [materias, setMaterias] = useState([])
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)

    const { data: materiasData } = await supabase
      .from('materias')
      .select('id, nome, ordem, topicos(id, nome, ordem)')
      .eq('concurso_id', usuario.concurso_id)
      .order('ordem')

    const { data: desempenhos } = await supabase
      .from('desempenho_topico')
      .select('topico_id, status')
      .eq('usuario_id', usuario.id)

    const statusPorTopico = Object.fromEntries(
      (desempenhos || []).map((d) => [d.topico_id, d.status])
    )

    const materiasOrdenadas = (materiasData || []).map((m) => ({
      ...m,
      topicos: [...(m.topicos || [])]
        .sort((a, b) => a.ordem - b.ordem)
        .map((t) => ({ ...t, status: statusPorTopico[t.id] || 'nao_iniciado' })),
    }))

    setMaterias(materiasOrdenadas)
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [usuario.id, usuario.concurso_id])

  async function handleMarcar(topicoId) {
    await marcarComoEstudado(usuario.id, topicoId)
    carregar()
  }

  if (carregando) return <p className="status">Carregando edital…</p>

  if (materias.length === 0) {
    return (
      <div>
        <h1>Meu edital</h1>
        <p className="status">
          Nenhuma matéria cadastrada ainda para o seu concurso. Fale com o admin.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1>Meu edital</h1>

      {materias.map((materia) => (
        <div key={materia.id} className="bloco-materia">
          <h2>{materia.nome}</h2>

          {materia.topicos.length === 0 ? (
            <p className="status">Nenhum tópico cadastrado ainda.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tópico</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {materia.topicos.map((topico) => (
                  <tr key={topico.id}>
                    <td>{topico.nome}</td>
                    <td>{ROTULO_STATUS[topico.status]}</td>
                    <td>
                      {topico.status === 'nao_iniciado' && (
                        <button onClick={() => handleMarcar(topico.id)}>
                          Marcar como estudado
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
