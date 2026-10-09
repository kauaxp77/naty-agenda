# Operação

Manual do dia a dia: o que conferir, o que fazer quando chega um alerta, onde ver logs e como manter o sistema.

- [Painéis e endereços](#painéis-e-endereços)
- [Rotina semanal (5 minutos)](#rotina-semanal-5-minutos)
- [Quando chega um alerta](#quando-chega-um-alerta)
- [Problemas comuns](#problemas-comuns)
- [Deploy e atualização do n8n](#deploy-e-atualização-do-n8n)
- [Senhas e chaves](#senhas-e-chaves)
- [Backup e recuperação](#backup-e-recuperação)
- [Limites do plano grátis](#limites-do-plano-grátis)
- [Quando sair do plano grátis](#quando-sair-do-plano-grátis)

---

## Painéis e endereços

| O quê | Onde |
|---|---|
| n8n (editor e execuções) | https://naty-n8n.onrender.com |
| Serviço no Render | https://dashboard.render.com/web/srv-db3ra6jtqb8s73f3t9lg |
| Banco no Supabase | https://supabase.com/dashboard/project/umbtzzxqcblurjthpydg |
| Repositório | https://github.com/kauaxp77/naty-agenda |
| Monitor de disponibilidade | https://cron-job.org (tarefa batendo em `/healthz`) |
| Chave da IA | https://console.groq.com |
| Bot do Telegram | @BotFather → o bot da Naty |

## Rotina semanal (5 minutos)

1. **cron-job.org:** o histórico da tarefa `/healthz` está todo verde? Um vermelho isolado é normal (reinício do Render); vários seguidos, não.
2. **n8n → Executions:** filtre por **Error**. Execução com erro sem ter gerado um 🚨 é sinal de algo novo.
3. **Agenda:** há eventos `⏳ [A CONFIRMAR]` com mais de 1 dia? Não deveria haver: depois de 24h eles viram ✅ ou ⚠️. Se houver, o workflow 1 parou no meio.
4. **Agenda:** há eventos `⚠️ VERIFICAR` com a data ainda não conferida? Conferir com o cliente.

## Quando chega um alerta

### 🚨 "Pedido NÃO agendado — agende manualmente"
O robô recebeu o pedido mas não conseguiu agendar. A mensagem traz o **motivo** e o **texto original**.

1. **Agende à mão agora**, com base no texto original.
2. Veja o motivo:
   - *"não identificou um pedido"* / *"Não consegui identificar a data"*: o texto não tinha data clara. Confirme a data com o cliente.
   - *"Falha na chamada à IA"* com `429` / `rate_limit`: limite do plano grátis do Groq (e-mail muito longo, ou muitos pedidos no mesmo minuto). Se acontecer com frequência, veja [Limites](#limites-do-plano-grátis).
   - *"Falha na chamada à IA"* com `401`: a chave do Groq expirou ou foi revogada. Crie outra e atualize a credencial no n8n.
   - *"erro ao criar o evento no Google Agenda"*: veja [Google desconectado](#google-desconectado).
3. Se o evento criado à mão estiver no calendário pessoal e o workflow 2 estiver com `apenas_eventos_do_robo: true`, ele **não terá lembretes no Telegram**, só os do app do Google Agenda. Alternativa: colar o texto no formulário de novo quando o problema for resolvido.

### 🚨 "Os lembretes estão PARADOS"
O workflow 2 não conseguiu ler a Agenda Google. **Enquanto isso, nenhum lembrete do Telegram sai.** Os lembretes do app do Google Agenda continuam funcionando.

1. Abra o n8n → Executions do workflow "Lembretes no Telegram" → a execução com erro → nó "Ler agenda".
2. Causas comuns:
   - `401` / `invalid_grant`: login do Google expirou. Veja [Google desconectado](#google-desconectado).
   - `404`: `calendario_id` errado no nó "Configuração".
3. Depois de corrigir, rode o workflow manualmente uma vez. Os lembretes atrasados saem em **uma** mensagem.

### ✉️ E-mail do cron-job.org: "falhou"
O n8n não respondeu ao `/healthz`, então **nada está rodando**: nem pedidos, nem lembretes.

1. Render → serviço `naty-n8n` → **Events**: houve deploy com falha? O serviço foi suspenso?
2. Render → **Logs**: procure `Out of memory`, `ECONNREFUSED`, `password authentication failed`, `Timed Out`.
3. Veja [O n8n não sobe](#o-n8n-não-sobe).

### ⚠️ "Corrija na agenda"
A Naty tocou em "Está errado" ou não respondeu em 24h. Abra o evento pelo link, corrija data e hora e salve. Os lembretes se ajustam sozinhos. Opcional: trocar o título para tirar o `⚠️ VERIFICAR:`.

## Problemas comuns

### O n8n não sobe
| Sintoma nos logs do Render | Causa | Solução |
|---|---|---|
| `429 Too Many Requests` ao baixar a imagem | Limite do registro de imagens | O `Dockerfile` já usa o Docker Hub (`n8nio/n8n`). Se o Docker Hub também limitar, aguarde e rode **Manual Deploy**. |
| `No open ports detected` … `Timed Out`, sem erro | n8n travou antes de abrir a porta | Veja se ele conectou no banco: no Supabase, `select state, query from pg_stat_activity where usename = 'n8n'`. Veja o histórico em [`DECISOES.md`](DECISOES.md#d10-o-n8n-cria-o-próprio-schema-no-banco). |
| `password authentication failed for user "n8n"` | Senha errada na variável `DB_POSTGRESDB_PASSWORD` | Corrija no Render ou troque a senha (veja [Senhas e chaves](#senhas-e-chaves)). |
| `ENOTFOUND` / `ENETUNREACH` no host do banco | Host errado, ou conexão direta (IPv6) em vez do pooler | Use o host do **Session pooler**, porta 5432, usuário `n8n.umbtzzxqcblurjthpydg`. |
| `Tenant or user not found` | Usuário sem o sufixo `.umbtzzxqcblurjthpydg` | O pooler exige `usuario.ID-do-projeto`. |
| `Task runner connection attempt failed: invalid or expired grant token` | O executor dos nós de código demorou mais que o prazo para iniciar (CPU fraca) | Aumentar `N8N_RUNNERS_GRANT_TOKEN_TTL` (hoje `180`). Sem o runner, **os nós Code falham** e os dois workflows param. |
| Página 502 por 1–2 min; em **Events**: *server_failed · oomKilled 512Mi* (não aparece nos logs do app) | 512 MB não bastaram | Reinicia sozinho. Se for frequente, veja [Quando sair do plano grátis](#quando-sair-do-plano-grátis). |
| `JavaScript heap out of memory` nos logs | O limite de memória do processo (`NODE_OPTIONS`) ficou baixo demais | Subir `--max-old-space-size` (hoje 300), sem passar de ~380 no plano grátis |

### Google desconectado
Credenciais OAuth do Google podem expirar. No n8n: **Credentials** → "Google Calendar OAuth2" / "Gmail OAuth2" → **Reconnect**.

> Se o projeto no Google Cloud estiver em modo **Testing**, o login cai **a cada 7 dias**. Em *OAuth consent screen*, clique em **Publish app** para passar a *In production* (veja o `SETUP.md`, passo 4).

### A confirmação não chegou no Telegram
- A Naty mandou `/start` para o bot? Sem isso o bot não consegue escrever.
- O `telegram_chat_id` no nó "Normalizar entrada" está certo?
- O n8n tentou e caiu na reserva? Nesse caso a confirmação foi por **e-mail**.
- Os botões abrem o navegador em vez de responder no chat? O n8n não está em HTTPS público. Confira `WEBHOOK_URL` no Render.

### Editar um workflow direto no banco
**Não edite** `n8n.workflow_entity` com o editor do n8n aberto: o **autosave** da aba aberta sobrescreve a mudança segundos depois, mesmo trocando o `versionId` (aconteceu em 09/10/2026). Se precisar mesmo editar pelo banco, feche antes todas as abas do workflow e só reabra depois da alteração. O caminho normal é editar pelo editor, ou por `src/` + `build.js` e reimportar.

### O lembrete não chegou
- O evento tem `naty_bot = 1`? Só eventos criados pelo robô recebem lembrete quando `apenas_eventos_do_robo = true`.
- O n8n estava dormindo? Veja o histórico do cron-job.org.
- Execução do workflow 2 com erro? Veja n8n → Executions.

## Deploy e atualização do n8n

- **Como o serviço é construído:** o Render clona este repositório e constrói o `Dockerfile` (`FROM n8nio/n8n:2.42.5`). Toda a configuração vem das variáveis de ambiente do serviço.
- **Deploy automático:** **todo push na `main`** refaz o deploy, e o n8n fica alguns minutos fora do ar. A primeira subida num banco vazio leva ~5 min (migrações); as seguintes, ~2–4 min.
- **Mudou uma variável de ambiente?** O Render refaz o deploy sozinho.

### Evitar redeploy a cada push
Render → serviço → **Settings → Build & Deploy → Build Filters → Included Paths**: `Dockerfile`. Assim só uma mudança no `Dockerfile` refaz o deploy; documentação e workflows (que são importados à mão no n8n) não derrubam o serviço.

### Atualizar o n8n
A versão está **fixada** no `Dockerfile` (`n8nio/n8n:2.42.5`). Para atualizar:
1. Leia as notas da versão nova (docs.n8n.io → Release notes), procurando mudanças nos nós Gmail, Telegram, Code, HTTP Request e Schedule.
2. Troque a versão no `Dockerfile`, faça o commit e o push. O deploy roda sozinho.
3. Nos logs, confira `Version: …`, `Editor is now accessible` e a **ausência** de `Task runner connection attempt failed`.
4. Rode o roteiro de testes do `SETUP.md` (passo 8).

### Health check
Render → **Settings → Health Check Path**: `/healthz`. Com isso, o Render só troca a versão antiga pela nova quando a nova responde, e reinicia o n8n se ele travar.

## Senhas e chaves

| Segredo | Onde fica | Como trocar |
|---|---|---|
| Senha do usuário `n8n` no banco | Render → variável `DB_POSTGRESDB_PASSWORD` | No Supabase (SQL Editor): `alter role n8n with password 'NOVA_SENHA';` → atualizar a variável no Render → deploy |
| `N8N_ENCRYPTION_KEY` | Render → variável + **cópia no gerenciador de senhas** | ⚠️ Trocar **invalida todas as credenciais salvas no n8n** (Google, Groq, Telegram), que precisam ser recriadas. Só é barato **antes** de criar as credenciais. |
| Chave do Groq | Credencial "Header Auth" dentro do n8n | console.groq.com → nova chave → atualizar a credencial |
| Token do bot do Telegram | Credencial "Telegram API" dentro do n8n | @BotFather → `/revoke` → atualizar a credencial |
| Google (Gmail/Agenda) | Credenciais OAuth2 dentro do n8n | Reconnect |
| Conta de dono do n8n | Você | Senha forte + 2FA (Settings → Personal) |

## Backup e recuperação

| O quê | Onde está a cópia | Se perder |
|---|---|---|
| Workflows | **Este repositório** (`workflow-*.json`, gerados de `src/`) | Reimportar |
| Credenciais (Google, Groq, Telegram) | Só no banco, criptografadas com a `N8N_ENCRYPTION_KEY` | Recriar (uns 15 min, seguindo o `SETUP.md`) |
| `N8N_ENCRYPTION_KEY` | Render + gerenciador de senhas | Credenciais precisam ser recriadas |
| Eventos e status de lembretes | **Google Agenda** (fica fora do n8n) | Não se perdem se o n8n cair |
| Histórico de execuções | Banco, 3 dias | Não é crítico |

O plano grátis do Supabase **não tem backup automático** que se possa baixar. Como os workflows estão no git e os eventos ficam no Google Agenda, perder o banco custa só recriar credenciais e a conta de dono.

**Recriar tudo do zero:** banco (veja o `deploy/RENDER.md`) → serviço no Render com as mesmas variáveis → conta de dono → credenciais e importação (veja o `SETUP.md`).

## Limites do plano grátis

| Serviço | Limite | O que acontece se estourar |
|---|---|---|
| Render (free) | 750 h/mês **por conta**, 512 MB, dorme após 15 min sem acesso | Acabou a cota: serviço suspenso até o mês virar. **Mantenha só um serviço grátis ativo** (o `Beto_Banco` está suspenso). |
| Supabase (free) | 500 MB de banco, 2 projetos ativos, projeto pausa após 7 dias sem uso | O n8n usa o banco o tempo todo, então não pausa. Histórico de execuções limitado a 3 dias para caber. |
| Groq (free, `gpt-oss-120b`) | ~30 req/min, ~1.000 req/dia, ~8.000 tokens/min | Pedido vira 🚨 "NÃO agendado" após 3 tentativas |
| cron-job.org | Grátis | Se a conta for desativada, o n8n dorme |

## Quando sair do plano grátis

| Sinal | Upgrade | Custo aproximado |
|---|---|---|
| Dorme mesmo com o cron-job.org, ou está lento demais | Render **Starter** (não dorme, mais CPU). ⚠️ Continua com **512 MB**: não resolve falta de memória | ~US$ 7/mês |
| n8n encerrado por falta de memória com frequência | **VPS** com o `deploy/LEIA-ME.md` (2–4 GB por ~R$ 30/mês) ou Render Standard (2 GB) | ~R$ 30/mês ou US$ 25/mês |
| Muitos 🚨 por limite do Groq | Plano pago do Groq (Developer), ou trocar o modelo | centavos por pedido |
| Quer backup automático do banco | Supabase Pro | US$ 25/mês |
