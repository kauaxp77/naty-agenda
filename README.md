# Naty: pedidos → agenda + lembretes no Telegram

Automação em n8n para a empresa de licitações da Naty:

1. **Pedidos → agenda** (`workflow-naty-agenda.json`): lê pedidos do Gmail ou de um formulário, extrai os dados com IA (Groq), cria o evento no Google Agenda e pede confirmação da data à Naty pelo Telegram.
2. **Lembretes** (`workflow-naty-lembretes-telegram.json`): avisa a Naty no Telegram 2 dias, 1 dia, 12h e 6h antes de cada serviço.

- Configuração passo a passo: [`SETUP.md`](SETUP.md)
- Onde hospedar o n8n: [`deploy/RENDER.md`](deploy/RENDER.md) (Render grátis + Supabase) ou [`deploy/LEIA-ME.md`](deploy/LEIA-ME.md) (VPS / Oracle)

## Desenvolvimento
Os workflows são gerados a partir do código em `src/`:
```bash
npm install
node test/testar_validacao.js && node test/testar_lembretes.js   # testes
node build.js                                                      # gera os .json
```

> **Nunca coloque senhas, chaves de API ou tokens neste repositório.** Credenciais ficam no n8n; variáveis do servidor ficam no painel do Render.
