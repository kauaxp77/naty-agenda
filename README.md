# Naty · Pedidos → Agenda → Lembretes

Automação em **n8n** para a empresa de licitações da Naty. Os pedidos de serviço chegam pelo **WhatsApp** (encaminhados ao número do robô), por e-mail ou por um formulário. A IA extrai os dados, o serviço entra na Agenda Google na hora e o robô responde na mesma conversa. A Naty e a equipe recebem o convite e **lembretes por e-mail 2 dias e 1 dia antes**; o celular do dono da agenda toca alarmes 2 dias, 1 dia, 12 horas e 6 horas antes.

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
| 📥 **Recebe pedidos** | Mensagens de texto encaminhadas ao **WhatsApp do robô**, só de números autorizados (o robô não lê as conversas da Naty). Também e-mails com o rótulo `pedidos-licitacao` no Gmail, ou texto colado num formulário. |
| 🤖 **Extrai os dados com IA** | Órgão, tipo de serviço, nº do processo, local, contato, **data e hora**, e outras datas citadas (impugnação, abertura, disputa). |
| 🔎 **Confere a data sem IA** | Dia da semana bate com a data? A data já passou? Está a mais de 6 meses? Tem horário? É uma mensagem encaminhada com "amanhã"? Faltam menos de 48h? Cada problema vira um alerta visível. |
| 📅 **Agenda na hora** | Cria o evento no Google Agenda sem etapa de confirmação: **verde** quando está tudo certo, **vermelho** com `⚠️ VERIFICAR` quando há dúvida real sobre a data. |
| 🗂️ **Comandos no WhatsApp** | **"agenda"** → lista dos serviços dos próximos 60 dias, por dia, com ⚠️ nos que estão para conferir. **"oi"/"menu"** → botões *📅 Ver agenda* e *➕ Como agendar*. Só vale se a mensagem for só a palavra; o resto é pedido. Não passa pela IA. |
| 💬 **Responde na mesma conversa** | No WhatsApp, com a data **por extenso**, o trecho original da mensagem e os alertas. Pedido por e-mail ou formulário recebe a resposta por e-mail. |
| ⏰ **Lembra por e-mail** | A Naty e a equipe (`emails_equipe`) recebem o convite do Google e um e-mail 2 dias e 1 dia antes, lido direto da agenda (se a data mudar na agenda, os lembretes acompanham). |
| 🚨 **Avisa quando algo falha** | Pedido que não pôde ser agendado (áudio, falha da IA, erro do Google) gera aviso no WhatsApp ou por e-mail. WhatsApp fora → o aviso vai por e-mail. Agenda ilegível → e-mail "lembretes PARADOS". |

## Como funciona

