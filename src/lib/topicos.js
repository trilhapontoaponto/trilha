import { supabase } from './supabase.js'

const HORAS_ATE_SIMULADO = 24
const DIAS_REVISAO_SE_BOM = 7
const NOTA_MINIMA_DOMINIO = 80

// Marca um tópico como estudado: cria o registro de estudo, agenda o simulado
// para daqui a 24h e coloca o desempenho em "aguardando_simulado".
export async function marcarComoEstudado(usuarioId, topicoId) {
  const dataAgendada = new Date()
  dataAgendada.setHours(dataAgendada.getHours() + HORAS_ATE_SIMULADO)

  await supabase.from('topicos_estudados').insert({
    usuario_id: usuarioId,
    topico_id: topicoId,
  })

  await supabase.from('simulados').insert({
    usuario_id: usuarioId,
    topico_id: topicoId,
    data_agendada: dataAgendada.toISOString(),
    status: 'pendente',
  })

  await supabase.from('desempenho_topico').upsert(
    {
      usuario_id: usuarioId,
      topico_id: topicoId,
      status: 'aguardando_simulado',
      proxima_acao_data: dataAgendada.toISOString(),
    },
    { onConflict: 'usuario_id,topico_id' }
  )
}

// Depois que o aluno responde um simulado: calcula a nota, grava as respostas
// e decide o próximo passo (revisão em 7 dias ou reforço imediato).
export async function finalizarSimulado(simulado, respostas) {
  const total = respostas.length
  const acertos = respostas.filter((r) => r.acertou).length
  const nota = total > 0 ? (acertos / total) * 100 : 0

  await supabase.from('respostas_simulado').insert(
    respostas.map((r) => ({
      simulado_id: simulado.id,
      questao_id: r.questaoId,
      resposta_aluno: r.respostaAluno,
      acertou: r.acertou,
    }))
  )

  await supabase
    .from('simulados')
    .update({ status: 'feito', nota })
    .eq('id', simulado.id)

  const dominou = nota >= NOTA_MINIMA_DOMINIO
  const proximaAcao = new Date()

  if (dominou) {
    proximaAcao.setDate(proximaAcao.getDate() + DIAS_REVISAO_SE_BOM)
  } else {
    proximaAcao.setHours(proximaAcao.getHours() + HORAS_ATE_SIMULADO)
    // nota baixa: agenda outro simulado do mesmo ponto
    await supabase.from('simulados').insert({
      usuario_id: simulado.usuario_id,
      topico_id: simulado.topico_id,
      data_agendada: proximaAcao.toISOString(),
      status: 'pendente',
    })
  }

  await supabase.from('desempenho_topico').upsert(
    {
      usuario_id: simulado.usuario_id,
      topico_id: simulado.topico_id,
      ultima_nota: nota,
      status: dominou ? 'dominado' : 'reforcar',
      proxima_acao_data: proximaAcao.toISOString(),
    },
    { onConflict: 'usuario_id,topico_id' }
  )

  return { nota, dominou }
}
