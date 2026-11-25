export type Agente = {
  id: string
  tarefa: string
  tipo: string
  modelo: string
  status: 'trabalhando' | 'esperando' | 'concluido' | 'falhou' | 'parado'
  ferramentas: number
  ultimaFerramenta: string
  tokens: number
  inicio: number
  fim: number
  pai: string
  origem: 'agente' | 'workflow' | 'fork' | 'equipe'
}

declare module 'claude-code' {
  interface PluginState {
    agentes: { lista: Shaped<Agente[]>; agora: number }
  }
}
