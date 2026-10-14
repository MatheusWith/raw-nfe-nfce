# Plano do terceiro fluxo: exportação NFC-e pelo papel de emitente

**Status: implementado em 2026-10-09.** Este documento foi o handoff da etapa —
medição e decisões concentradas num só arquivo para que a implementação pudesse ser
escrita em uma passada, sem reabrir as medições. Como previsto abaixo, a medição
virou a **spike 08** (`docs/spikes.md`) e as decisões viram a **ADR 0011**
(`docs/decisoes.md`); é lá que o conteúdo vive hoje, e aqui ficam o passo a passo e
as medições na forma em que foram levadas ao código.

Duas correções feitas durante a implementação, registradas porque o texto original
as tinha ao contrário:

- **A ordem dos passos 7 e 8 estava trocada.** A seleção da inscrição é o que
  re-renderiza o formulário, então as escolhas vêm **depois** dela — como o próprio
  parêntese do passo 8 já dizia e como os ciclos NF-e fazem. Marcar antes faria o
  re-render devolver os padrões da tela ao formulário que será submetido.
- A bateria unitária **não** tem um teste de compartilhamento de opção a remover:
  ela fixa, como teste, a medição de que os dois grupos **não** compartilham opção,
  porque é exatamente essa a diferença contra a tabela de NF-e e é um erro de cópia
  dela o que esse teste pega.

O que já existe e **não** muda: a travessia (login por certificado → módulo e-AGEAT →
sistema SIATWeb), o menu de NF-e, o ciclo de destinatário e o ciclo de emitente NF-e.
O que este plano acrescenta é um **terceiro fluxo separado**, irmão dos outros dois,
com spec, objeto de tela, módulo de ciclo, tabela de escolhas, teste unitário e
comando próprios.

---

## 1. O fluxo, passo a passo

O encadeamento é o mesmo dos fluxos NF-e até a chegada ao sistema. A partir dali ele
segue o **ramo NFC-e** do menu, que é uma **tela distinta** da de NF-e.

**Pré-condições** (de ambiente, já usadas pelos fluxos NF-e — nenhuma variável nova):

- certificado A1 e origem de SSO (`E2E_CERT_PATH`, `E2E_CERT_PASSWORD`,
  `E2E_CERT_SSO_ORIGIN`);
- origem do sistema SIATWeb (`E2E_SIATWEB_SYSTEM_ORIGIN`) e a empresa da travessia
  (`E2E_COMPANY_INSCRIPTION`);
- a lista de inscrições e o período de emissão, **reutilizados sem variável nova**:
  `E2E_NFE_EXPORT_INSCRIPTIONS`, `E2E_NFE_EXPORT_EMISSION_START`,
  `E2E_NFE_EXPORT_EMISSION_END`.

**Passos:**

1. **Travessia** — idêntica à dos outros fluxos: `loginWithCertificate` →
   `enterAgeatLegacySystem` → `enterSiatWebSystem`. Nada muda aqui. Ver
   `docs/fluxo.md`, fases 1–3.

2. **Menu NFC-e** — a partir do sistema SIATWeb, revelar por **hover**
   `Autoatendimento` → `NFC-e` e acionar o item **`Consultar/Exportar NFC-e`**.
   O item abre na **mesma aba** (postback JSF), com URL de chegada
   `/siatweb/faces/index.xhtml`. Medido na spike 08.

3. **Chegada: o formulário do emitente** — ao contrário da tela NF-e (que chega no
   formulário de busca por chave), a tela NFC-e **chega já no formulário de
   exportação**, com o rádio **`Contribuinte como Emitente` já marcado**
   (`buscaComoId` = `1`). A prova de chegada são os controles do formulário servidos
   **mais** a linha `Status da NFC-e:` visível (§3).

4. **Aviso modal** — a tela abre com um aviso cujo único botão é **`Entendi`**
   (medido em `notice-controls.json`: `Entendi` é o único dos quatro candidatos que
   existe como botão). Enquanto ele está na tela, o formulário atrás não é usável;
   ele é dispensado antes de qualquer outra ação.

