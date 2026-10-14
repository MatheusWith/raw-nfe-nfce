# Plano do quarto fluxo: exportação NFC-e com o Status em Todas

**Status: implementado em 2026-10-14.** Este documento é o handoff da etapa —
estrutura, lógica, validações e verificação reunidos num só arquivo para que a
implementação fosse escrita em uma passada, sem reabrir as medições. As decisões
viraram a [ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração);
as medições são as mesmas do terceiro fluxo, sem spike nova (a tela já tinha sido
medida inteira na [spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)).

Este fluxo agenda, pela **mesma tela** da NFC-e e com a **mesma lista e o mesmo
período** do terceiro ciclo, o arquivo de **todas** as NFC-e do período
(`Tipo de nota` = Saída, `Status da NFC-e` = Todas), onde aquele agenda as
**canceladas**. Ele não altera em nada o ciclo `Canceladas`: é um quarto ciclo
paralelo, com spec, módulo, tabela de escolhas, testes e comando próprios.

## 1. O fluxo, passo a passo

Uma sessão por execução; a travessia inteira (certificado → e-AGEAT → legado →
SIATWeb) acontece **uma vez**, e depois cada inscrição paga a sua própria iteração:

1. Ler `E2E_NFE_EXPORT_INSCRIPTIONS` e `E2E_NFE_EXPORT_EMISSION_START/END` antes de
   abrir o navegador (erro de configuração vira erro de configuração, não teste que
   falha no meio do caminho).
2. Derivar o deadline do teste do tamanho da lista — `allStatusSchedulingTestDeadlineMs(n)`
   = travessia + n × (passo da inscrição + visita de prova) + folga.
3. Login por certificado e travessia até o SIATWeb (compartilhados, importados sem
   cópia).
4. **Para cada inscrição**, na ordem da lista:

   1. **Visita de revisão**: `page.reload()`, checagem da tela de erro interna do
      portal, descarte do modal "Entendi", percurso de menu
      `Autoatendimento → NFC-e → Consultar/Exportar NFC-e`, papel de emitente
      marcado e guarda "nada não autorizado é perguntado".
   2. **Contagem antes** (`rowsBefore`) em `#lista-agendamentos-nfce` para a
      inscrição — só a contagem, nunca o conteúdo das linhas.
   3. **Passos 5–10 do formato clássico**: conferir que o form oferece a inscrição,
      selecioná-la e reler a seleção (o re-render devolve os padrões), declarar as
      escolhas **Saída** e **Todas** (depois da seleção, sobre a versão do form que
      será submetida), preencher o período e reescrevê-lo se o form re-renderizar,
      clicar **uma única vez** em "Agendar Exportação" com o pedido armado — o
      registro é validado **no fio**: período presente e `tipoDeNota`/`statusNota`
      batendo com a tabela deste fluxo.
   4. **Visita de prova**: nova visita (mesma rotina da revisão) e `expect.poll` da
      contagem — a linha só entra na listagem numa **nova carga** (medido na spike
      06, seção "A tabela só lista depois de uma nova visita"), então quem lê a
      prova paga a visita que a leitura exige. Contagem depois > contagem antes,
      atribuída à posição da inscrição.

5. **Falhas**: cada iteração é um `try` próprio. Uma falha entra na lista de
   falhas e a **próxima inscrição é tentada mesmo assim**; ao fim da lista, a
   **primeira falha** é reexecutada tal como foi levantada (erro tipado, sem
   embrulho), e os passos de cada item seguem no relatório de qualquer modo.
6. Nada depois do agendamento: sem download, sem download de linha, sem exclusão,
   sem nenhuma outra ação.

**Prova por iteração, sem passe final**: não existe visita de fechamento para a
lista inteira — a prova de cada item acontece dentro da própria iteração, antes do
próximo item começar. O que torna isso possível sem suposição é que a visita de
prova de um item é uma visita fresca qualquer: se o portal um dia passar a
atualizar a tabela no próprio clique, a visita continua lendo a linha certa — o
formato não depende de nenhuma das duas hipóteses.

## 2. Por que um quarto fluxo, e não uma variante do terceiro

