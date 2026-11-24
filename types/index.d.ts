export type Janela = { kind: string; percentUsed: number; resetsAt?: string }
export type UsoModelo = { model: string; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    limites: {
      janelas: Shaped<Janela[]>
      modelos: Shaped<UsoModelo[]>
      agora: number
      atualizadoEm: number
      atualizando: boolean
    }
  }
}
