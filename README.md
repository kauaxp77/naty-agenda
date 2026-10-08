# Naty · Pedidos → Agenda → Lembretes

Automação em **n8n** para a empresa de licitações da Naty. Ela recebe pedidos de serviço (e-mail ou texto colado do WhatsApp), extrai os dados com IA, coloca o serviço na Agenda Google e avisa a Naty no Telegram **2 dias, 1 dia, 12 horas e 6 horas antes**.

> **Por que existe:** um serviço deixou de ser executado porque a data do pedido foi lida errada. Todo o projeto é desenhado em torno de um objetivo: **nenhum pedido pode sumir ou ficar com a data errada sem que alguém seja avisado.**

---

## Sumário

- [O que faz](#o-que-faz)
- [Como funciona](#como-funciona)
- [Infraestrutura](#infraestrutura)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Colocar no ar](#colocar-no-ar)
- [Desenvolvimento](#desenvolvimento)
- [Segurança](#segurança)
- [Limitações conhecidas](#limitações-conhecidas)
- [Próximos passos](#próximos-passos)
- [Documentação completa](#documentação-completa)

---

## O que faz

| | |
|---|---|
| 📥 **Recebe pedidos** | E-mails com o rótulo `pedidos-licitacao` no Gmail, ou texto colado num formulário (pedidos que chegam por WhatsApp/telefone). |
| 🤖 **Extrai os dados com IA** | Órgão, tipo de serviço, nº do processo, local, contato, **data e hora**, e outras datas citadas (impugnação, abertura, disputa). |
| 🔎 **Confere a data sem IA** | Dia da semana bate com a data? A data já passou? Está a mais de 1 ano? Faltam menos de 48h? Cada problema vira um alerta visível. |
| 📅 **Agenda na hora** | Cria o evento no Google Agenda **antes** de pedir confirmação, marcado como `⏳ [A CONFIRMAR]`. |
| ✅ **Pede confirmação no Telegram** | Mostra a data **por extenso** e o trecho original da mensagem, com botões **✅ Está certo / ❌ Está errado**. |
| ⏰ **Lembra no Telegram** | 2 dias, 1 dia, 12h e 6h antes, lendo direto da agenda (se a data mudar na agenda, os lembretes acompanham). |
| 🚨 **Avisa quando algo falha** | Pedido que não pôde ser agendado, agenda ilegível, Telegram fora: sempre gera aviso no Telegram e/ou e-mail. |

## Como funciona

São dois workflows independentes no n8n.

### Workflow 1: Pedidos → Agenda (`workflow-naty-agenda.json`)

```
Gmail (rótulo "pedidos-licitacao") ─┐
                                    ├─► Normalizar ─► Groq (IA) extrai os dados em JSON
Formulário (texto do WhatsApp) ─────┘                         │
                                                              ▼
                                          Validar em código: data válida, dia da semana,
                                          passado/futuro, urgência, monta evento e mensagens
                                                              │
                              ┌────────── falhou ─────────────┴────────── ok ──────────┐
                              ▼                                                         ▼
              🚨 "NÃO agendado" no Telegram + e-mail        Cria evento ⏳ [A CONFIRMAR] (laranja)
                                                            no Google Agenda
                                                                         │
                                                                         ▼
                                                    Telegram: ✅ Está certo / ❌ Está errado
                                                    (se o Telegram falhar → confirmação por e-mail)
                                                                         │
                                        ┌──────── ✅ ───────────────────┴──── ❌ ou 24h sem resposta ──┐
                                        ▼                                                                ▼
                               Evento vira ✅ (verde)                        Evento vira ⚠️ VERIFICAR (vermelho)
                                                                             + aviso no Telegram para corrigir
```

### Workflow 2: Lembretes no Telegram (`workflow-naty-lembretes-telegram.json`)

```
A cada 10 min ─► lê a agenda (próximas 49h) ─► para cada evento do robô:
                                               chegou a hora do lembrete de 2d / 1d / 12h / 6h
                                               e ele ainda não foi enviado para ESTA data?
                                                       │ sim
                                                       ▼
                                     manda no Telegram ─► marca no próprio evento que enviou

Não conseguiu ler a agenda ─► 🚨 "lembretes PARADOS" no Telegram (no máximo 1x por hora)
```

### Três princípios do desenho

1. **O evento nasce antes da confirmação.** Se a Naty não responder, o serviço já está na agenda com os lembretes ativos. A falha vira "evento com rótulo errado", nunca "evento inexistente".
2. **A checagem de data crítica não depende da IA.** Dia da semana, passado/futuro e urgência são calculados em código (`src/03_validar.js`) e testados.
3. **A agenda é a fonte da verdade dos lembretes.** O controle de "lembrete já enviado" fica gravado no próprio evento (`extendedProperties`), sem banco de dados extra.

Detalhes nó a nó em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). O porquê de cada escolha está em [`docs/DECISOES.md`](docs/DECISOES.md).

## Infraestrutura

| Peça | Serviço | Plano | Observação |
|---|---|---|---|
| Motor de automação | **n8n 2.42.5** no **Render** (`naty-n8n.onrender.com`) | Grátis (512 MB) | Construído a partir do `Dockerfile` deste repositório (versão fixada) |
| Banco do n8n | **Supabase** Postgres (projeto `naty-n8n`, us-west-1) | Grátis (500 MB) | Usuário e schema `n8n` exclusivos, via Session pooler |
| Manter acordado | **cron-job.org** → `GET /healthz` a cada 5 min | Grátis | Sem isso o Render desliga o n8n após 15 min |
| IA de extração | **Groq** (`openai/gpt-oss-120b`, modo `strict`) | Grátis | Troca de modelo em `src/02_montar_requisicao.js` |
| Agenda e e-mail | **Google Agenda** + **Gmail** (OAuth2) | Grátis | |
| Mensagens para a Naty | **Bot do Telegram** | Grátis | Confirmações, lembretes e alertas |

Custo mensal atual: **R$ 0**. Quando o plano grátis apertar, os upgrades estão em [`docs/OPERACAO.md`](docs/OPERACAO.md#quando-sair-do-plano-grátis).

## Estrutura do repositório

```
.
├── README.md                              ← você está aqui
├── SETUP.md                               ← configurar credenciais, importar e testar os workflows
├── Dockerfile                             ← imagem do n8n usada pelo Render
├── workflow-naty-agenda.json              ← workflow 1 (GERADO por build.js, não editar à mão)
├── workflow-naty-lembretes-telegram.json  ← workflow 2 (GERADO por build.js, não editar à mão)
├── build.js                               ← gera os dois JSONs a partir de src/
├── src/                                   ← código dos nós "Code" do n8n
│   ├── 01_normalizar.js                   ·  W1: unifica e-mail/formulário + CONFIG
│   ├── 02_montar_requisicao.js            ·  W1: prompt, esquema JSON e calendário para a IA
│   ├── 03_validar.js                      ·  W1: valida a data, monta evento e mensagens
│   ├── 10_lembretes_config.js             ·  W2: CONFIG + janela de busca
│   └── 11_calcular_lembretes.js           ·  W2: decide quais lembretes enviar agora
├── test/                                  ← testes da lógica (31 cenários)
├── deploy/
│   ├── RENDER.md                          ← hospedagem atual: Render + Supabase
│   ├── LEIA-ME.md                         ← alternativa: VPS / Oracle Cloud com Docker + Caddy
│   ├── docker-compose.yml, Caddyfile, .env.exemplo
└── docs/
    ├── ARQUITETURA.md                     ← cada nó, estados do evento, algoritmo dos lembretes
    ├── OPERACAO.md                        ← o que fazer quando chega um 🚨, logs, backup, custos
    └── DECISOES.md                        ← por que n8n, Groq, Telegram, Render... e o que foi descartado
```

## Colocar no ar

Na ordem:

1. **Hospedagem do n8n:** [`deploy/RENDER.md`](deploy/RENDER.md). Já está criada; o guia serve para conferir ou recriar.
2. **Credenciais, importação e testes:** [`SETUP.md`](SETUP.md): Gmail, Google Agenda, Groq, bot do Telegram, celular da Naty e o roteiro de testes.
3. **Rotina de operação:** [`docs/OPERACAO.md`](docs/OPERACAO.md).

## Desenvolvimento

Requer Node.js 18+.

```bash
npm install                        # instala o luxon (datas), usado só nos testes
npm test                           # roda os 31 testes (os dois arquivos abaixo)
node test/testar_validacao.js      # 19 testes: extração, datas, confirmação, Markdown do Telegram
node test/testar_lembretes.js      # 12 testes: lembretes, remarcação, n8n fora do ar
npm run build                      # (= node build.js) gera workflow-naty-agenda.json e workflow-naty-lembretes-telegram.json
```

**Fluxo de trabalho:**

1. Edite o código em `src/` (lógica) ou a estrutura dos nós em `build.js`.
2. Rode os testes e o `build.js`.
3. Reimporte o JSON gerado no n8n (Workflows → Import from File, substituindo o anterior) e reconfigure as credenciais dos nós.

> ⚠️ **Os JSONs são gerados.** Se alguém editar um workflow direto na interface do n8n, a mudança **não** volta para este repositório: na próxima importação ela se perde. Ou se faz a mudança aqui, ou se exporta o workflow do n8n e a mudança é portada para `src/`/`build.js`.

**Como os testes funcionam:** cada arquivo de `src/` é executado fora do n8n, com `$input`, `$()` e `DateTime` simulados e o "agora" fixado em 07/10/2026 10:00 (horário de Brasília). Assim, os cenários de data são reprodutíveis.

> ⚠️ **Todo push na branch `main` refaz o deploy do n8n no Render** (alguns minutos fora do ar). Para mudanças só de documentação, veja [Build Filters em `docs/OPERACAO.md`](docs/OPERACAO.md#evitar-redeploy-a-cada-push).

## Segurança

- **Nenhuma senha, chave de API ou token fica neste repositório.** Credenciais do Google, Groq e Telegram ficam **criptografadas dentro do n8n**. As variáveis do servidor (senha do banco, `N8N_ENCRYPTION_KEY`) ficam no **painel do Render**.
- A `N8N_ENCRYPTION_KEY` precisa ter **cópia fora do Render** (gerenciador de senhas). Sem ela, as credenciais salvas no n8n não podem ser recuperadas.
- O usuário `n8n` do banco só enxerga o próprio schema; ele não usa a senha mestre do Supabase.
- A confirmação no Telegram aceita toques **só do chat da Naty** (`approverIds`).
- O n8n tem acesso ao Gmail e à agenda da empresa: conta de dono com **senha forte e 2FA**.
- Repositório **privado**.

## Limitações conhecidas

1. **Telegram e Agenda são notificações, não alarmes.** Podem ser silenciados. A ligação automática está nos próximos passos.
2. **A IA pode errar a data e a Naty confirmar sem ler.** O sistema torna a conferência fácil (data por extenso + trecho original + alertas), mas não a garante.
3. **Só entra o pedido que chega com o rótulo do Gmail ou pelo formulário.** Cliente novo fora do filtro do Gmail passa batido.
4. **Remarcação pelo cliente cria um evento novo;** o antigo precisa ser apagado à mão.
5. **Plano grátis:** se o cron-job.org parar, o n8n dorme e os lembretes param. 512 MB de memória é o limite para o n8n.
6. **Groq (`gpt-oss-120b`) é mais fraco que modelos de ponta** para ler datas em português e escolher a data certa de um edital. É compensado pelo calendário enviado junto e pelas checagens em código, mas convém acompanhar as primeiras semanas.

## Próximos passos

- [ ] Primeiro teste ponta a ponta com credenciais reais (roteiro no `SETUP.md`, passo 8)
- [ ] Entrada pelo **WhatsApp oficial** (Cloud API), com a Naty encaminhando os pedidos para o número do bot
- [ ] Tabela "número/remetente → cliente", para preencher o contato automaticamente
- [ ] **Ligação automática** 6h antes para eventos ainda não confirmados
- [ ] Resumo diário às 7h com os serviços do dia e do dia seguinte
- [ ] Detectar remarcação ("a sessão foi adiada") e atualizar o evento existente em vez de criar outro

## Documentação completa

| Documento | Conteúdo |
|---|---|
| [`SETUP.md`](SETUP.md) | Configuração passo a passo e roteiro de testes |
| [`deploy/RENDER.md`](deploy/RENDER.md) | Hospedagem atual (Render + Supabase + cron-job.org) |
| [`deploy/LEIA-ME.md`](deploy/LEIA-ME.md) | Hospedagem alternativa (VPS / Oracle Cloud) |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Funcionamento interno, nó a nó |
| [`docs/OPERACAO.md`](docs/OPERACAO.md) | Manual de operação e resolução de problemas |
| [`docs/DECISOES.md`](docs/DECISOES.md) | Registro das decisões técnicas e alternativas descartadas |

---

Mantido por [@kauaxp77](https://github.com/kauaxp77).
