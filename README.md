# limites

Mod para o Claude Code que mostra, numa faixa acima do campo de mensagem, quanto você já usou da janela de 5 horas e do limite semanal do seu plano. Cada janela tem uma barra colorida, um bonequinho animado em pixel art e o tempo até renovar. Ao lado aparecem os modelos mais usados nos últimos 7 dias, também com barras. O comando `/limites` escreve os números no chat.

Os limites só aparecem em planos de assinatura (Pro/Max), depois da primeira resposta do Claude. O bonequinho e as barras finas aparecem no app desktop; no terminal as barras são desenhadas com blocos.

## Instalar

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install limites --marketplace OWNER/claude-limites
```

Responda `y` para adicionar o marketplace e escolha o escopo de usuário (user), para valer em todas as sessões novas.

Pelo shell:

```bash
claude plugin install limites --marketplace OWNER/claude-limites
```

No app desktop, onde `/plugin` não roda: clique no + ao lado da caixa de mensagem, depois Plugins, Add marketplace com `OWNER/claude-limites`, depois Add plugin.
