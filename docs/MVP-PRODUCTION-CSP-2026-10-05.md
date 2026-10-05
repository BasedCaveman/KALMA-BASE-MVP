# MVP production release: CSP Base RPC

Pedro autorizou integrar/servir em Production o MVP, encerrando a rodada de Preview. Escopo exclusivo do repositório BasedCaveman/KALMA-BASE-MVP e projeto Vercel frontend. O main e deployment Kalma.me não integram esta operação.

Base local e6860c9 preserva read states, copy, validade, modo reader e retirada dos oito crons. Correção focal permite https://sepolia.base.org em connect-src e remove duas entradas malformadas de RPC. Rede, contratos, secrets e critérios de claim não são alterados.

Validar teste da CSP, suites focais dos hooks/copy/jobs e build; integrar a PR MVP e acompanhar o SHA Production. Não repetir QA em Preview; um push pode disparar build automático Preview do Git, sem aceitação operacional exigida nesse ambiente.

Depois do release, conferir HTTP, CSP e recusas dos jobs, dados públicos e schedules removidos. Login/faucet/transação não serão executados pela coordenação nesta operação; teste do time ocorre no domínio Production/Base Sepolia. Não declarar envio on-chain comprovado sem recibo.

## Verificações locais e configuração

- CSP emitida pelo `headers()` real permite exatamente a origem do RPC configurado em `chain.ts`: PASS. O teste avalia apenas os headers e não executa os plugins do bundler.
- Hooks reais de leitura e copy/hero EN/PT: PASS.
- Gate de reader: 120 invocações dos oito handlers recusadas antes de efeitos: PASS.
- Build completo: exit 0, 32/32 páginas, incluindo compilação e checagem de tipos. O build usa URL/anon Supabase fictícios e não comprova consultas reais. Houve avisos de fetch das rotas de dados e de dependência dinâmica viem/ox.
- A API da Vercel negou por 403 a inclusão de `KALMA_DEPLOYMENT_ROLE=reader` em Production. Nenhum secret foi alterado. No código integrado, papel ausente também retorna `climate_jobs_disabled`; apenas o valor explícito `climate-executor` libera jobs. A comprovação remota deve verificar essa recusa após o release.
- `frontend/vercel.json` contém `crons: []`. Nenhuma migration será reaplicada (delta zero previamente confirmado).

## Retorno

Não promover cegamente o deployment antigo `508676d`: ele não contém o gate e mantém schedules. Se necessário, retornar o código da UI preservando o gate reader e a configuração de crons vazia. Não apagar tabelas nem dados. A versão anterior da aplicação e a nova permanecem identificáveis no histórico Git do próprio MVP.