5. **Estado da inscrição** — o `select` de inscrição **chega no placeholder**
   (primeira opção, não numa empresa), embora o papel Emitente já esteja marcado.
   Nada é selecionado ainda.

6. **Papel do emitente** — marcar `Contribuinte como Emitente` de forma
   **idempotente** (`check()`), mesmo já vindo marcado. O papel não é parâmetro
   fiscal; é o que faz o formulário de exportação existir, e é _declarado_ em vez de
   herdado do estado de chegada.

7. **Inscrição** — conferir que o formulário **oferece** a inscrição configurada e
   só então selecioná-la, uma por item. A seleção é o que re-renderiza o formulário
   (`partial.render = consultarNFCeForm`), então ela vem **antes** das escolhas e do
   período: marcar antes dela faria o re-render devolver os padrões da tela ao
   formulário que será submetido.

8. **Escolhas do arquivo** — declarar explicitamente, **depois** da inscrição
   selecionada, e conferir cada grupo:

   - **`Tipo de nota` = `Saída`** (campo `tipoDeNota`, valor `1`);
   - **`Status da NFC-e` = `Canceladas`** (campo `statusNota`, valor `0`).

   A tela chega com `Tipo de nota` = Saída (o que coincide com a escolha) e
   `Status da NFC-e` = **Ativas** (o que **diverge** e precisa ser trocado). O
   ponto de existir este passo é que a escolha é **dita pelo fluxo**, não herdada do
   padrão da tela. Marcar um grupo **não dispara postback** (medido): a leitura de
   retorno é a asserção web-first `toBeChecked()`, e não uma segunda leitura de
   request.

9. **Período de emissão** — preencher `dataInicial_input` e `dataFinal_input` com o
   período configurado, e confirmar que o formulário manteve o período; quando o
   formulário volta em branco após um re-render, reescrever o período (tolerância já
   usada nos fluxos NF-e).

10. **Agendar exportação** — clicar **`Agendar exportação`** **uma única vez** por
    item. Este é o **único** efeito fiscal permitido neste fluxo. Antes do clique,
    registrar o request; depois, conferir no **request que saiu** que o período e as
    escolhas de nota são os que o fluxo declarou.

11. **Prova do item** — a tabela de agendamentos `#lista-agendamentos-nfce` ganha uma
    **linha nova** para a inscrição. A prova é a **variação da contagem de linhas**
    (contagem lida antes do clique e depois, na visita de fechamento), como nos
    fluxos NF-e. A tabela não tem coluna de papel, então a prova não é atribuível a
    este ciclo — limitação registrada, não defeito (§6).

12. **Encerramento** — uma visita final lê a tabela uma vez e prova todos os itens.

**Fronteira de escopo.** O fluxo **termina no agendamento e na prova da linha**. O
**download** — acionar o botão `Download` da linha e verificar o arquivo — continua
**fora de escopo**: ele ainda não existe na suíte (`docs/fluxo.md`, §6) e é uma fase
própria. **Decidido** na grilling desta entrega: este terceiro fluxo **não** baixa nem
verifica o arquivo; ele agenda e prova a linha, como os outros dois.

---

## 2. Por que um terceiro fluxo, e não uma variante do de NF-e

A tela NFC-e é **outra tela**: mesmo sistema, outro ramo do menu, outra `form`
(`consultarNFCeForm`), outro conjunto de escolhas de nota e outra tabela
(`lista-agendamentos-nfce`). Tratá-la como um parâmetro do ciclo de NF-e faria as
duas medições compartilharem uma constante que é permitido divergirem.

A decisão é a mesma que separou o ciclo de emitente do de destinatário: **conhecimento
de tela por fluxo, nunca emprestado**. Cada fluxo declara sua própria medição, e a
correção de uma medição que divergir é feita no fluxo que compete. Ver a
ADR 0010 (`docs/decisoes.md`), que esta decisão estende.

---

## 3. Medições que sustentam o fluxo (spike 08)

Tudo abaixo foi medido contra o portal e está em
`sandbox/inspect-nfce-export-issuer-output/`. O probe é
`sandbox/probe-nfce-export-issuer-screen.ts` (read-only; não clica em nada fiscal).