- **Só o Status difere, e o Status é o que o arquivo é.** Aceitar a tabela do
  irmão exportaria as canceladas com o pedido saindo perfeitamente bem — a falha
  sem sintoma visível, que só o arquivo diria.
- **A tela é a mesma.** Diferente das entregas 0010/0011 (telas diferentes,
  conhecimento totalmente separado), aqui o que separa os fluxos é **dado**:
  por isso o objeto de tela ganha métodos que recebem as escolhas como parâmetro e
  os métodos antigos viram declarações finas com a própria tabela — uma tela, uma
  lógica, duas tabelas.
- **Uma medição, duas declarações.** Como as duas tabelas descrevem a mesma tela,
  o teste unitário do quarto fluxo **compara as duas tabelas** nos fatos de tela
  (rótulo, campo, opções, valores) e só deixa divergir o autorizado. A cópia não
  pode virar uma segunda versão da realidade.
- **A prova por iteração troca o passe final por uma visita por item**, porque a
  falha de um item passa a ser nomeada onde aconteceu (e foi o que a primeira
  execução em produção mostrou: quatro itereições, quatro falhas nomeadas, a
  primeira reexecutada no fim).

## 3. Medições que o fluxo herda (nenhuma nova)

- **[spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)**
  — a tela inteira: grupos, rótulos (`Tipo de nota:`, `Status da NFC-e:`), campos
  (`tipoDeNota`, `statusNota`), opções e valores (`Saída` = `1`, `Todas` = `2`;
  contra `Saída` = `2` em NF-e), ausência de postback nos rádios, chegada já no
  formulário do emitente, tabela `lista-agendamentos-nfce`.
- **[spike 06](spikes.md), seção "A tabela só lista depois de uma nova visita"** —
  `Agendar exportação` responde sem recarregar e a linha só aparece na próxima
  carga. Medido na tela de NF-e e é a razão estrutural da visita de prova; a
  leitura continua correta sob as duas hipóteses (in-place ou nova carga), porque
  a visita acontece de qualquer modo.
- **[spike 06](spikes.md) / ADR 0009** — o pedido é comparado no fio (período e
  escolhas), a guarda de escolhas desconhecidas, o furo conhecido da inversão do
  `--grep-invert`.
- A **sobreposição de período** continua sendo pergunta aberta (§8).

## 4. Decisões que a implementação materializa (ADR 0012)

1. Quarto ciclo independente: spec, módulo de ciclo, tabela de escolhas, testes e
   comando próprios; cópia do ciclo é a única duplicação aceita.
2. Mesmas variáveis de ambiente, **nenhuma nova**.
3. `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS`: `Saída` (`tipoDeNota` = `1`) e `Todas`
   (`statusNota` = `2`), declarada como este fluxo declara a medição.
4. Teste unitário pendura as duas tabelas da NFC-e nos fatos de tela.
5. Métodos aditivos `applyNoteChoices(groups)` /
   `scheduleExportValidated(period, reference, groups)`; `findDivergedNfceNoteChoiceGroup`
   ganha `groups` com padrão da tabela antiga — comportamento antigo intocado.
6. Módulo de escolhas novo é **só dados** (sem funções nem vocabulário próprios).
7. Prova por iteração com visita própria; sem passe final.
8. Deadline derivado do formato, ao lado do ciclo, com teste unitário próprio;
   `timeouts.test.ts` não alterado.
9. Falhas acumuladas por item, primeira reexecutada no fim; classes de erro
   reutilizadas, sem classe nova.
10. Marca `@on-demand`; a rodada padrão não muda.

## 5. Arquivos a criar e alterar

### Criar

