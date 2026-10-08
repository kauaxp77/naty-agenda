# n8n no Render (grátis) + banco no Supabase (grátis)

```
Render (grátis, 512 MB)  ──── banco ────►  Supabase Postgres (grátis, 500 MB)
  n8n em https://NOME.onrender.com          workflows, credenciais, histórico
        ▲
        │ GET /healthz a cada 5 min  (sem isso o Render põe o n8n para dormir)
  cron-job.org (grátis)
```

## Por que cada peça

| Peça | Motivo |
|---|---|
| **Supabase** em vez do Postgres do Render | O Postgres grátis do Render **expira** (30 a 90 dias) e apaga workflows e credenciais. |
| **cron-job.org** | O Render desliga o serviço grátis após **15 min sem acesso**. Desligado, o n8n não lê o Gmail nem manda lembretes. |
| `N8N_ENCRYPTION_KEY` fixa | O disco do Render é apagado a cada reinício. Sem a chave fixa, as credenciais salvas viram lixo. |
| `NODE_OPTIONS=--max-old-space-size=380` | O plano grátis tem 512 MB. Isso faz o n8n limpar memória antes de o Render matá-lo. |
| Histórico de execuções curto (3 dias) | O banco grátis do Supabase tem 500 MB. |

## Riscos que continuam (leia antes)
1. **Se o cron-job.org falhar** (conta desativada, site fora), o n8n dorme e os lembretes param. Ao acordar, o workflow de lembretes manda **um** aviso atrasado com o tempo real que falta, mas, se ele acordar só depois do evento, o lembrete já se perdeu.
2. **512 MB é o limite para o n8n.** Se o Render matar o processo por falta de memória (aparece "Out of memory" nos logs), o serviço reinicia sozinho. Se isso virar rotina, o plano Starter do Render (~US$7/mês) resolve.
3. **O Render pode reiniciar serviços grátis a qualquer momento.** Com banco externo e chave fixa, nada se perde; só há alguns minutos fora do ar.
4. **O banco do Supabase fica nos EUA**, e o Render também (Oregon). A distância não afeta lembretes de horas ou dias.

## Passo a passo

### 1. Banco (Supabase) ✅ já criado
Projeto **`naty-n8n`** (ID `umbtzzxqcblurjthpydg`, região us-west-1), com usuário `n8n` e schema `n8n` próprios, separados dos seus outros projetos.

No painel do Supabase: projeto → botão **Connect** → **Session pooler**. Anote o **host** (algo como `aws-0-us-west-1.pooler.supabase.com`) e a porta `5432`.
> Use o **Session pooler**, não a conexão direta (`db.xxx.supabase.co`): a direta só funciona por IPv6, e o Render não sai por IPv6.

### 2. Serviço no Render
https://dashboard.render.com → **New → Web Service** → **Existing Image**:
- Image URL: `docker.n8n.io/n8nio/n8n:stable`
- Name: `naty-n8n` (vira `https://naty-n8n.onrender.com`; se o nome estiver ocupado, anote o endereço que o Render der)
- Region: **Oregon**
- Instance type: **Free**
- Em **Advanced**, coloque **Health Check Path** = `/healthz`
- Environment Variables: as da tabela abaixo

| Chave | Valor |
|---|---|
| `DB_TYPE` | `postgresdb` |
| `DB_POSTGRESDB_HOST` | host do Session pooler (passo 1) |
| `DB_POSTGRESDB_PORT` | `5432` |
| `DB_POSTGRESDB_DATABASE` | `postgres` |
| `DB_POSTGRESDB_USER` | `n8n.<ID-DO-PROJETO>` (o ponto e o ID são obrigatórios no pooler) |
| `DB_POSTGRESDB_PASSWORD` | senha do usuário `n8n` |
| `DB_POSTGRESDB_SCHEMA` | `n8n` |
| `DB_POSTGRESDB_SSL_ENABLED` | `true` |
| `DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED` | `false` |
| `N8N_ENCRYPTION_KEY` | gere com `openssl rand -hex 32` e **guarde uma cópia fora do Render** |
| `N8N_PORT` | `5678` |
| `PORT` | `5678` |
| `N8N_PROTOCOL` | `https` |
| `N8N_HOST` | `naty-n8n.onrender.com` |
| `WEBHOOK_URL` | `https://naty-n8n.onrender.com/` |
| `N8N_PROXY_HOPS` | `1` |
| `GENERIC_TIMEZONE` | `America/Sao_Paulo` |
| `TZ` | `America/Sao_Paulo` |
| `NODE_OPTIONS` | `--max-old-space-size=380` |
| `EXECUTIONS_DATA_PRUNE` | `true` |
| `EXECUTIONS_DATA_MAX_AGE` | `72` |
| `N8N_DIAGNOSTICS_ENABLED` | `false` |

Clique em **Deploy**. A primeira subida leva alguns minutos. Nos logs, espere `Editor is now accessible via`. Abra `https://naty-n8n.onrender.com`, crie a conta de dono com **senha forte** e ative a **verificação em duas etapas**.

### 3. Manter acordado (cron-job.org)
1. Crie a conta em https://cron-job.org (grátis).
2. **Create cronjob**: URL `https://naty-n8n.onrender.com/healthz`, a cada **5 minutos**.
3. Em **Notifications**, ative o aviso por e-mail **quando falhar**. É o seu alarme de "o n8n caiu".

### 4. Conferir
- Workflow 1 → nó "Formulário: colar pedido": a URL de produção deve começar com `https://naty-n8n.onrender.com/`.
- Deixe o serviço parado 30 min sem abrir nada e veja no Render (aba **Events**) se ele **não** foi desligado ("spun down"). Se foi, o cron-job.org não está batendo.
- Depois siga o `SETUP.md` normalmente.