**Menu e chegada**

| Fato                   | Medição                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| Grupos do menu (hover) | `Autoatendimento` → `NFC-e`                                      |
| Item                   | `Consultar/Exportar NFC-e` (1 elemento, casamento exato)         |
| URL de chegada         | `/siatweb/faces/index.xhtml` (mesma aba)                         |
| Chega no               | formulário de emitente, com `Contribuinte como Emitente` marcado |

**Formulário** (`form-structure.json`; `form` = `consultarNFCeForm`)

| Grupo (rótulo da linha) | Campo         | Opções (nome = valor postado)                                              | Chega marcado |
| ----------------------- | ------------- | -------------------------------------------------------------------------- | ------------- |
| `buscaComoId` (papel)   | `buscaComoId` | `Contribuinte como Emitente` = `1`; `Contribuinte como Destinatário` = `2` | Emitente      |
| `Tipo de nota:`         | `tipoDeNota`  | `Entrada` = `0`; `Saída` = `1`                                             | Saída         |
| `Status da NFC-e:`      | `statusNota`  | `Ativas` = `1`; `Canceladas` = `0`; `Todas` = `2`                          | Ativas        |

- **Dois papéis apenas.** Ao contrário do formulário NF-e, **não** existe o papel
  `Pesquisar SOMENTE pela Chave`. O conjunto conhecido de rádios medido tem 2 papéis.
- **`Todas` só existe no grupo de status**, e não nos dois grupos como nos
  formulários NF-e. Por isso o teste unitário **não** pode repetir a asserção de que
  dois grupos compartilham uma opção (§5).
- **Rádios com `<label for>`** (nome acessível real), então o papel e as escolhas são
  endereçáveis por `getByRole('radio', { name, exact: true })`.
- **Sem marcador de obrigatório** em nenhum campo (`requiredMarkers: []`).
- **Containers dos campos**: `#altExterno` (inscrição, numa tabela sem id) e
  `#panel-dados` (`table#formularioPanel`: série, datas, escolhas). O escopo é o que
  evita casar duas vezes com o diálogo `Info` oculto, que escreve os mesmos rótulos.

**Inscrição** (`inscription-postback.json`, `arrival-form-state.json`)

- `select` com id gerado e instável (`j_idt39`), **82 opções**, chega no **placeholder**.
- Rótulo da linha na tela NFC-e: **`Inscrição::`** (dois pontos — difere do
  `Inscrição:` do formulário NF-e).
- Selecionar dispara `valueChange` com `partial.render = consultarNFCeForm`; **os
  controles não mudam** (`controlsChanged: false`).

**Datas** (`form-structure.json`)

- `#dataInicial_input` e `#dataFinal_input` (chegam **vazias**), rótulos
  `Data de Emissão Inicial` / `Data de Emissão Final`.

**Aviso** (`notice-controls.json`)

- `Entendi` = 1 botão (único). `Entendido`, `OK`, `Fechar` = 0.

**Tabela e botão** (`scheduled-exports.json`, `schedule-button.json`, `screen-tables.json`)

- Tabela de agendamentos: `div.ui-datatable#lista-agendamentos-nfce`.
- Botões por linha (ex.: `lista-agendamentos-nfce:<row>:j_idt78` = `Info`,
  `j_idt80` = `Download`, `j_idt82` = `Excluir`) — **nunca** acionados por este fluxo.
- Botão de agendamento: `button#j_idt62`, nome acessível **`Agendar exportação`**.
- Na medição havia 15 linhas, **nenhuma** criada hoje e **zero** downloads.

---

## 4. Decisões que a implementação materializa

Fechadas na etapa de grilling desta entrega; destinadas a virar a **ADR 0011** se o
padrão do projeto pedir.

1. **Terceiro fluxo separado** (Q15, ADR 0010 estendida): spec, page object, módulo de
   ciclo, tabela de escolhas, teste unitário e comando próprios. Nenhuma constante de
   NF-e é emprestada.

2. **As escolhas são ditas, não herdadas** (Q15): declarar **e conferir**,
   explicitamente, `Tipo de nota = Saída` (`tipoDeNota=1`) **e**
   `Status da NFC-e = Canceladas` (`statusNota=0`). O fluxo não aceita o padrão da
   tela (Ativas) nem confia que o padrão continue sendo Saída.

