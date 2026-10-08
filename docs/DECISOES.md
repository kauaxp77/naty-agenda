# Registro de decisões

O porquê de cada escolha técnica, as alternativas descartadas e o preço pago por cada decisão. Ao mudar uma delas, registre aqui a nova decisão e o motivo.

| # | Decisão | Status |
|---|---|---|
| D1 | [n8n como motor da automação](#d1-n8n-como-motor-da-automação) | Em vigor |
| D2 | [Criar o evento antes da confirmação](#d2-criar-o-evento-antes-da-confirmação) | Em vigor |
| D3 | [Checagens de data em código, não na IA](#d3-checagens-de-data-em-código-não-na-ia) | Em vigor |
| D4 | [Agenda como fonte da verdade dos lembretes](#d4-agenda-como-fonte-da-verdade-dos-lembretes) | Em vigor |
| D5 | [Groq no lugar do Claude](#d5-groq-no-lugar-do-claude) | Em vigor |
| D6 | [Telegram para a Naty; WhatsApp só para clientes, depois](#d6-telegram-para-a-naty-whatsapp-só-para-clientes-depois) | Em vigor |
| D7 | [Workflows gerados por código (`src/` + `build.js`)](#d7-workflows-gerados-por-código-src--buildjs) | Em vigor |
| D8 | [Hospedagem: Render grátis + Supabase](#d8-hospedagem-render-grátis--supabase) | Em vigor |
| D9 | [Imagem do n8n pelo Docker Hub](#d9-imagem-do-n8n-pelo-docker-hub) | Em vigor |
| D10 | [O n8n cria o próprio schema no banco](#d10-o-n8n-cria-o-próprio-schema-no-banco) | Em vigor |
| D11 | [Prazo maior para o executor dos nós de código](#d11-prazo-maior-para-o-executor-dos-nós-de-código) | Em vigor |

---

## D1. n8n como motor da automação
**Contexto:** processo contínuo (roda 24h, reage a e-mails e horários), primeiro projeto de automação da empresa.
**Decisão:** n8n.
**Alternativas descartadas:**
- **Manus AI:** bom para tarefas pontuais, não para um processo que precisa rodar sozinho e de forma previsível 24h.
- **OpenClaw (agente com acesso amplo):** acesso amplo demais a contas da empresa para uma tarefa que é um fluxo fixo.
- **Código próprio:** mais trabalho de manutenção para quem não é desenvolvedor.

**Preço:** precisa de um servidor no ar (ver D8).

## D2. Criar o evento antes da confirmação
**Contexto:** o desenho inicial era "pedir confirmação → só então agendar". Se a Naty não respondesse, o evento nunca existiria, que é exatamente o tipo de falha que originou o projeto.
**Decisão:** o evento é criado na hora como `⏳ [A CONFIRMAR]`, já com os lembretes. A confirmação só muda o status (✅ ou ⚠️). Sem resposta em 24h → ⚠️.
**Preço:** um evento com data errada fica na agenda até alguém corrigir, mas visivelmente marcado e com alerta.

## D3. Checagens de data em código, não na IA
**Contexto:** modelos de linguagem erram com frequência a conta de dia da semana e a resolução de datas relativas.
**Decisão:**
- A IA **copia** o dia da semana citado e o trecho original da data; quem compara é o código (`src/03_validar.js`), que é testado.
- A IA recebe um **calendário pronto** de 60 dias para consultar, em vez de calcular.
- Data no passado, a mais de 1 ano, urgência < 48h e falta de horário viram alertas determinísticos.

**Preço:** nenhum relevante.

## D4. Agenda como fonte da verdade dos lembretes
**Contexto:** os lembretes poderiam ser agendados no momento da criação (um "wait" por lembrete no n8n), mas aí uma mudança de data feita na agenda não seria refletida, e uma queda do n8n perderia as esperas.
**Decisão:** o workflow 2 lê a agenda a cada 10 min e grava no próprio evento (`extendedProperties.private.lembrete_<min>`) **para qual horário de início** cada lembrete já foi enviado.
**Consequências boas:** remarcar ou apagar o evento na agenda ajusta os lembretes; queda do n8n vira **uma** mensagem atrasada, não várias; não há banco de dados extra.
**Preço:** até 10 min de atraso por lembrete; depende de o n8n estar acordado (ver D8).

## D5. Groq no lugar do Claude
**Contexto:** a primeira versão usava Claude (`claude-opus-5-5`), a uns US$ 0,02–0,05 por pedido (~US$ 3–5/mês). Decisão do dono do projeto: usar o Groq, que é grátis.
**Decisão:** Groq, `openai/gpt-oss-120b`, com `response_format` `strict` (JSON sempre válido).
**Compensações:** calendário de 60 dias na mensagem (D3) e checagens em código.
**Preço:** modelo mais fraco justamente na tarefa crítica (datas em português, escolher a data certa num edital com várias datas). Limites do plano grátis (~8 mil tokens/min). **Reavaliar** se a Naty marcar "Está errado" com frequência. A troca é uma linha em `src/02_montar_requisicao.js` (outro modelo `strict` do Groq) ou a volta para o Claude, que exige trocar o formato da requisição e da leitura da resposta.

## D6. Telegram para a Naty; WhatsApp só para clientes, depois
**Contexto:** lembrete do Google Agenda é notificação silenciável. WhatsApp não oficial tem risco de banimento do número; o oficial (Cloud API) dá mais trabalho para configurar.
**Decisão:** confirmações, lembretes e alertas vão para a Naty por um **bot do Telegram**: oficial, grátis, sem risco de banimento e com nós prontos no n8n. A confirmação usa *Send and Wait* com botões dentro do chat e aceita toques só do chat da Naty. Se o Telegram falhar, a confirmação vai por e-mail. O WhatsApp fica para a **entrada** de pedidos (Fase 2), com a Naty encaminhando os pedidos ao número do bot pela API oficial.
**Preço:** a Naty precisa ter o Telegram, e o n8n precisa de HTTPS público para os botões dentro do chat.

## D7. Workflows gerados por código (`src/` + `build.js`)
**Contexto:** a lógica crítica (datas, lembretes) precisa de testes, e JSON de workflow editado à mão é difícil de revisar.
**Decisão:** o código dos nós "Code" fica em `src/*.js` (testável fora do n8n) e `build.js` monta os JSONs dos workflows. Os JSONs são artefatos gerados.
**Preço:** mudanças feitas direto na interface do n8n não voltam para o repositório; é preciso portá-las para `src/` e `build.js` (ver README → Desenvolvimento).

## D8. Hospedagem: Render grátis + Supabase
**Contexto:** exigência de custo zero; botões do Telegram e conector MCP exigem HTTPS público.
**Alternativas avaliadas:**

| Opção | Por que não |
|---|---|
| n8n Cloud | Sem plano grátis |
| PC em casa + túnel | PC desligado = lembretes parados; túnel grátis muda de endereço |
| Oracle Cloud Always Free | Melhor opção grátis em recursos, mas com pegadinhas: recolhe máquina ociosa, falta vaga em São Paulo, portas bloqueadas em dois lugares. Guia em `deploy/LEIA-ME.md`. |
| Google Cloud e2-micro | IP público pago (~US$ 3,65/mês), 1 GB de RAM |
| Render com o Postgres dele | O Postgres grátis do Render expira e apaga os dados |

**Decisão:** n8n no **Render free** + Postgres do **Supabase free** (usuário e schema exclusivos, via Session pooler, porque o Render não sai por IPv6) + **cron-job.org** batendo no `/healthz` a cada 5 min para o Render não desligar o serviço.
**Preço:** depende do cron-job.org para não dormir; 512 MB é o limite para o n8n; deploy a cada push na `main`. Saídas pagas em `OPERACAO.md`.

## D9. Imagem do n8n pelo Docker Hub
**Contexto:** o primeiro build no Render falhou com `429 Too Many Requests` ao baixar `docker.n8n.io/n8nio/n8n:stable`. O registro do n8n limita downloads por IP, e o Render usa IPs compartilhados.
**Decisão:** imagem oficial publicada no Docker Hub, com **versão fixa**: `FROM n8nio/n8n:2.42.5`. A tag `stable` mudaria a cada push, já que todo push refaz o deploy.
**Preço:** atualizar o n8n vira uma ação manual (ver `OPERACAO.md` → Atualizar o n8n).

## D10. O n8n cria o próprio schema no banco
**Contexto:** no primeiro deploy, o schema `n8n` tinha sido criado antes, à mão. O n8n conectou no banco, rodou `CREATE SCHEMA IF NOT EXISTS "n8n"` e **travou**: a resposta nunca chegou ao n8n, o processo ficou parado (CPU ~0, memória estável) e o Render derrubou o deploy por não abrir a porta. No código do driver (`@n8n/typeorm`), o próximo passo seria um `SELECT version()` na mesma conexão, que nunca foi executado.
**Causa provável:** com o schema já existente, o Postgres responde com um aviso ("already exists, skipping"), e esse aviso, passando pelo pooler do Supabase, trava a conexão.
**Confirmação (08/10/2026):** sem o schema pré-criado, o n8n criou o `n8n`, rodou todas as migrações (148 tabelas) e abriu o editor. A única variável alterada foi a existência prévia do schema.
**Decisão:** o schema criado à mão foi renomeado para `n8n_antigo` (vazio; pode ser apagado) e o usuário `n8n` ganhou permissão para criar schemas (`GRANT CREATE ON DATABASE postgres TO n8n`), de modo que o próprio n8n cria o `n8n`.
**Como recriar o banco do zero (SQL Editor do Supabase):**
```sql
create role n8n with login password 'SENHA_FORTE';
grant n8n to postgres;
grant create on database postgres to n8n;
alter role n8n set search_path = n8n;
-- NÃO crie o schema n8n: deixe o n8n criar no primeiro start.
```

## D11. Prazo maior para o executor dos nós de código
**Contexto:** no n8n 2.x, os nós **Code** rodam num processo separado (*task runner*) que se conecta ao n8n com um token de 30 segundos. Na CPU mínima do Render free, o runner levou ~36 s para iniciar, e os logs mostravam em loop `Task runner connection attempt failed: invalid or expired grant token`. O editor abria normalmente, mas **todo nó Code falharia**, e os dois workflows dependem deles.
**Decisão:** `N8N_RUNNERS_GRANT_TOKEN_TTL=180` nas variáveis do Render.
**Preço:** nenhum. O token só vale para a conexão local entre o n8n e o próprio runner (127.0.0.1).
**Lição:** "o editor abriu" não significa "está funcionando". Depois de cada deploy, confira os logs (ver `OPERACAO.md`).
