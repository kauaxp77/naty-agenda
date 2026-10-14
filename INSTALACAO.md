# Guia de instalação (do zero)

Roteiro para montar o sistema inteiro numa conta nova, por exemplo para outro cliente: banco, n8n no ar, integrações, workflows e testes. Cada etapa aponta para o guia detalhado e termina com uma conferência. **Não avance enquanto a conferência falhar.**

Tempo total: cerca de 3 horas, mais a espera da Meta (aprovação do nome de exibição e, se for o caso, verificação da empresa).

## 0. Antes de começar

| Conta / item | Para quê | Custo |
|---|---|---|
| GitHub | Sua cópia deste repositório: o Render constrói a partir dela | grátis |
| [Supabase](https://supabase.com) | Banco do n8n (Postgres) | grátis |
| [Render](https://render.com) | Servidor do n8n (Docker, 512 MB) | grátis |
| [cron-job.org](https://cron-job.org) | Mantém o n8n acordado e avisa quando ele cai | grátis |
| Google Cloud | Login do n8n no Gmail e no Google Agenda | grátis |
| [Groq](https://console.groq.com) | IA que extrai os dados do pedido | grátis (com limite por minuto) |
| Meta: **portfólio empresarial do cliente** | WhatsApp oficial (app, número, token) | respostas em até 24 h são grátis |
| Um **chip novo** | Número do robô (não pode estar no app do WhatsApp) | o do chip |
| Node.js 18+ (opcional) | Rodar os testes e gerar os workflows (`npm test`, `npm run build`) | grátis |

O WhatsApp fica no portfólio **do cliente**, com você como administrador. Assim, se você sair do projeto, o número continua com ele, e um bloqueio na sua conta pessoal da Meta não o afeta (ver `ENTREGA.md`).

## 1. Sua cópia do repositório (10 min)

1. Crie um repositório seu com este conteúdo (fork, *Use this template* ou um push da `main`).
2. Escolha o nome do serviço no Render, por exemplo `cliente-n8n`. O endereço do n8n será `https://cliente-n8n.onrender.com`. Ele aparece nas variáveis de ambiente (etapa 3) e na URL de retorno do Google (etapa 5).
3. Se quiser, troque o "Naty" dos nomes dos workflows em `build.js` e rode `npm install && npm run build`. A chave `email_naty` do `CONFIG` pode ficar com esse nome: é só o e-mail que recebe os avisos.

## 2. Banco no Supabase (10 min)

Novo projeto e o SQL de [`deploy/RENDER.md` → Recriar do zero](deploy/RENDER.md#recriar-do-zero): usuário `n8n` com senha forte, **sem** criar o schema à mão (o n8n cria; ver `docs/DECISOES.md`, D10). Anote o host do *Session pooler* (projeto → Connect).

**Conferência:** o usuário `n8n` existe (`select rolname from pg_roles where rolname = 'n8n'`).

## 3. n8n no Render (20 min)

1. Render → **New → Web Service** → sua cópia → Docker (o `Dockerfile` da raiz) → plano **Free**.
2. Variáveis de ambiente: a tabela de [`deploy/RENDER.md`](deploy/RENDER.md#variáveis-de-ambiente-do-serviço), trocando host, usuário do banco e endereço do serviço pelos seus. Gere a chave com `openssl rand -hex 32` e **guarde uma cópia fora do Render**: sem ela, as credenciais salvas no n8n viram lixo.
3. **Settings:** Health Check Path = `/healthz`; **Build Filters → Included Paths** = `Dockerfile`. Sem o filtro, qualquer commit de documentação reinicia o n8n. Salvar essas configurações reinicia o serviço uma vez.

**Conferência:** nos Logs, aparece `Editor is now accessible via: https://…` e **não** aparece `Task runner connection attempt failed`.

## 4. Conta de dono e "despertador" (10 min)

1. Abra o endereço do n8n e crie a conta de dono com senha forte. Ative a verificação em duas etapas (Settings → Personal).
2. cron-job.org: chamar `https://<serviço>.onrender.com/healthz` a cada **5 minutos**, com e-mail **quando falhar**. Sem isso, o Render desliga o n8n depois de 15 minutos parado, e os lembretes param.

**Conferência:** depois de 30 minutos sem abrir o n8n, o Render → Events **não** mostra "spun down".

## 5. Integrações (1 h 30)

Siga o [`SETUP.md`](SETUP.md), passos 1 a 6, **no portfólio do cliente**:

| Passo do SETUP | O quê | Atenção |
|---|---|---|
| 1 e 12 | App do WhatsApp na Meta e número próprio | Com o chip novo. Erro `133010`: registrar o número (`ENTREGA.md`, etapa 1.3) |
| 2 | Token permanente (usuário do sistema) | Validade **Nunca**. O token não sai da credencial do n8n |
| 4 | Chave do Groq (credencial Header Auth) | `Bearer ` + a chave |
| 5 | Google: projeto, APIs, cliente OAuth | Redirect URI com o **seu** endereço. **Publique o app** (veja abaixo) |
| 6 | Credenciais do WhatsApp no n8n | Duas: OAuth (receber) e API (enviar) |

**Publicar o app do Google** (senão o login vence a cada 7 dias e tudo para):
1. Na sua cópia, ligue o GitHub Pages: Settings → Pages → `main`, pasta `/docs`. Antes, ajuste em `docs/index.html` e `docs/privacidade.html` o nome do cliente e o contato.
2. Google Auth Platform → Branding: página inicial e política de privacidade do seu GitHub Pages; domínio autorizado `<usuário>.github.io`; **sem logotipo**.
3. Público-alvo → **Publicar app**. **Depois disso**, faça o login no n8n (Sign in with Google) com a **conta do cliente**.

**Conferência:** as credenciais aparecem verdes ao salvar, e o Público-alvo mostra **Em produção**.

## 6. Workflows (20 min)

[`SETUP.md`](SETUP.md), passos 7 a 9:

1. Importe `workflow-naty-agenda.json` e `workflow-naty-lembretes.json`.
2. Edite o `CONFIG` dos nós "Normalizar entrada" e "Configuração": e-mail do cliente, números autorizados, e-mails da equipe e calendário.
3. Selecione as credenciais em cada nó. No formulário, use a credencial **Basic Auth**: o endereço dele está no código público.
4. Ative os dois workflows. Depois ligue a conta do WhatsApp ao app: `POST <ID da conta>/subscribed_apps` (SETUP, passo 9).

**Conferência:** mande `oi` do seu WhatsApp (número autorizado) para o número do robô. Deve chegar o menu com os botões.

## 7. Celular do cliente e testes (40 min)

[`SETUP.md`](SETUP.md), passos 10 e 11: app Google Agenda com notificações liberadas, número do robô salvo, e o roteiro de mensagens de teste (pedido normal, conflito de data, encaminhada com "amanhã", áudio, `agenda`, `oi`). Apague os eventos de teste no final.

**Conferência:** evento verde na agenda do cliente, alarme no celular dele e, no dia seguinte, o e-mail de lembrete.

## 8. Entregar

O roteiro de entrega e o guia de uso estão em [`ENTREGA.md`](ENTREGA.md) e [`docs/apresentacao/`](docs/apresentacao/LEIA-ME.md). Troque no guia o número do robô e o contato de suporte.

## Se algo der errado

[`docs/OPERACAO.md`](docs/OPERACAO.md): alertas, problemas comuns (WhatsApp, Google, Render), backup e os limites do plano grátis. Por que cada peça foi escolhida: [`docs/DECISOES.md`](docs/DECISOES.md).