3. **Leitura de retorno das escolhas por `toBeChecked()`** (Q16): os rádios de escolha
   da NFC-e **não disparam postback**; a confirmação de que a marcação "pegou" é a
   asserção web-first `toBeChecked()`. Só existe a falha de **não oferecido**
   (`not-offered`), não a de "marcação não pegou".

4. **Um único page object, autónomo** (Q17): `siatweb-nfce-issuer-form.page.ts`, sem
   delegação por composição (KISS). Diferente do page object do emitente NF-e, que
   delega sete operações a um formulário de contribuinte: aqui **não existe** um
   formulário de contribuinte separado na NFC-e, porque a tela já chega no formulário
   de emitente.

5. **Guarda de escolhas desconhecidas**: o conjunto conhecido é
   `MEASURED_ROLE_NAMES` (2 papéis) mais as opções dos dois grupos. Qualquer rádio
   fora disso é recusado antes de qualquer marcação — escolher quais notas o arquivo
   traz **não é decisão da automação**. Qualquer **grupo novo** volta ao usuário.

6. **Reutilizar as classes de erro existentes** (`e2e/support/nfe-export-error.ts`),
   sem classe nova. As mensagens hoje dizem "NF-e export form/screen"; neutralizá-las
   para "export form/screen" é uma melhoria a registrar na ADR 0011, não um requisito
   deste fluxo.

7. **Regra permanente**: nunca acionar `Excluir`. O único efeito fiscal permitido é
   `Agendar exportação`.

8. **Privacidade**: uma falha nomeia a **posição** da inscrição na lista, **nunca** o
   valor. A contagem de linhas é a prova; nunca o conteúdo da linha.

---

## 5. Arquivos a criar e alterar

### Criar

- **`e2e/support/nfce-export-issuer-note-choices.ts`** — dados puros e duas leituras
  puras de request, longe do navegador (mesma forma dos módulos NF-e, **terceira
  cópia consciente**). Deve conter:
  - `NFCE_NOTE_CHOICE_GROUPS`:
    - `{ rowLabel: 'Tipo de nota:', field: 'tipoDeNota', authorised: 'Saída',
options: [{ name: 'Entrada', value: '0' }, { name: 'Saída', value: '1' }] }`
    - `{ rowLabel: 'Status da NFC-e:', field: 'statusNota', authorised: 'Canceladas',
options: [{ name: 'Ativas', value: '1' }, { name: 'Canceladas', value: '0' },
{ name: 'Todas', value: '2' }] }`
  - `NFCE_NOTE_CHOICE_FAILURE = { notOffered: 'not-offered' }` (**reutiliza a mesma
    palavra** dos fluxos NF-e: a classe de erro compara contra o par de destinatário
    para escolher a mensagem, e a palavra precisa coincidir);
  - tipos `NfceNoteChoiceOption`, `NfceNoteChoiceGroup`, `NfceNoteChoiceFailure`;
  - `offersAuthorisedNfceChoice`, `findUnknownNfceChoiceNames` (comparação por
    **multiconjunto**) e `findDivergedNfceNoteChoiceGroup`.

