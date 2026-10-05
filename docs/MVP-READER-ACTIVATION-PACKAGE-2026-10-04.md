# MVP: pacote de revisão antes da ativação

Preparado em 2026-10-04, a partir da decisão de coordenação
`MVP-SHARED-DATABASE-WRITER-DECISION-2026-10-04.md` e de consultas SQL somente leitura.
Escopo local: branch `codex/mvp-signal-engine-contract-2026-10-04`.
`d7b7d6f774dbda0f1afcc8835ff3b953bab68a48` permanece na ancestralidade.
Este pacote não aplica configuração remota, migrations, cron ou deploy.

## Banco e autoridade

Project ref: **qipezhmpkqygfunkevuj** (Kalma.me).
Pedro confirmou `NEXT_PUBLIC_SUPABASE_URL` em Production no dashboard Vercel.
Segundo a mesma evidência, `SUPABASE_URL` e `CRON_SECRET` estão ausentes.
Ausência de `CRON_SECRET` é compatível com 401: o código de auth das rotas
recusa produção quando não existe o secret. O novo gate é independente dessa ausência.
Não criar, substituir nem transportar `CRON_SECRET` para o MVP.

Kalma é o executor dos dados climáticos compartilhados. O MVP lê esses dados.
Perfil, observações, interações, lugares demandados pelos usuários, snapshot
de mercado, carteira e faucet conservam seus fluxos próprios. O gate abaixo
se aplica aos oito handlers de background, não a todo o banco nem a todas as APIs.

## Matriz dos oito jobs

Todos os schedules abaixo são removidos de `frontend/vercel.json` neste pacote.
O agendamento remoto atual só muda após uma implantação futura em produção;
um Preview não retira os jobs do deployment de produção vigente.

| Rota `/api/cron/…` | Leitura / efeitos | Banco / rede | Responsável / decisão | Schedule anterior UTC |
|---|---|---|---|---|
| signal-engine | Avalia clima, promove candidatos, expira/upserta sinais e escreve caches | Banco compartilhado; Open-Meteo | Kalma, escopo climático compartilhado | `0 */6 * * *` |
| enrich-places | Consulta Wikipedia/observações e upserta perfis de atividade | Banco compartilhado; Wikipedia | Kalma | `20 4 * * *` |
| commodity-context | Consulta preços, upserta preços e substitui eventos de contexto | Banco compartilhado; fonte de commodities | Kalma | `30 21 * * *` |
| weather-news | Descobre notícias; escreve itens, fontes e histórico de runs | Banco compartilhado; fontes externas | Kalma | `17 5 * * *` |
| inmet-alerts | Ingere/upserta e remove alertas expirados | Banco compartilhado; INMET | Kalma | `35 */3 * * *` |
| place-briefs | Compõe/insere e verifica/atualiza boletins | Banco compartilhado; Open-Meteo | Kalma | `40 6,18 * * *` |
| leaderboard | Lê logs do pool Base; upserta snapshots/scores, exclui scores e atualiza meta | Banco compartilhado; leitura RPC Base Sepolia | Inativo no MVP; executor Base separado depende de contrato de isolamento | `*/15 * * * *` |
| cre-shadow | Lê snapshots/evidências, consulta fontes e upserta resultados shadow | Banco compartilhado; fontes climáticas; pool Base | Inativo no MVP; shadow Base exige revisão própria | `25 */2 * * *` |

Os oito handlers auditados não enviam transações on-chain. Isso não os torna
inofensivos: leaderboard faz `onConflict: 'address'` em `competition_scores`
e atualiza `competition_meta` global. O filtro de pool em `markets_snapshot`
não isola essas pontuações. A janela default de competição também foi herdada.
Kalma continua responsável pelo seu próprio leaderboard, não pelo pool Base.

CRE é shadow/candidato: não resolve contratos. Seleciona snapshots pelo pool,
mas busca shadow/evidências somente por `market_id`; não assumir isolamento
entre pools/redes. Manter o executor Kalma existente no seu escopo e não
ativar nem encaminhar o pool Base a ele nesta etapa. Uma implementação Base
exige identidade composta de rede/pool/market e revisão de leitura/escrita.

## Gate de execução

`frontend/lib/server/climate-job-role.ts` decide antes da autenticação e da
criação de clientes nos oito handlers:

- `KALMA_DEPLOYMENT_ROLE` ausente, inválido ou `reader`: HTTP 403,
  `climate_jobs_disabled`, zero efeitos do job.
