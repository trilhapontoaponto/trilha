import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { finalizarSimulado, listarMaterias, buscarQuestoesAvulsas } from '../../lib/topicos.js'

const QUANTIDADES_AVULSO = [3, 5, 7, 10]

// Enunciados de questões extraídas de provas reais podem trazer um prefixo
// "[Texto: fonte]" indicando de qual texto-base a assertiva depende.
// Isso separa esse prefixo do resto do enunciado para exibição destacada.
function separarTextoApoio(enunciado) {
  const match = enunciado.match(/^\[Texto:\s*([^\]]+)\]\s*(.*)$/s)
  if (match) {
    return { fonte: match[1], assertiva: match[2] }
  }
  return { fonte: null, assertiva: enunciado }
}

export default function Questoes({ usuario }) {
  const [aba, setAba] = useState('agendados') // 'agendados' | 'avulso'

  // --- estado do modo "agendados" ---
  const [simulados, setSimulados] = useState([])
  const [carregando, setCarregando] = useState(true)

  // --- estado do modo "avulso" ---
  const [materias, setMaterias] = useState([])
  const [materiaSelecionada, setMateriaSelecionada] = useState('')
  const [quantidadeSelecionada, setQuantidadeSelecionada] = useState(QUANTIDADES_AVULSO[0])
  const [gerandoAvulso, setGerandoAvulso] = useState(false)

  // --- estado comum ao simulado em andamento (agendado ou avulso) ---
  const [simuladoAtivo, setSimuladoAtivo] = useState(null) // { id, topico_id, topicos, avulso: bool }
  const [questoes, setQuestoes] = useState([])
  const [respostas, setRespostas] = useState({})
  const [resultado, setResultado] = useState(null)

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

  useEffect(() => {
    listarMaterias().then((lista) => {
      setMaterias(lista)
      if (lista.length > 0) setMateriaSelecionada(lista[0].id)
    })
  }, [])

  async function iniciarSimulado(simulado) {
    const { data } = await supabase
      .from('questoes')
      .select('id, enunciado, gabarito')
      .eq('topico_id', simulado.topico_id)
      .eq('ativo', true)

    setSimuladoAtivo({ ...simulado, avulso: false })
    setQuestoes(data || [])
    setRespostas({})
    setResultado(null)
  }

  async function iniciarSimuladoAvulso() {
    if (!materiaSelecionada) return
    setGerandoAvulso(true)
    const sorteadas = await buscarQuestoesAvulsas(materiaSelecionada, quantidadeSelecionada)
    const nomeMateria = materias.find((m) => m.id === materiaSelecionada)?.nome

    setSimuladoAtivo({
      avulso: true,
      topicos: { nome: `Simulado avulso — ${nomeMateria}` },
    })
    setQuestoes(sorteadas)
    setRespostas({})
    setResultado(null)
    setGerandoAvulso(false)
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

    // Simulado avulso não é persistido (não altera desempenho_topico nem
    // conta como simulado "oficial" do tópico) — é só pra treino/preview.
    if (simuladoAtivo.avulso) {
      const total = listaRespostas.length
      const acertos = listaRespostas.filter((r) => r.acertou).length
      const nota = total > 0 ? (acertos / total) * 100 : 0
      setResultado({ nota, dominou: nota >= 80, avulso: true })
      return
    }

    const res = await finalizarSimulado(
      { id: simuladoAtivo.id, usuario_id: usuario.id, topico_id: simuladoAtivo.topico_id },
      listaRespostas
    )
    setResultado(res)
  }

  function voltar() {
    setSimuladoAtivo(null)
    setResultado(null)
    carregarPendentes()
  }

  // Tela de resultado
  if (resultado) {
    return (
      <div>
        <h1>Resultado</h1>
        <p className={resultado.dominou ? 'status ok' : 'status erro'}>
          Nota: {resultado.nota.toFixed(0)}%
          {resultado.avulso
            ? ' — simulado avulso (não afeta seu progresso no Meu Edital).'
            : resultado.dominou
              ? ' — Tópico dominado! Revisão agendada para daqui a 7 dias.'
              : ' — Precisa reforçar. Um novo simulado foi agendado para você.'}
        </p>
        <button onClick={voltar}>Voltar</button>
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
            {questoes.map((q, i) => {
              const { fonte, assertiva } = separarTextoApoio(q.enunciado)
              return (
                <div key={q.id} className="bloco-questao">
                  {fonte && <p className="texto-apoio-tag">📖 {fonte}</p>}
                  <p>{i + 1}. {assertiva}</p>
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
              )
            })}
            <button onClick={handleFinalizar} disabled={!todasRespondidas}>
              Finalizar simulado
            </button>
          </>
        )}
      </div>
    )
  }

  // Tela principal: abas "Agendados" / "Simulado avulso"
  return (
    <div>
      <h1>Questões</h1>

      <div className="tabs">
        <button
          className={aba === 'agendados' ? 'tab-ativa' : ''}
          onClick={() => setAba('agendados')}
        >
          Agendados
        </button>
        <button
          className={aba === 'avulso' ? 'tab-ativa' : ''}
          onClick={() => setAba('avulso')}
        >
          Simulado avulso
        </button>
      </div>

      {aba === 'agendados' && (
        carregando ? (
          <p className="status">Carregando questões…</p>
        ) : simulados.length === 0 ? (
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
        )
      )}

      {aba === 'avulso' && (
        <div className="bloco-avulso">
          <label>
            Matéria
            <select
              value={materiaSelecionada}
              onChange={(e) => setMateriaSelecionada(Number(e.target.value))}
            >
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </label>

          <label>
            Quantidade de questões
            <select
              value={quantidadeSelecionada}
              onChange={(e) => setQuantidadeSelecionada(Number(e.target.value))}
            >
              {QUANTIDADES_AVULSO.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <button onClick={iniciarSimuladoAvulso} disabled={gerandoAvulso || !materiaSelecionada}>
            {gerandoAvulso ? 'Gerando…' : 'Gerar simulado'}
          </button>
        </div>
      )}
    </div>
  )
}