- **`e2e/pages/siatweb-nfce-issuer-form.page.ts`** — `SiatWebNfceIssuerFormPageContract`
  - `SiatWebNfceIssuerFormPage`, autónomo (sem delegação). Constantes medidas:
  * `SCHEDULED_EXPORTS_TABLE_ID = 'lista-agendamentos-nfce'` (filtro do request via
    `javax.faces.partial.render` que **contém** esse id);
  * `INSCRIPTION_ROW_LABEL = 'Inscrição::'` (dois pontos);
  * `STATUS_ROW_LABEL = 'Status da NFC-e:'` (prova de chegada, junto com os controles);
  * `ISSUER_ROLE_NAME = 'Contribuinte como Emitente'`;
  * `SCHEDULE_EXPORT_BUTTON_NAME = 'Agendar exportação'`;
  * `NOTICE_ACKNOWLEDGEMENT_NAME = 'Entendi'`;
  * `EMISSION_START_FIELD_ID = 'dataInicial_input'`,
    `EMISSION_END_FIELD_ID = 'dataFinal_input'`;
  * `MEASURED_ROLE_NAMES` = **2** papéis (Emitente, Destinatário);
  * containers `['#altExterno', '#panel-dados']`;
  * `ISSUER_FORM_SELECTORS` com `row: 'tr'` e `requiredField` (assumido, rótulo de
    pendência — a tela não traz marcador).
    Métodos: `expectOpen(timeoutMs?)` (prova de chegada = controles servidos + linha
    `Status da NFC-e:` visível), `dismissNotice()`, `expectUsable()`,
    `chooseIssuerRole()` (= `check()` idempotente em Emitente + `expectUsable()`),
    `expectNothingUnauthorisedAsked()`, `applyAuthorisedNoteChoices()` (com
    `markChoice` usando `toBeChecked()`), `expectInscriptionOffered`,
    `selectInscription`, `expectInscriptionSelected`, `fillEmissionPeriod`,
    `expectEmissionPeriodKept`, `scheduleExport`, `countScheduledRowsFor`.

- **`e2e/support/nfce-export-issuer-scheduling.ts`** — espelha o ciclo de emitente
  NF-e (`nfe-export-issuer-scheduling.ts`), mas nomeia o page object NFC-e em cada
  passo e usa `openNfceExportScreen` + `chooseIssuerRole`. Contém `ExportToSchedule`
  (com `position`), `toExportTargets`, `chooseIssuerRole`, `refillEmissionPeriod`,
  `scheduleExport`, `expectPortalIsNotOnItsErrorScreen`, `revisitExportScreen`,
  `countScheduledRowsFor`, `waitForScheduledRow`,
  `scheduleEveryConfiguredExport`.

- **`e2e/nfce-export-issuer-scheduling.spec.ts`** — título começando por
  **`@on-demand`**, lendo `getNfeExportInscriptions()` e `getEmissionPeriod()`, com
  `test.setTimeout(schedulingTestDeadlineMs(targets.length))`, terminando em
  `expect(scheduledCount).toBe(targets.length)`.

- **`e2e/unit/nfce-export-issuer-note-choices.test.ts`** — mesma bateria do teste
  unitário NF-e (`e2e/unit/nfe-export-issuer-note-choices.test.ts`), **com uma
  diferença obrigatória**: o teste "os grupos se distinguem pela linha e não pelo
  nome da opção" **não** é copiado. No NF-e ele filtra os grupos que oferecem a
  **própria** escolha autorizada e exige `sharing.length >= 2` — como `Saída` e
  `Canceladas` existem nos seus grupos, a cópia **passaria vazia**, provando uma
  propriedade que aqui não existe. No lugar, provam-se duas coisas: que `rowLabel` e
  `field` são distintos entre os grupos (é o nome que a recusa cita), e que os grupos
  **não** compartilham opção — a medição que separa esta tabela da de NF-e e que um
  erro de cópia dela quebraria. A seção "vocabulário de uma recusa" cobre **só**
  `notOffered`, porque a leitura de retorno é `toBeChecked()` e a falha de marcação
  nunca chega a este módulo.

### Alterar

- **`e2e/pages/siatweb-system.page.ts`** — acrescentar o ramo NFC-e sem tocar no de
  NF-e:
  - `NFCE_MENU_GROUPS = ['Autoatendimento', 'NFC-e']`,
    `NFCE_MENU_ITEM = 'Consultar/Exportar NFC-e'`;
  - `openNfceExportScreen(timeout?)` = hover dos grupos → click do item →
    `siatWebNfceIssuerForm(page).expectOpen()` → `dismissNotice()` →
    `expectUsable()`;
  - adicionar `openNfceExportScreen` a `SiatWebSystemPageContract`.

- **`e2e/pages/factories.ts`** — `siatWebNfceIssuerForm(page)` retornando o contrato,
  autónomo (sem injetar o formulário de contribuinte).