São dois workflows independentes no n8n. Desde 13/10/2026, a pedido do cliente, a entrada é o WhatsApp oficial e o Telegram saiu ([D13](docs/DECISOES.md#d13-whatsapp-oficial-como-entrada-e-resposta-telegram-removido)).

### Workflow 1: Pedidos → Agenda (`workflow-naty-agenda.json`)

```
WhatsApp (número do robô) ───┐
Gmail ("pedidos-licitacao") ─┼─► Normalizar ─► Groq (IA) extrai os dados em JSON
Formulário (colar texto) ────┘   (autorizado?           │
                                  só texto?)            ▼
                          Validar em código: data válida, dia da semana, passado/futuro,
                          sem horário, encaminhada com "amanhã", IA incerta, urgência
                                                        │
              ┌──────────── falhou ─────────────────────┴──────────── ok ────────────┐
              ▼                                                                      ▼
  🚨 "NÃO agendei este pedido"                         Cria o evento no Google Agenda na hora:
  (áudio, IA, sem data, erro do Google)                • sem dúvida → verde
                                                       • dúvida real → ⚠️ VERIFICAR (vermelho)
                                                       • equipe convidada (convite do Google)
                                                                     │
                                                                     ▼
                                                       "✅ Agendado" ou "⚠️ Agendei, mas CONFIRA
                                                        a data", com a data por extenso

Respostas: no WhatsApp, na mesma conversa, se o pedido veio pelo WhatsApp.
           Por e-mail para a Naty se veio por e-mail/formulário, ou se o WhatsApp falhar.
```

### Workflow 2: Lembretes por e-mail (`workflow-naty-lembretes.json`)

```
A cada 10 min ─► lê a agenda (próximas 49h) ─► para cada evento do robô:
                                               chegou a hora do lembrete de 2 dias / 1 dia
                                               e ele ainda não foi enviado para ESTA data?
                                                       │ sim
                                                       ▼
                        um e-mail para a Naty + convidados ─► marca no próprio evento que enviou

Não conseguiu ler a agenda ─► 🚨 "lembretes PARADOS" por e-mail para a Naty (no máximo 1x por hora)
```

### Três princípios do desenho

1. **O evento nasce na hora, sem esperar ninguém.** Não há botão de confirmação: se ninguém ler a resposta, o serviço já está na agenda com os lembretes ativos. Dúvida sobre a data vira "evento vermelho", nunca "evento inexistente".
2. **A checagem de data crítica não depende da IA.** Dia da semana, passado/futuro, horário e urgência são calculados em código (`src/03_validar.js`) e testados.
3. **A agenda é a fonte da verdade dos lembretes.** O controle de "lembrete já enviado" fica gravado no próprio evento (`extendedProperties`), sem banco de dados extra.

Detalhes nó a nó em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). O porquê de cada escolha está em [`docs/DECISOES.md`](docs/DECISOES.md).

## Infraestrutura

| Peça | Serviço | Plano | Observação |
|---|---|---|---|
| Motor de automação | **n8n 2.42.5** no **Render** (`naty-n8n.onrender.com`) | Grátis (512 MB) | Construído a partir do `Dockerfile` deste repositório (versão fixada) |
| Banco do n8n | **Supabase** Postgres (projeto `naty-n8n`, us-west-1) | Grátis (500 MB) | Usuário e schema `n8n` exclusivos, via Session pooler |
| Manter acordado | **cron-job.org** → `GET /healthz` a cada 5 min | Grátis | Sem isso o Render desliga o n8n após 15 min |
| IA de extração | **Groq** (`openai/gpt-oss-120b`, modo `strict`) | Grátis | Troca de modelo em `src/02_montar_requisicao.js` |
| Entrada e resposta | **WhatsApp Cloud API** (oficial, da Meta) | Grátis para receber e responder | Número exclusivo do robô |
| Agenda e e-mail | **Google Agenda** + **Gmail** (OAuth2) | Grátis | Convites, respostas por e-mail, lembretes e alertas |

Custo mensal atual: **R$ 0**. Quando o plano grátis apertar, os upgrades estão em [`docs/OPERACAO.md`](docs/OPERACAO.md#quando-sair-do-plano-grátis).

**Custos do WhatsApp oficial:**

| O quê | Custo |
|---|---|
| Receber mensagens | Grátis |
| Responder dentro de 24h da mensagem recebida (é o que o robô faz) | Grátis |
| Mensagem iniciada pelo robô, ex.: lembrete no WhatsApp | Paga por mensagem (centavos) e exige modelo aprovado pela Meta. Fica para a próxima fase |
| Número | Precisa de um número exclusivo, que não esteja em uso no app do WhatsApp. Para testes, o número de teste grátis da Meta serve, mas só envia para até 5 destinatários verificados |

## Estrutura do repositório

```
.
├── README.md                              ← você está aqui
├── SETUP.md                               ← configurar credenciais, importar e testar os workflows
├── Dockerfile                             ← imagem do n8n usada pelo Render
├── workflow-naty-agenda.json              ← workflow 1 (GERADO por build.js, não editar à mão)
├── workflow-naty-lembretes.json           ← workflow 2 (GERADO por build.js, não editar à mão)
├── build.js                               ← gera os dois JSONs a partir de src/
├── src/                                   ← código dos nós "Code" do n8n
│   ├── 01_normalizar.js                   ·  W1: unifica WhatsApp/e-mail/formulário, números autorizados + CONFIG
│   ├── 02_montar_requisicao.js            ·  W1: prompt, esquema JSON e calendário para a IA
│   ├── 03_validar.js                      ·  W1: valida a data, decide VERIFICAR, monta evento e respostas
│   ├── 04_aviso_falha.js                  ·  W1: monta o aviso "NÃO agendado" (WhatsApp e e-mail)
│   ├── 10_lembretes_config.js             ·  W2: CONFIG + janela de busca
│   └── 11_calcular_lembretes.js           ·  W2: decide quais lembretes enviar agora e monta os e-mails
├── test/                                  ← testes da lógica (38 verificações)
├── deploy/
│   ├── RENDER.md                          ← hospedagem atual: Render + Supabase
│   ├── LEIA-ME.md                         ← alternativa: VPS / Oracle Cloud com Docker + Caddy
│   ├── docker-compose.yml, Caddyfile, .env.exemplo
└── docs/
    ├── ARQUITETURA.md                     ← cada nó, estados do evento, algoritmo dos lembretes
    ├── OPERACAO.md                        ← o que fazer quando chega um 🚨, logs, backup, custos
    └── DECISOES.md                        ← por que n8n, Groq, WhatsApp oficial, Render... e o que foi descartado
```

## Colocar no ar

Na ordem:

1. **Hospedagem do n8n:** [`deploy/RENDER.md`](deploy/RENDER.md). Já está criada; o guia serve para conferir ou recriar.
2. **Credenciais, importação e testes:** [`SETUP.md`](SETUP.md): Gmail, Google Agenda, Groq, app da Meta e número do WhatsApp, e o roteiro de testes.
3. **Rotina de operação:** [`docs/OPERACAO.md`](docs/OPERACAO.md).

## Desenvolvimento

Requer Node.js 18+.

```bash
npm install                        # instala o luxon (datas), usado só nos testes
npm test                           # roda os 38 testes (os dois arquivos abaixo)
node test/testar_validacao.js      # 25 testes: entradas (WhatsApp, e-mail, formulário), datas, VERIFICAR, respostas, avisos de falha
node test/testar_lembretes.js      # 13 testes: lembretes por e-mail, destinatários, remarcação, n8n fora do ar
npm run build                      # (= node build.js) gera workflow-naty-agenda.json e workflow-naty-lembretes.json
```

**Fluxo de trabalho:**

1. Edite o código em `src/` (lógica) ou a estrutura dos nós em `build.js`.
2. Rode os testes e o `build.js`. O `build.js` também confere que toda conexão aponta para um nó que existe e que toda resposta pelo WhatsApp tem a saída de erro ligada a um e-mail.
3. Reimporte o JSON gerado no n8n (Workflows → Import from File, substituindo o anterior) e reconfigure as credenciais dos nós. Depois de reimportar o workflow 1, **ative-o de novo**: é na ativação que o n8n registra o webhook do WhatsApp na Meta.

> ⚠️ **Os JSONs são gerados.** Se alguém editar um workflow direto na interface do n8n, a mudança **não** volta para este repositório: na próxima importação ela se perde. Ou se faz a mudança aqui, ou se exporta o workflow do n8n e a mudança é portada para `src/`/`build.js`.

**Como os testes funcionam:** cada arquivo de `src/` é executado fora do n8n, com `$input`, `$()` e `DateTime` simulados e o "agora" fixado em 07/10/2026 10:00 (horário de Brasília). Assim, os cenários de data são reprodutíveis.

> ⚠️ **Todo push na branch `main` refaz o deploy do n8n no Render** (alguns minutos fora do ar). Para mudanças só de documentação, veja [Build Filters em `docs/OPERACAO.md`](docs/OPERACAO.md#evitar-redeploy-a-cada-push).

## Segurança

- **Nenhuma senha, chave de API ou token fica neste repositório.** Credenciais do Google, do Groq e do WhatsApp (token de acesso e chave secreta do app da Meta) ficam **criptografadas dentro do n8n**. As variáveis do servidor (senha do banco, `N8N_ENCRYPTION_KEY`) ficam no **painel do Render**.
- A `N8N_ENCRYPTION_KEY` precisa ter **cópia fora do Render** (gerenciador de senhas). Sem ela, as credenciais salvas no n8n não podem ser recuperadas.
- O usuário `n8n` do banco só enxerga o próprio schema; ele não usa a senha mestre do Supabase.
- **WhatsApp só de números autorizados:** mensagem de número fora de `whatsapp_autorizados` é ignorada, sem resposta. O robô só recebe o que é mandado ao número dele.
- **Assinatura da Meta:** o n8n confere a assinatura `x-hub-signature-256` de cada chamada do webhook com a chave secreta do app, para aceitar só chamadas que vêm da Meta.
- Use um **token permanente** de Usuário do sistema da Meta, com acesso só ao WhatsApp. Quem tem o token consegue mandar mensagens pelo número do robô.
- Convites e lembretes por e-mail vão só para `emails_equipe` e convidados de eventos do robô; convidados de compromissos pessoais da agenda nunca recebem e-mail.
- O n8n tem acesso ao Gmail e à agenda da empresa: conta de dono com **senha forte e 2FA**.
- Repositório **privado**.

## Limitações conhecidas

1. **Não há confirmação explícita.** A conferência depende de alguém ler a resposta (data por extenso + trecho original + alertas). Uma data errada que nenhuma checagem perceba nasce verde.
2. **Mensagem encaminhada não traz a data original.** O WhatsApp não informa quando o cliente escreveu, então "amanhã" é calculado a partir do encaminhamento. Por isso esse caso vira `⚠️ VERIFICAR`. Datas escritas ("05/11") não têm esse problema.
3. **Só texto.** Áudio, imagem e documentos (ex.: PDF do edital) recebem "só leio mensagens de texto".
4. **Só entra o que é encaminhado ao robô,** o que chega com o rótulo do Gmail ou pelo formulário. Pedido que fica só na conversa com o cliente passa batido.
5. **Pedido duplicado:** a Meta pode reentregar a mesma mensagem (webhook). Hoje não há proteção, e o pedido viraria dois eventos.
6. **E-mail e alarme do Google Agenda são notificações,** podem ser silenciados ou cair no spam.
7. **Se o acesso ao Google cair** (Gmail e Agenda usam o mesmo app OAuth), os lembretes param e o e-mail de alerta "lembretes PARADOS" também não sai. Mitigação: publicar o app OAuth do Google (em modo *Testing* o login vence em 7 dias) e conferir as execuções toda semana.
8. **Remarcação pelo cliente cria um evento novo;** o antigo precisa ser apagado à mão.
9. **Plano grátis:** se o cron-job.org parar, o n8n dorme e os lembretes param. 512 MB de memória é o limite para o n8n.
10. **Groq (`gpt-oss-120b`) é mais fraco que modelos de ponta** para ler datas em português e escolher a data certa de um edital. É compensado pelo calendário enviado junto e pelas checagens em código, mas convém acompanhar as primeiras semanas.

## Próximos passos

- [ ] Primeiro teste ponta a ponta com credenciais reais (roteiro no `SETUP.md`)
- [ ] **Lembretes no WhatsApp** (mensagens de modelo aprovadas pela Meta, pagas por mensagem)
- [ ] **Transcrição de áudio** (Groq Whisper), para aceitar pedidos por áudio
- [ ] **Ler PDFs de edital** recebidos no WhatsApp ou por e-mail
- [ ] **Proteção contra pedido duplicado** (a Meta pode reentregar a mesma mensagem)
- [ ] Tabela "número/remetente → cliente", para preencher o contato automaticamente
- [ ] Resumo diário às 7h com os serviços do dia e do dia seguinte
- [ ] Detectar remarcação ("a sessão foi adiada") e atualizar o evento existente em vez de criar outro
- [ ] **Módulo de notas fiscais** (segundo sistema)

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