| Arquivo                                                       | Conteúdo                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/nfce-export-issuer-all-status-scheduling.spec.ts`        | Spec `@on-demand`: travessia única, deadline derivado, ciclo, contagem final de itens provados.                                                                                                                                                                                                  |
| `e2e/support/nfce-export-issuer-all-status-scheduling.ts`     | O ciclo: `ExportToSchedule`/`toExportTargets`, `chooseIssuerRole`, `refillEmissionPeriod`, `scheduleExport`, `PORTAL_ERROR_SCREEN_PATH` + checagem, `revisitExportScreen`, `countScheduledRowsFor`, `waitForScheduledRow`, `allStatusSchedulingTestDeadlineMs`, `scheduleEveryConfiguredExport`. |
| `e2e/support/nfce-export-issuer-all-status-note-choices.ts`   | Tabela `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS` e os tipos próprios — só dados.                                                                                                                                                                                                                      |
| `e2e/unit/nfce-export-issuer-all-status-note-choices.test.ts` | Bateria: forma da tabela, par `Saída`/`Todas`, **penduração entre as duas tabelas da NFC-e**, leituras do pedido com `groups`, guarda, vocabulário da recusa contra o grupo deste fluxo.                                                                                                         |
| `e2e/unit/nfce-export-issuer-all-status-scheduling.test.ts`   | Bateria do deadline derivado: forma, linearidade, teto contra as constantes declaradas, recusa de lista vazia.                                                                                                                                                                                   |
| `docs/plano-nfce-export-issuer-all-status.md`                 | Este documento.                                                                                                                                                                                                                                                                                  |

### Alterar (aditivo, comportamento antigo intocado)

| Arquivo                                          | O que muda                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/pages/siatweb-nfce-issuer-form.page.ts`     | Contrato e implementação de `applyNoteChoices(groups)` e `scheduleExportValidated(period, reference, groups)`; `applyAuthorisedNoteChoices`/`scheduleExport` viram declarações finas com `NFCE_NOTE_CHOICE_GROUPS`. |
| `e2e/support/nfce-export-issuer-note-choices.ts` | `findDivergedNfceNoteChoiceGroup(fields, groups = NFCE_NOTE_CHOICE_GROUPS)` — parâmetro com padrão.                                                                                                                 |
| `package.json`                                   | Comando `test:scheduling:nfce:all-status`.                                                                                                                                                                          |
| `docs/decisoes.md`                               | ADR 0012 + linha no índice.                                                                                                                                                                                         |
| `docs/fluxo.md`                                  | Seção 3.7 paralela + soma/contagens do sumário e dos "Ver também".                                                                                                                                                  |
| `docs/referencia-tecnica.md`                     | Seções paralelas: contrato da tela NFC-e, ciclo do quarto fluxo, tipos, prazo derivado.                                                                                                                             |
| `README.md`                                      | Comando, quatro ciclos (o furo da inversão), aviso de duas exportações por inscrição, contagens.                                                                                                                    |

### Não alterar

- `e2e/nfce-export-issuer-scheduling.spec.ts`, o módulo de ciclo e a bateria
  unitária do terceiro fluxo: são o fluxo `Canceladas`, que continua intacto.
- `e2e/unit/timeouts.test.ts` e `e2e/unit/nfce-export-issuer-note-choices.test.ts`:
  nenhuma edição em teste existente — o parâmetro com padrão os mantém verdes.
- `docs/plano-nfce-export-agendamento.md`: plano já executado do terceiro fluxo.
- `.env.example`: nenhuma variável nova; as anotações existentes seguem corretas.

## 6. Regras permanentes e limites conhecidos

- **Efeito fiscal real, uma vez por pedido**: clicar "Agendar Exportação" agenda de
  verdade; sem retentativa automática, sem clique duplo.
- **Privacidade**: falhas e passos citam a **posição** da inscrição, nunca o
  valor; contagens, nunca o conteúdo das linhas; nenhum dado fiscal em mensagens,
  relatórios ou código versionado.
- **Nada além do agendamento e da prova da linha**: sem download, sem Excluir, sem
  nenhuma ação fora do indispensável.
- **A prova não é atribuível a um fluxo**: a `lista-agendamentos-nfce` é a mesma do
  terceiro ciclo e não tem coluna de fluxo; a contagem prova que uma linha nova
  surgiu para a inscrição. Agenda manual entre as duas leituras satisfaria a prova
  — limitação escrita, não contornada.
- **O furo da inversão cresce**: invocar o executor sem o comando do pacote agenda
  os quatro ciclos (dezesseis pedidos reais). Os comandos do `package.json`
  carregam a inversão; nada fora deles.

