import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Marca from './components/Marca.jsx'

export default function App() {
  const [status, setStatus] = useState('Conectando ao banco de dados…')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    async function testarConexao() {
      const { data, error } = await supabase
        .from('teste')
        .select('teste_sucesso')
        .limit(1)
        .single()

      if (error) {
        setStatus('Não foi possível conectar ao banco: ' + error.message)
        return
      }

      setStatus(data.teste_sucesso)
      setOk(true)
    }

    testarConexao()
  }, [])

  return (
    <main className="tela-central">
      <Marca />
      <p className={ok ? 'status ok' : 'status'}>{status}</p>
    </main>
  )
}
