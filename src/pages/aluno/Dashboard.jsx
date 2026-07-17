import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'

export default function Dashboard({ usuario }) {
  const [resumo, setResumo] = useState(null)

  useEffect(() => {
    async function carregar() {
      const { data: desempenhos } = await supabase
        .from('desempenho_topico')
        .select('status')
        .eq('usuario_id', usuario.id)

      const { count: simuladosPendentes } = await supabase
        .from('simulados')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuario.id)
        .eq('status', 'pendente')
        .lte('data_agendada', new Date().toISOString())

      const contagem = { dominado: 0, reforcar: 0, aguardando_simulado: 0 }
      for (const d of desempenhos || []) {
        if (contagem[d.status] !== undefined) contagem[d.status] += 1
      }

      setResumo({ ...contagem, simuladosPendentes: simuladosPendentes || 0 })
    }

    carregar()
  }, [usuario.id])

  return (
    <div>
      <h1>Olá, {usuario.nome}</h1>

      {!resumo ? (
        <p className="status">Carregando…</p>
      ) : (
        <div className="grade-cartoes">
          <Link to="/questoes" className="cartao">
            <span className="cartao-numero">{resumo.simuladosPendentes}</span>
            <span>Simulados disponíveis agora</span>
          </Link>
          <div className="cartao">
            <span className="cartao-numero">{resumo.dominado}</span>
            <span>Tópicos dominados</span>
          </div>
          <Link to="/revisao" className="cartao">
            <span className="cartao-numero">{resumo.reforcar}</span>
            <span>Tópicos para reforçar</span>
          </Link>
          <Link to="/edital" className="cartao">
            <span>Ver meu edital completo →</span>
          </Link>
        </div>
      )}
    </div>
  )
}