## 7. Verificação antes de declarar pronto

| Verificação                        | Situação                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| `pnpm typecheck`                   | Sem erros.                                                            |
| `pnpm lint`                        | Sem erros nem avisos.                                                 |
| `pnpm test:unit`                   | 102 testes passando (baterias novas e antigas).                       |
| `pnpm exec playwright test --list` | 9 testes coletados, a spec nova entre eles.                           |
| `pnpm format:check`                | Todos os arquivos no estilo do Prettier.                              |
| Rodada sob demanda em produção     | Executada em 2026-10-14, headed, aprovada pelo usuário: 4/4 provados. |

### Histórico de execução desta entrega

- **2026-10-14, execução acidental**: ao conferir o comando com `-- --list`, o pnpm
  repassou `--` e o executor **rodou** o teste em vez de listá-lo. Resultado,
  apurado no trace: a iteração 1 completou revisão, escolhas, período e
  **registro do pedido com validação no fio aprovada** (o corpo saiu com as
  escolhas deste fluxo); a visita de prova da iteração 1 bateu na **tela de erro
  interna do portal** (ORA-01924, permissão de papel — a intermitência já
  registrada antes), e as iterações 2 a 4 falharam na sua revisão com a mesma
  tela. Falhas acumuladas, primeira reexecutada no fim — o formato previsto
  funcionou. **Nenhum item teve a sua linha provada**, e a rodada autorizada
  seguinte não recebeu nenhuma recusa de duplicidade — indício de que o pedido
  enviado nesta execução acidental **não persistiu** no portal, provavelmente
  descartado junto com o erro. Os artefatos (trace/screenshot) ficam em
  `test-results/`, fora do versionamento.
- **2026-10-14, primeira execução autorizada** (`pnpm
test:scheduling:nfce:all-status --headed`, com o usuário assistindo):
  **quatro de quatro itens agendados e provados**, em cerca de um minuto e
  meio. Cada iteração seguiu o formato completo — revisão da tela, escolhas
  `Saída` + `Todas` conferidas no fio, período, clique único, visita de prova e
  contagem subindo. A tela de erro interna do portal não apareceu nesta
  rodada, e a recusa de duplicidade não foi exercitada (não havia agendamento
  anterior do período) — a sobreposição continua em aberto no §8.1.

## 8. Pontos abertos

1. **Sobreposição de período entre os dois ciclos da NFC-e.** Se o portal julgar a
   repetição de agendamento só pelo período (e não pelas escolhas), o segundo
   ciclo é recusado no primeiro item com "Já existe um agendamento com os
   parâmetros passados". A recusa foi medida só com parâmetros idênticos. Não se
   clica de propósito para descobrir: é efeito fiscal, e a descoberta acontece na
   primeira execução autorizada com os dois ciclos. Se acontecer, a resposta é
   decisão nova (períodos distintos ou execução exclusiva), não um retry.
2. **A tela de erro interna do portal** segue intermitente na recarga (ORA-01924).
   O comportamento deste ciclo é o dos demais: nomeia e não tenta por conta
   própria. Nenhuma recuperação automática foi medida nem implementada.
3. **O download continua fora de escopo**, como nos outros três ciclos — é fase
   própria.
4. **A lacuna documental do terceiro fluxo permanece**: `docs/fluxo.md` e
   `docs/referencia-tecnica.md` não têm seção para o ciclo `Canceladas` (registrada
   como aberta no plano daquela entrega). Esta entrega documenta o quarto fluxo; a
   lacuna do terceiro segue registrada e não preenchida.

## Referências

- [ADR 0012 — Fluxo NFC-e Todas](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração)
- [ADR 0011 — Fluxo NFC-e, terceiro ciclo](decisoes.md#adr-0011--fluxo-nfce-um-terceiro-ciclo-a-tela-própria-da-nfce-escolhas-e-prova-próprias)
- [ADR 0010 — Ciclo de emitente, segundo ciclo](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo)
- [spike 08 — tela da NFC-e](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)
- [Plano executado do terceiro fluxo](plano-nfce-export-agendamento.md)