- `VERCEL_ENV=preview`: HTTP 403, `preview_jobs_disabled`, inclusive se o
  papel estiver incorretamente configurado como `climate-executor`.
- Apenas `climate-executor` explícito fora de Preview passa pelo gate;
  ainda depende da autenticação existente. Esse papel não deve ser usado no MVP.

O gate protege GET e POST onde exportados, chamadas agendadas e manuais,
Bearer e query string. Não habilita jobs do Kalma nem modifica seu repositório.
`frontend/vercel.json` final contém `"crons": []`.

## Schema e delta zero

Consultas somente leitura no projeto confirmado verificaram colunas,
constraints, índices, grants, policies e `supabase_migrations` pelo conector.
`historical_series_cache` já tem `anchor_years integer[]`, `dates date[]`,
`values numeric[]`, `lookback_days`, `years_requested`,
`years_with_usable_window`, `model text NOT NULL` sem default e `cached_at`.
O CHECK exige arrays alinhados e não vazios. A chave única é
`(place_id, variable, doy_center, doy_half_window, baseline_years, source, lookback_days, model)`.
O índice de lookup existe e RLS está habilitado.

| Migration local do port | Versão já aplicada no banco compartilhado |
|---|---|
| 20260921_historical_series_cache | 20260921140937 |
| 20260921120000_historical_series_cache_fixes | 20260921161910 |
| 20260921180000_historical_series_cache_coverage | 20260921172149 |
| 20260921200000_historical_series_cache_usable_window | 20260921174930 |
| 20260921220100_historical_series_cache_model_identity | 20260921185733 |

O histórico remoto também contém model identity do cache legado e rollback
em 20260921185729 e 20260921191615. `historical_cache` conserva sua estrutura
legada, sem `model`, e sua chave única original. O port utiliza série datada;
não alterar o contrato do escritor legado nem reintroduzir o delta revertido.

**Delta DDL necessário para este port: zero.** Não reaplicar os cinco SQLs:
as versões locais e remotas diferem, mas o schema final já é compatível.
Não executar `migration up`/`db push` para reconciliar nomes/versões.
Não houve ensaio de DDL em banco descartável porque não há delta a ensaiar.
Nenhuma migration, reparação de histórico ou escrita remota foi executada.

As colunas de validade de `local_signals`, coordenadas de `places` e campos
do snapshot/verificação de `place_briefs` usados pelo port estão presentes.
RLS permite SELECT anon nos sinais ativos, lugares ativos, registry ativo,
perfis de atividade, eventos de commodities e boletins armazenados. O
contrato de validade aplica ainda `valid_from <= now < valid_until`.
Caches não têm grant anon nem policy pública; o MVP não precisa consultá-los
para exibir sinais/boletins já produzidos. Não conceder acesso público novo.
Isso não afirma que todas as APIs do MVP estejam validadas remotamente.

Recuperação: este pacote é de código/configuração, sem transformação de dados.
Para recuar, manter a exclusão de schedules e o papel reader, e reverter apenas
as mudanças funcionais necessárias. Reverter cegamente para um commit com
crons reintroduz agendamentos. Não apagar caches ou briefs e não fazer down
migration. Kalma continua escrevendo com o schema implantado inalterado.

## Variáveis e configuração propostas, ainda não aplicadas

Projeto Vercel: `frontend`, ID `prj_4OnhlTod6KD1NUm7TC5nXyI4Kw46`,
GitHub `BasedCaveman/KALMA-BASE-MVP`. Produção vinculada a `main`, domínio
`frontend-blue-psi-38.vercel.app`; último SHA de produção observado: `508676d`.
Preview anterior de `f22416d` falhou com `missing_pages_app` na raiz `.`.

| Nome | Escopo proposto | Origem / necessidade |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Preview desta branch | Mesmo projeto confirmado qipezhmpkqygfunkevuj; copiar configuração existente |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Preview desta branch | Chave pública correspondente ao projeto; leitura conforme RLS |
| KALMA_DEPLOYMENT_ROLE | Preview desta branch; futuro Production do MVP | `reader`; ausência já falha fechada |
| VERCEL_ENV | Automático do Vercel | Não sobrescrever; Preview sempre bloqueia jobs |

Não adicionar `SUPABASE_URL` divergente nem `CRON_SECRET`. Não publicar valores
de chave em docs, logs ou PR. Variáveis públicas são incorporadas no build;
um build com placeholders não valida a configuração real de Preview.