- **`package.json`** — script
  `"test:scheduling:nfce": "playwright test e2e/nfce-export-issuer-scheduling.spec.ts"`.
  O spec é `@on-demand`, então `pnpm test`, `pnpm test:headed` e `pnpm test:ui` já o
  excluem pelo `--grep-invert @on-demand`.

- **`.env.example`** — nota de que as variáveis `E2E_NFE_EXPORT_INSCRIPTIONS`,
  `E2E_NFE_EXPORT_EMISSION_START` e `E2E_NFE_EXPORT_EMISSION_END` são **reutilizadas**
  pelo fluxo NFC-e; **nenhuma** variável nova.

- **`README.md`** — registrar o comando `pnpm test:scheduling:nfce` e o aviso de que
  ele agenda pedidos reais.

### Não alterar

Nenhum fluxo, teste, page object, módulo ou constante de **NF-e**. O ramo NFC-e é
aditivo; se algum arquivo de NF-e precisar mudar, é porque a fronteira está sendo
cruzada e a decisão volta ao usuário.

---

## 6. Regras permanentes e limites conhecidos

- **Nunca `Excluir`.** O único efeito fiscal é agendar.
- **Falha nomeia a posição, nunca o valor.** Inscrição é dado fiscal de empresa real;
  relatório do Playwright copia o que a asserção carrega.
- **Só `Status = Canceladas`.** Qualquer grupo ou opção que o portal acrescente é
  recusado e devolvido ao usuário.
- **A prova não distingue papéis.** A tabela `lista-agendamentos-nfce` não tem coluna
  de papel; um agendamento feito fora da automação entre as duas leituras satisfaria a
  prova. É limitação registrada, não defeito a corrigir.
- **Sem espera por tempo.** Só estado observável; nenhuma espera por `waitForTimeout`.
- **Sem retentativa.** Cada clique em `Agendar exportação` é um pedido real.

---

## 7. Verificação antes de declarar pronto

Executado em 2026-10-09, **sem** rodar o ciclo real contra produção:

| Verificação                            | Resultado                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm typecheck`                       | limpo                                                                       |
| `pnpm lint`                            | limpo                                                                       |
| `pnpm format:check`                    | todos os arquivos no estilo do Prettier                                     |
| `pnpm test:unit`                       | **75 testes passando**, incluindo os 15 novos da tabela NFC-e               |
| `pnpm exec playwright test --list`     | 8 testes em 7 arquivos; o spec NFC-e é coletado com a marca `@on-demand`    |
| `… --list --grep-invert @on-demand`    | 6 testes: a rodada padrão **não** coleta nenhum dos dois ciclos sob demanda |
| `pnpm run test:scheduling:nfce --list` | exatamente **1** teste, no arquivo do ciclo NFC-e                           |

O ciclo real (`pnpm test:scheduling:nfce`) agenda pedidos reais e exige autorização
explícita. Ele foi executado depois disso, em **três execuções autorizadas**, sempre
com uma inscrição só (uma, não as quatro) e sem tocar em `Excluir`:

| Execução | Desfecho                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1ª       | Pedido registrado: a linha apareceu na `lista-agendamentos-nfce` e passou a `Processado`. A visita de fechamento caiu em `comum/erro.xhtml` (`ORA-01924`, papel `RL_NFCU002`) e a prova das linhas não rodou |
| 2ª       | Recusada por sobreposição, com a mensagem do portal no topo do formulário; a prova leu 1 linha antes e 1 depois e falhou com `MissingScheduledExportError`                                                   |
| 3ª       | Depois de a linha da 1ª ser excluída, **o ciclo passou inteiro** em 36,1 s: pedido aceito e a contagem cresceu                                                                                               |

O que essas três execuções fecharam:

- **A checagem em produção** — o pedido sai com o período e as escolhas que a tela
  pedia, e a variação da contagem cresce quando o portal aceita.
- **A recusa por sobreposição (§8.4)** — existe na NFC-e, e o portal responde **200**
  tanto no aceito quanto no recusado: o status não distingue, só a contagem distingue.
- **O predicado `isExportRegistrationRequest` (§8.6)** — deixou de ser analogia da
  NF-e: a lista de atualização do botão está na própria marcação
  (`update:'j_idt62 consultarNFCeForm lista-agendamentos-nfce'`) e o corpo que saiu em
  produção a confirmou.

As medições estão escritas no [spike 08 §7](spikes.md#7-a-tabela-de-agendamentos-e-o-botão).
A intermitência da tela de erro do portal — medida no ciclo de NF-e e repetida aqui na
1ª execução — não é defeito deste fluxo, e o tratamento dela já estava desenhado: falha
nomeada pela rota, sem retentativa.

---

## 8. Pontos abertos

Fechados nesta etapa:

1. **Fronteira do download.** Decidido: o fluxo termina no agendamento e na prova da
   linha; baixar e verificar o arquivo fica para a fase de download
   (`docs/fluxo.md`, §6).
2. **ADR 0011 e spike 08.** Escritas, junto com as entradas do
   [glossário](glossary.md) que este fluxo exigia.

3. **Sobreposição de período.** Fechado: medido em produção na NFC-e (spike 08 §7,
   "A recusa por sobreposição"). O portal recusa o pedido com a mensagem "Já existe
   um agendamento com os parâmetros passados" e responde **200**, igual ao aceito — a
   prova por contagem é que distingue os dois. Ver ADR 0009.
4. **O corpo do request do botão `Agendar exportação`.** Fechado como medição, não
   como analogia: a lista de atualização do botão está na própria marcação
   (`update:'j_idt62 consultarNFCeForm lista-agendamentos-nfce'`) e o corpo que saiu
   em produção confirmou o predicado usado por `isExportRegistrationRequest`. O corpo
   continua sem ser **lido** pela automação — a prova continua sendo a variação da
   contagem —, mas deixou de ser deduzido.

Continuam abertos, e são registrados aqui em vez de resolvidos por conta própria:

5. **Rótulo dos erros.** As mensagens das classes reaproveitadas
   (`e2e/support/nfe-export-error.ts`) dizem "NF-e export form/screen" e citam
   `E2E_NFE_EXPORT_INSCRIPTIONS`; uma recusa da NFC-e sai rotulada como NF-e.
   Neutralizar para "export form/screen" mexe em arquivo e em **teste unitário de
   NF-e** existente, e é por isso que ficou adiado como melhoria separada — ver a
   [ADR 0011](decisoes.md#adr-0011--fluxo-nfce-e-um-terceiro-ciclo-a-tela-própria-da-nfce-e-escolhas-e-prova-próprias).

6. **Narrativa dos outros documentos.** `docs/fluxo.md` (§3.6) e
   `docs/referencia-tecnica.md` descrevem os dois ciclos de NF-e com uma seção cada
   e ainda **não** têm a seção do terceiro. Não entraram no escopo de docs desta
   entrega, que foi ADR 0011 + spike 08 + glossário — daí a lacuna estar registrada
   e não preenchida. O conteúdo para preenchê-las está todo neste documento e na
   ADR 0011.

7. **A recusa do portal continua sem ser lida pelo fluxo.** A mensagem existe na
   tela (medida) e o fluxo não a nomeia: ele só diz que a contagem não cresceu. A
   spike 06 já propunha nomear essa recusa na hora, lendo a área de mensagens sem
   requisição nem espera a mais; a proposta continua não decidida, e agora vale para
   as duas telas.

---

## Referências

- `docs/fluxo.md` — fases do fluxo NF-e (o molde); §6 registra a fase de download.
- `docs/decisoes.md` — ADR 0009 (escolhas ditas e conferidas) e ADR 0010 (ciclo de
  emitente; base para a separação do terceiro fluxo).
- `docs/referencia-tecnica.md` — contratos de página e funções de sequência.
- `e2e/pages/siatweb-nfe-issuer-form.page.ts`,
  `e2e/support/nfe-export-issuer-scheduling.ts`,
  `e2e/nfe-export-issuer-scheduling.spec.ts`,
  `e2e/unit/nfe-export-issuer-note-choices.test.ts`,
  `e2e/support/nfe-export-issuer-note-choices.ts` — moldes diretos.
- `sandbox/inspect-nfce-export-issuer-output/` — artefatos da medição (spike 08).
