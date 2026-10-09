# Hospedagem: Render (grátis) + Supabase (grátis)

```
GitHub (kauaxp77/naty-agenda) ──push na main──► Render: constrói o Dockerfile (n8nio/n8n:2.42.5)
                                                   │
                                                   ▼
                              n8n em https://naty-n8n.onrender.com  (free, 512 MB)
                                   ▲                     │
     GET /healthz a cada 5 min ────┘                     │ Postgres via Session pooler (SSL)
     (cron-job.org; sem isso o Render                    ▼
      desliga o n8n após 15 min)            Supabase: projeto naty-n8n (us-west-1)
                                            usuário n8n · schema n8n
```

## O que já existe

| Recurso | Identificação |
|---|---|
| Serviço Render | `naty-n8n` · `srv-db3ra6jtqb8s73f3t9lg` · região Oregon · plano Free · auto-deploy da branch `main` |
| Endereço | https://naty-n8n.onrender.com |
| Projeto Supabase | `naty-n8n` · ID `umbtzzxqcblurjthpydg` · região us-west-1 |
| Usuário do banco | `n8n` (no pooler: `n8n.umbtzzxqcblurjthpydg`), com permissão para criar o próprio schema |
| Schema | `n8n` (criado pelo n8n no primeiro start, 148 tabelas) · `n8n_antigo` é um resto vazio e pode ser apagado (`drop schema n8n_antigo;`) |
| Versão do n8n | 2.42.5 (fixada no `Dockerfile`) |

## Por que cada peça

| Peça | Motivo |
|---|---|
| **Supabase** em vez do Postgres do Render | O Postgres grátis do Render **expira** (30 a 90 dias) e apaga workflows e credenciais. |
| **Session pooler**, porta 5432 | A conexão direta do Supabase é só IPv6, e o Render não sai por IPv6. O *Transaction pooler* (6543) não serve para o n8n. |
| **cron-job.org** | O Render desliga o serviço grátis após **15 min sem acesso**. Desligado, o n8n não lê o Gmail nem manda lembretes. |
| `N8N_ENCRYPTION_KEY` fixa | O disco do Render é apagado a cada deploy/reinício. Sem a chave fixa, as credenciais salvas viram lixo. |
| Memória limitada nos dois processos (`NODE_OPTIONS=--max-old-space-size=300`, `N8N_RUNNERS_MAX_OLD_SPACE_SIZE=96`) e recursos desligados (templates, avisos de versão, personalização, IA do n8n, API pública) | O plano grátis tem 512 MB e o n8n já foi encerrado por falta de memória durante testes (09/10/2026). Ver `docs/DECISOES.md`, D12. |
| Histórico de execuções de 3 dias | O banco grátis do Supabase tem 500 MB. |
| Imagem do **Docker Hub**, versão fixa | O registro `docker.n8n.io` devolveu 429 nos builds do Render (ver `docs/DECISOES.md`, D9). Versão fixa evita atualização surpresa a cada push. |
| `N8N_RUNNERS_GRANT_TOKEN_TTL=180` | Com a CPU mínima do plano grátis, o executor dos nós de código leva ~36 s para iniciar e perdia o prazo padrão de 30 s. Sem ele, **nenhum nó Code roda** (ver D11). |

## Variáveis de ambiente do serviço

Configuradas no Render (Environment). Os **valores secretos não ficam neste repositório**.