Não remover `SUPABASE_SERVICE_ROLE_KEY` de Production indiscriminadamente.
Auditoria de usos legítimos existentes: profile/preferences/follows/notifications,
observations/react/report, pulse, places candidate/upsert, funnel e
market refresh-snapshot. `pulse` combina leitura de contexto com respostas
privadas e POST de usuário; exige service-role no código atual. A leitura
de leaderboard também usa esse cliente. Para Preview de leitura climática,
não transportar service-role automaticamente. QA desses fluxos de usuário
precisa de configuração separada, credenciais de servidor e `IP_HASH_SALT`
quando exigido. Não prometer pulse/interações completos com apenas URL/anon.
As rotas de laboratório interno/social também usam autoridade de servidor;
continuam fora da ativação deste pacote. O papel reader não equivale a
uma limitação global de uma chave service-role.

Configuração final proposta:

- Root Directory: `frontend` (Project Settings, não uma propriedade inventada de vercel.json).
- Framework: Next.js.
- Install Command: padrão detectado pelo Vercel usando `frontend/package-lock.json`.
- Build Command: padrão Next.js / `npm run build` (`next build`). Remover override `npm run vercel-build`.
- Output Directory: padrão Next.js `.next`.
- Production Branch: `main`, preservada; esta branch deve gerar apenas Preview.
- Cron configuration da branch: `frontend/vercel.json`, lista vazia.

Após aprovação operacional: aplicar Root Directory e variáveis propostas;
publicar esta branch, aguardar Preview READY e confirmar SHA final; validar
home/signals/Place/arquivo histórico com dados reais e respostas 403 dos jobs
sem credenciais de execução. Confirmar que nenhum job escreveu pelo MVP.
Configuração de projeto é compartilhada e pode afetar builds futuros:
não promover Preview nem disparar deploy de produção nesta etapa.
Os schedules da produção vigente e seus 401 continuam até um release autorizado.

## Validade: ampliação aceita de d7b7d6f

Além de nearest (`withSignal=1`) e pulse, entraram home (teaser, count e
global lead), `/signals` SSR, `useLocalSignals` global e por lugar,
`/places/[slug]` SSR e seleção de sinais para novos boletins em `brief.ts`.
Todos reutilizam `applyValidityFilter`. O arquivo datado de briefs permanece
independente da validade atual dos sinais e os registros não são reescritos.

## Validação e PR

`test:reader-jobs`: 120 invocações dos handlers GET/POST, modos reader/missing
em desenvolvimento/produção e Preview até com papel executor, credenciais
válidas de teste, Bearer/query. Todas retornam 403 com zero chamadas a
dependências, rede, banco e RPC. São testes locais dos handlers compilados
com dependências substituídas, não runs remotos de cron.
`test:validity-readers`: vigente/vencido/início futuro/inválido, contrato de
queries e preservação do histórico passaram. TypeScript passou.
`npm run build`: exit 0, Next.js 15.5.25, 32 páginas estáticas geradas,
com URL/anon fictícios, role reader e VERCEL_ENV=preview. Os fetches de
dados fictícios falharam como esperado; o build comprova compilação e
geração de rotas, não acesso ao banco real. Permanece warning de dependência
dinâmica viem/ox. O servidor Next.js desse build também respondeu 403
`preview_jobs_disabled` a 15 chamadas HTTP locais (oito GETs e sete POSTs).
O teste não usou secrets reais nem executou os jobs. Preview remoto ainda
não foi criado nesta etapa.

Draft PR proposta (GitHub anteriormente retornou 403; não existe PR aberta):
Título: `[Draft] Port signal validity and prepare MVP as shared climate reader`.
Descrição: este port aplica validade temporal aos consumidores atuais,
preserva o arquivo histórico e impede os oito jobs de executarem no MVP
leitor/Preview. Remove schedules do MVP, mantém Kalma como escritor dos
dados climáticos compartilhados e retém leaderboard/CRE Base para revisão
de isolamento própria. Schema compartilhado compatível: delta zero.
Validação local: testes dos leitores, 120 recusas sem efeitos e TypeScript.
Preview e publicação aguardam aprovação da configuração operacional.

Comparação para abertura manual como Draft, após publicar a branch:
https://github.com/BasedCaveman/KALMA-BASE-MVP/compare/main...codex/mvp-signal-engine-contract-2026-10-04?expand=1
Esse link ainda aponta ao estado remoto anterior enquanto o push está retido.

Pendências: aprovação de Root Directory/variáveis e publicação; Preview
com credenciais de leitura reais; revisão de schema/writer/Draft; implementação
isolada Base para leaderboard/CRE em etapa própria. Não adicionar CRON_SECRET.
