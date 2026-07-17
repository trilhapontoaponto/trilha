import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { finalizarSimulado } from '../../lib/topicos.js'

export default function Questoes({ usuario }) {
  const [simulados, setSimulados] = useState([])
  const [simuladoAtivo, setSimuladoAtivo] = useState(null)
  const [questoes, setQuestoes] = useState([])
  const [respostas, setRespostas] = useState({})
  const [resultado, setResultado] = useState(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPendentes() {
    setCarregando(true)
    const { data } = await supabase
      .from('simulados')
      .select('id, topico_id, data_agendada, topicos(nome, materias(nome))')
      .eq('usuario_id', usuario.id)
      .eq('status', 'pendente')
      .lte('data_agendada', new Date().toISOString())
      .order('data_agendada')

    setSimulados(data || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregarPendentes()
  }, [usuario.id])

  async function iniciarSimulado(simulado) {
    const { data } = await supabase
      .from('questoes')
      .select('id, enunciado, gabarito')
      .eq('topico_id', simulado.topico_id)
      .eq('ativo', true)

    setSimuladoAtivo(simulado)
    setQuestoes(data || [])
    setRespostas({})
    setResultado(null)
  }

  function responder(questaoId, valor) {
    setRespostas((prev) => ({ ...prev, [questaoId]: valor }))
  }

  async function handleFinalizar() {
    const listaRespostas = questoes.map((q) => {
      const respostaAluno = respostas[q.id]
      return {
        questaoId: q.id,
        respostaAluno,
        acertou: respostaAluno === q.gabarito,
      }
    })

    const res = await finalizarSimulado(
      { id: simuladoAtivo.id, usuario_id: usuario.id, topico_id: simuladoAtivo.topico_id },
      listaRespostas
    )
    setResultado(res)
  }

  if (carregando) return <p className="status">Carregando questões…</p>

  // Tela de resultado
  if (resultado) {
    return (
      <div>
        <h1>Resultado</h1>
        <p className={resultado.dominou ? 'status ok' : 'status erro'}>
          Nota: {resultado.nota.toFixed(0)}% — {resultado.dominou
            ? 'Tópico dominado! Revisão agendada para daqui a 7 dias.'
            : 'Precisa reforçar. Um novo simulado foi agendado para você.'}
        </p>
        <button onClick={() => { setSimuladoAtivo(null); carregarPendentes() }}>
          Voltar
        </button>
      </div>
    )
  }

  // Tela do simulado em andamento
  if (simuladoAtivo) {
    const todasRespondidas = questoes.length > 0 && questoes.every((q) => respostas[q.id] !== undefined)

    return (
      <div>
        <h1>{simuladoAtivo.topicos?.nome}</h1>

        {questoes.length === 0 ? (
          <p className="status">Nenhuma questão cadastrada ainda para este tópico.</p>
        ) : (
          <>
            {questoes.map((q, i) => (
              <div key={q.id} className="bloco-questao">
                <p>{i + 1}. {q.enunciado}</p>
                <div className="opcoes-questao">
                  <button
                    className={respostas[q.id] === true ? 'opcao-selecionada' : ''}
                    onClick={() => responder(q.id, true)}
                  >
                    Certo
                  </button>
                  <button
                    className={respostas[q.id] === false ? 'opcao-selecionada' : ''}
                    onClick={() => responder(q.id, false)}
                  >
                    Errado
                  </button>
                </div>
              </div>
            ))}
            <button onClick={handleFinalizar} disabled={!todasRespondidas}>
              Finalizar simulado
            </button>
          </>
        )}
      </div>
    )
  }

  // Lista de simulados pendentes
  return (
    <div>
      <h1>Questões</h1>

      {simulados.length === 0 ? (
        <p className="status">Nenhum simulado disponível no momento.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Matéria</th>
              <th>Tópico</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {simulados.map((s) => (
              <tr key={s.id}>
                <td>{s.topicos?.materias?.nome}</td>
                <td>{s.topicos?.nome}</td>
                <td>
                  <button onClick={() => iniciarSimulado(s)}>Fazer simulado</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