| Chave | Valor |
|---|---|
| `DB_TYPE` | `postgresdb` |
| `DB_POSTGRESDB_HOST` | `aws-0-us-west-1.pooler.supabase.com` |
| `DB_POSTGRESDB_PORT` | `5432` |
| `DB_POSTGRESDB_DATABASE` | `postgres` |
| `DB_POSTGRESDB_USER` | `n8n.umbtzzxqcblurjthpydg` |
| `DB_POSTGRESDB_PASSWORD` | 🔒 (gerenciador de senhas) |
| `DB_POSTGRESDB_SCHEMA` | `n8n` |
| `DB_POSTGRESDB_SSL_ENABLED` | `true` |
| `DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED` | `false` |
| `N8N_ENCRYPTION_KEY` | 🔒 (gerenciador de senhas) |
| `N8N_PORT` / `PORT` | `5678` |
| `N8N_PROTOCOL` | `https` |
| `N8N_HOST` | `naty-n8n.onrender.com` |
| `WEBHOOK_URL` | `https://naty-n8n.onrender.com/` |
| `N8N_PROXY_HOPS` | `1` |
| `GENERIC_TIMEZONE` / `TZ` | `America/Sao_Paulo` |
| `NODE_OPTIONS` | `--max-old-space-size=300` |
| `N8N_RUNNERS_MAX_OLD_SPACE_SIZE` | `96` |
| `N8N_TEMPLATES_ENABLED` | `false` |
| `N8N_VERSION_NOTIFICATIONS_ENABLED` | `false` |
| `N8N_PERSONALIZATION_ENABLED` | `false` |
| `N8N_AI_ENABLED` | `false` |
| `N8N_PUBLIC_API_DISABLED` | `true` |
| `EXECUTIONS_DATA_PRUNE` | `true` |
| `EXECUTIONS_DATA_MAX_AGE` | `72` |
| `N8N_DIAGNOSTICS_ENABLED` | `false` |
| `N8N_RUNNERS_GRANT_TOKEN_TTL` | `180` |

> Se o endereço do serviço mudar, atualize **`N8N_HOST` e `WEBHOOK_URL`** juntos. Com eles errados, o formulário e os botões do Telegram apontam para o lugar errado.

## Passos que faltam (no painel)

1. **Health check:** Render → `naty-n8n` → **Settings → Health Check Path** = `/healthz`.
2. **Build Filters:** **Settings → Build & Deploy → Build Filters → Included Paths** = `Dockerfile`. Sem isso, qualquer push na `main` (até de documentação) reinicia o n8n.
3. **Conta de dono:** abra https://naty-n8n.onrender.com, crie a conta com **senha forte** e ative a **verificação em duas etapas** (Settings → Personal).
4. **cron-job.org:** crie a conta, depois **Create cronjob** com URL `https://naty-n8n.onrender.com/healthz`, a cada **5 minutos**, com aviso por e-mail **quando falhar**. Esse aviso é o alarme de "o n8n caiu".
5. Siga o [`SETUP.md`](../SETUP.md) para credenciais, importação e testes.

## Conferir que está tudo certo

- Render → **Logs**: aparece `Editor is now accessible via: https://naty-n8n.onrender.com`.
- Render → **Logs**: **não** aparece `Task runner connection attempt failed`. Se aparecer, os nós de código não rodam (veja `docs/OPERACAO.md`).
- Workflow 1 → nó "Formulário: colar pedido": a URL de produção começa com `https://naty-n8n.onrender.com/`.
- Deixe o n8n 30 min sem abrir e veja em Render → **Events** que ele **não** foi desligado ("spun down"). Se foi, o cron-job.org não está batendo.

## Riscos que continuam

1. **Se o cron-job.org falhar,** o n8n dorme e os lembretes param. Ao acordar, o workflow 2 manda **um** aviso atrasado com o tempo real que falta; se acordar depois do evento, o lembrete se perdeu.
2. **512 MB é o limite para o n8n.** O Render encerra o processo quando passa disso (aparece em **Events** como *Server failed: out of memory*) e reinicia sozinho em 1–2 min. Se for frequente, **o plano Starter não resolve** (também tem 512 MB): a saída é o Standard (2 GB) ou uma VPS (`deploy/LEIA-ME.md`).
3. **O Render pode reiniciar serviços grátis a qualquer momento.** Com banco externo e chave fixa, nada se perde; ficam alguns minutos fora do ar.
4. **750 horas grátis por mês valem para a conta inteira.** Mantenha só um serviço grátis ativo (o `Beto_Banco` está suspenso).

## Recriar do zero

1. **Supabase:** novo projeto. No SQL Editor:
   ```sql
   create role n8n with login password 'SENHA_FORTE';
   grant n8n to postgres;
   grant create on database postgres to n8n;
   alter role n8n set search_path = n8n;
   -- não crie o schema n8n à mão (ver docs/DECISOES.md, D10)
   ```
   Host do pooler: projeto → **Connect → Direct → Session pooler**.
2. **Render:** New → Web Service → este repositório (Docker, Dockerfile na raiz), região Oregon, plano Free, as variáveis acima (gere a chave com `openssl rand -hex 32` e **guarde uma cópia**).
3. Os passos da seção "Passos que faltam".
