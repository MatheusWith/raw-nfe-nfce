# Referência técnica

O companheiro de [`fluxo.md`](fluxo.md). Este documento é para **consulta**: o
que um símbolo é, onde ele mora, o que ele carrega, e o que sustenta a decisão
por trás dele. A narrativa do fluxo — o que cada fase faz e por quê — está no
narrativo.

Como no narrativo, todo símbolo citado é cópia byte a byte da árvore e
conferível com `grep`.

## Sumário

1. [Mapa de módulos](#1-mapa-de-módulos)
2. [Contratos de página](#2-contratos-de-página)
3. [Funções de sequência](#3-funções-de-sequência)
4. [Tipos](#4-tipos)
5. [Seletores](#5-seletores)
6. [Erros](#6-erros)
7. [Prazos e o deadline](#7-prazos-e-o-deadline)
8. [Variáveis de ambiente](#8-variáveis-de-ambiente)
9. [As classes de page object](#9-as-classes-de-page-object)

## 1. Mapa de módulos

Quatro camadas, e a dependência entre elas só aponta para baixo.

| Camada   | Onde                                                    | O que mora lá                                                                         |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Testes   | `e2e/*.spec.ts`                                         | Só o que se verifica. Nenhuma marcação, nenhum seletor, nenhum passo.                 |
| Passos   | `e2e/support/*.ts`                                      | As funções de sequência e a taxonomia de erro. Orquestram telas; não conhecem markup. |
| Telas    | `e2e/pages/*.ts`                                        | Os contratos e as classes. O único lugar do código que conhece markup.                |
| Ambiente | `e2e/support/environment.ts`, `e2e/support/timeouts.ts` | Configuração e prazos. Não conhecem o portal.                                         |

Dois módulos não se encaixam na camadas e ficam de propósito assim:

- **`e2e/pages/factories.ts`** é o único lugar onde um page object é construído.
- **`e2e/support/route.ts`** e **`e2e/support/regex.ts`** comparam endereços, e são
  compartilhados pelas chegadas e pelas esperas.

### A dependência mútua entre `factories.ts` e as telas

`factories.ts` e as telas se referenciam, e isso é uma dependência circular
declarada em voz alta no próprio módulo. Ela é segura **porque toda referência
está dentro do corpo de uma função**: nada em `factories.ts` toca numa classe no
escopo do módulo, e nada nas telas toca em `factories.ts` no escopo do módulo, então
nenhum dos dois é lido antes de ser inicializado.

O caso concreto que a torna necessária: a tela do sistema de destino caminha o
menu até a tela de exportação, e por isso precisa da fábrica da tela de
exportação.

### Por que a construção é explícita no ponto de uso

A alternativa idiomática — uma fixture Playwright distribuindo todas as telas —
foi considerada e recusada, e a razão está escrita em `factories.ts`: faria cada
módulo de passos depender da fixture para poder ser usado, trocando uma
alteração de uma linha por uma mudança de assinatura em dezenove arquivos.

O que se ganha com a construção explícita: cada `factory(page)` devolve o
**contrato**, e nenhum consumidor nomeia uma classe. Uma troca por trás de um
contrato fica invisível, porque nada fora do módulo já nomeou a coisa que está
sendo trocada.

O caso em que isso vira composição: `siatWebNfeIssuerForm(page)` constrói **também**
a tela do contribuinte e a passa no construtor da do emitente, porque aquela
endereça as sete operações que os dois papéis fazem igual. A injeção é decidida ali
e não dentro da classe, para que a classe dependa de um contrato recebido e não de
uma fábrica.

## 2. Contratos de página

Nove interfaces. Cada classe `implements` a sua, e todo consumidor
é tipado contra a interface — nunca contra a classe. Herança de classe concreta é
proibida; compartilhamento entre telas é **interface estendendo interface**. A
decisão e a razão estão no [ADR 0006](decisoes.md#adr-0006--contratos-de-página-interface-estendendo-interface-nunca-herança-de-classe).

As assinaturas abaixo são de nível de assinatura: o nome e o tipo. O JSDoc que
acompanha cada uma no código explica a decisão, e é ele que vale a leitura.

### `SiatWebLoginPageContract`

```ts
readonly certificateEntry: Locator;
open(): Promise<void>;
expectCertificateEntryAvailable(): Promise<void>;
startCertificateAuthentication(): Promise<void>;
```

### `AgeatModulePageContract`

```ts
readonly moduleEntryControl: Locator;
expectOpen(timeoutMs?: number): Promise<void>;
expectModuleRoute(): Promise<void>;
```

### `SiatWebApplicationPanelPageContract`

```ts
readonly moduleEntries: Locator;
getModuleEntry(moduleName: string): Locator;
isRendered(): Promise<boolean>;
```

### `SiatWebContributorSelectionPageContract`

```ts
readonly dialog: Locator;
readonly contributorRows: Locator;
searchAllContributors(): Promise<void>;
selectFirstAvailableContributor(): Promise<string>;
selectContributorByInscription(inscription: string): Promise<string>;
```

`selectContributorByInscription()` está no contrato e **não é chamada** por nada —
é a peça do [ADR 0007](decisoes.md#adr-0007--empresa-da-travessia-por-variável-de-ambiente-não-fixada-no-código) que ainda não foi
religada. Ver as [pendências](fluxo.md#7-pendências).

### `AgeatWelcomePageContract`

```ts
readonly autoRegularizacaoMenuTrigger: Locator;
readonly siatWebMenuOption: Locator;
expectOpen(timeoutMs?: number): Promise<void>;
revealAutoRegularizacaoMenu(): Promise<void>;
openSiatWebSystemOption(): Promise<void>;
```

### `SiatWebSystemPageContract`

```ts
expectOpen(timeoutMs?: number): Promise<void>;
openNfeExportScreen(screenArrivalTimeoutMs?: number): Promise<void>;
```

### `SiatWebNfeExportPageContract`

```ts
readonly arrivalMarker: Locator;
readonly noticeAcknowledgement: Locator;
expectOpen(timeoutMs?: number): Promise<void>;
expectUsable(): Promise<void>;
dismissNotice(): Promise<void>;
```

### `SiatWebNfeContributorFormPageContract`

A maior das oito, e a única que recebe uma referência de agendamento.

```ts
chooseDestinationRecipientRole(): Promise<void>;
expectUsable(timeoutMs?: number): Promise<void>;
expectNothingUnauthorisedAsked(): Promise<void>;
applyAuthorisedNoteChoices(): Promise<void>;
expectInscriptionOffered(
  inscription: string,
  reference: ScheduledExportReference,
): Promise<void>;
countOfferedInscriptions(): Promise<number>;
selectInscription(inscription: string): Promise<void>;
expectInscriptionSelected(inscription: string): Promise<void>;
fillEmissionPeriod(start: string, end: string): Promise<void>;
expectEmissionPeriodKept(
  start: string,
  end: string,
  onFormRerendered: () => Promise<void>,
): Promise<void>;
scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void>;
countScheduledRowsFor(inscription: string): Promise<number>;
```

`selectInscription()` e `scheduleExport()` são os dois pontos onde o fluxo espera
pelo **fio**, e não pela tela. `selectInscription` espera o postback que a seleção
dispara, porque o período é escrito no formulário que esse postback deixa
atrás. `scheduleExport` arma um `waitForRequest` **antes** do clique, porque o
que ele confirma depois — que o pedido saiu com o período configurado e com as
escolhas de notas que o fluxo marcou — é uma leitura do que foi enviado, e um
pedido que nunca saiu não tem nada a ler.

As duas esperas têm limite declarado, e é o que as distingue das ações do menu:
`INSCRIPTION_RERENDER_TIMEOUT_MS` e `EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS`. Sem
limite, elas esperariam até o prazo do teste, e o relatório nomearia o prazo em vez
do passo — foi o que aconteceu com o caminho do menu, medido em 403 s dentro de um
`hover` e mais de 8 minutos em outro, enquanto a página ainda carregava.

`applyAuthorisedNoteChoices()` é o único método do contrato que **marca** um parâmetro
fiscal, e ele marca por grupo: as opções de cada grupo, com o valor que o portal posta
para cada uma, moram em `e2e/support/nfe-export-note-choices.ts`, fora do objeto de
página — é lá que a leitura que compara o pedido fica testável sem portal, que é a
única forma de provar que o valor esperado e o valor medido não divergiram. A mesma
razão põe ali as duas decisões de recusar um grupo: quais opções ele oferece, e quais
nomes de rádio o fluxo reconhece. O objeto de página fica só com a leitura do DOM.

### `SiatWebNfeIssuerFormPageContract`

A tela do **papel de emitente** — `Contribuinte como Emitente` — sobre o mesmo
formulário, e ela faz quatro coisas e delega as outras sete.

```ts
chooseIssuerRole(): Promise<void>;
expectUsable(timeoutMs?: number): Promise<void>;
expectNothingUnauthorisedAsked(): Promise<void>;
applyAuthorisedNoteChoices(): Promise<void>;
expectInscriptionOffered(
  inscription: string,
  reference: ScheduledExportReference,
): Promise<void>;
selectInscription(inscription: string): Promise<void>;
expectInscriptionSelected(inscription: string): Promise<void>;
fillEmissionPeriod(start: string, end: string): Promise<void>;
expectEmissionPeriodKept(
  start: string,
  end: string,
  onFormRerendered: () => Promise<void>,
): Promise<void>;
scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void>;
countScheduledRowsFor(inscription: string): Promise<number>;
```

As quatro que são dela: `chooseIssuerRole` (marca o papel e prova o formulário que
ele abre, levantando `MissingExportControlError` quando o rádio do papel não está na
tela), `expectNothingUnauthorisedAsked` (com o conjunto de nomes que **este** fluxo
mediu), `applyAuthorisedNoteChoices` e `scheduleExport` (o clique, com a conferência
no fio).

As sete restantes são **delegadas**, recebidas no construtor como um
`SiatWebNfeContributorFormPageContract` e construídas pela fábrica. A classe importa
**só o tipo** do outro módulo — nunca a classe —, então não há herança, não há
construção fora de `factories.ts` e nenhuma das duas telas lê a implementação da
outra. O que a segunda duplica e por quê está no
[ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo):
o markup, as leituras do corpo do pedido e a lista de nomes conhecidos são medições
de duas telas que podem divergir, e uma constante só seria uma foto valendo por duas.
O que **não** duplica é a infraestrutura: chegada, erros, prazos, ambiente e fábricas
continuam sendo um só.

### `SiatWebNfceIssuerFormPageContract`

A tela da **NFC-e** — "Consultar/Exportar NFC-e", no ramo `NFC-e` do menu — e o
formulário que ela serve (`consultarNFCeForm`). Dois ciclos trabalham esta tela:
o que agenda `Canceladas` e o que agenda `Todas`. A tela é uma só; o que muda
entre os dois é a tabela de escolhas que passam aos dois métodos que recebem
`groups`.

```ts
expectOpen(timeoutMs?: number): Promise<void>;
expectUsable(timeoutMs?: number): Promise<void>;
dismissNotice(): Promise<void>;
chooseIssuerRole(): Promise<void>;
expectNothingUnauthorisedAsked(): Promise<void>;
applyAuthorisedNoteChoices(): Promise<void>;
applyNoteChoices(groups: readonly NfceNoteChoiceGroup[]): Promise<void>;
expectInscriptionOffered(inscription: string, reference: ScheduledExportReference): Promise<void>;
selectInscription(inscription: string): Promise<void>;
expectInscriptionSelected(inscription: string): Promise<void>;
fillEmissionPeriod(start: string, end: string): Promise<void>;
expectEmissionPeriodKept(
  start: string,
  end: string,
  onFormRerendered: () => Promise<void>,
): Promise<void>;
scheduleExport(period: EmissionPeriod, reference: ScheduledExportReference): Promise<void>;
scheduleExportValidated(
  period: EmissionPeriod,
  reference: ScheduledExportReference,
  groups: readonly NfceNoteChoiceGroup[],
): Promise<void>;
countScheduledRowsFor(inscription: string): Promise<number>;
```

Os dois pares que recebem `groups` são **aditivos pelo ADR 0012**:
`applyNoteChoices(groups)` marca em cada grupo a escolha que a tabela passada
autoriza, e `scheduleExportValidated(period, reference, groups)` registra o pedido
e compara o corpo que saiu com a **mesma** tabela. Os métodos sem parâmetro
(`applyAuthorisedNoteChoices`, `scheduleExport`) são declarações finas que repassam
`NFCE_NOTE_CHOICE_GROUPS` — a tabela do ciclo `Canceladas` —, então o
comportamento de quem já os usava não mudou em nada.

A distinção importa porque a escolha fiscal é do fluxo e a tela é uma só: uma
tabela emprestada de outro ciclo exportaria o conjunto errado **com o pedido
saindo perfeitamente bem** — a falha sem sintoma visível. Ver a
[ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração).

`dismissNotice()` é parte do contrato desta tela porque o aviso "Entendi" sobe em
**toda** visita — a de chegada, a de revisão e a de prova — e com ele no alto o
menu atrás não responde.

## 3. Funções de sequência

As funções que compõem o fluxo. Cada uma aparece no relatório como uma sequência
de `test.step` nomeados, e é essa lista de nomes que o relatório mostra.

**O que esta seção reproduz, e o que não reproduz.** As funções abaixo são
**verbatim**, com uma única omissão declarada: **os comentários não são
reproduzidos.** Toda linha de código que aparece aqui é cópia byte a byte do
arquivo indicado no título, então conferível com `grep` — inclusive os rótulos de
cada `test.step`. Os comentários ficam de fora porque estão no código, ao lado do
que explicam, e copiá-los aqui seria uma segunda cópia para manter. Nenhuma
declaração, nenhuma linha de controle e nenhum ramo foi removido: cada trecho
compila.

### `loginWithCertificate(page)` — `e2e/fixtures/certificate-login.fixture.ts`

```ts
await test.step('Open the SIATWeb login screen', async () => {
  await loginPage.open();
});

await test.step('Confirm the certificate way in is offered', async () => {
  await loginPage.expectCertificateEntryAvailable();
});

await test.step('Present the A1 certificate to the certificate SSO host', async () => {
  await loginPage.startCertificateAuthentication();
});

await test.step('Confirm the session is authenticated', async () => {
  await awaitAuthenticatedSession(page);
});
```

### `openAgeatModule(page)` — `e2e/support/ageat-module-access.ts`

```ts
export async function openAgeatModule(page: Page): Promise<void> {
  await test.step('Choose which company the session acts for', async () => {
    const selection = siatWebContributorSelection(page);
    await selection.searchAllContributors();
    await selection.selectFirstAvailableContributor();
  });

  await openEageatModuleFromPanel(page);
}
```

E `openEageatModuleFromPanel()`, que a travessia também usa:

```ts
await test.step('Open the e-AGEAT module from the application panel', async () => {
  const panel = siatWebApplicationPanel(page);
  await panel.getModuleEntry(AGEAT_MODULE_NAME).first().click();
});

await test.step('Confirm the module page is on screen', async () => {
  const panel = siatWebApplicationPanel(page);
  await expect(panel.moduleEntries).toHaveCount(0);
  const modulePage = ageatModule(page);
  await modulePage.expectOpen();
});
```

### `enterAgeatLegacySystem(page)` — `e2e/support/ageat-legacy-traversal.ts`

```ts
export async function enterAgeatLegacySystem(page: Page): Promise<void> {
  let companyName = '';

  await test.step('Choose the company the traversal runs as', async () => {
    const selection = siatWebContributorSelection(page);
    await selection.searchAllContributors();
    companyName = await selection.selectFirstAvailableContributor();
  });

  await openEageatModuleFromPanel(page);

  await test.step('Cross from the module page into the legacy system', async () => {
    const modulePage = ageatModule(page);
    try {
      await modulePage.expectOpen(LEGACY_ENTRY_TIMEOUT_MS);
      await modulePage.moduleEntryControl.click({ force: true });
    } catch {}
  });

  await test.step('Confirm the legacy welcome screen is on screen', async () => {
    const welcome = ageatWelcome(page);
    await expectArrival(
      page,
      async () => {
        await welcome.expectOpen(LEGACY_ARRIVAL_TIMEOUT_MS);
      },
      (screenText) => buildLandingFailure(companyName, screenText),
    );
  });
}
```

O `catch` acima está **vazio de propósito** — o comentário no código diz por quê: o
módulo pode atravessar sozinho antes de o controle ser acionado, e o pós-requisito
único seguinte é quem decide, com diagnóstico. A decisão está no
[ADR 0005](decisoes.md#adr-0005--tolerância-ao-redirecionamento-automático-prova-de-chegada-antes-do-acionamento-pós-requisito-único).

E o `describeDeadEnd` que ele recebe, que é onde o texto `Usuário não
identificado` decide entre os dois erros:

```ts
function buildLandingFailure(companyName: string, screenText: string): Error {
  if (screenText.includes(LOST_SESSION_SCREEN_TEXT)) {
    return new LostSessionError(companyName, screenText);
  }

  return new LegacyTraversalError(
    'The session reached neither the legacy welcome screen nor the lost-session screen ' +
      'after crossing from the e-AGEAT module.',
    screenText,
  );
}
```

### `enterSiatWebSystem(page)` — `e2e/support/ageat-legacy-traversal.ts`

```ts
export async function enterSiatWebSystem(page: Page): Promise<void> {
  await test.step('Reveal the auto-regularização menu on the welcome screen', async () => {
    const welcome = ageatWelcome(page);
    await welcome.expectOpen();
    await welcome.revealAutoRegularizacaoMenu();
  });

  await test.step('Activate the option that leads to SIATWeb', async () => {
    const welcome = ageatWelcome(page);
    await welcome.openSiatWebSystemOption();
  });

  await test.step('Confirm the session reached the SIATWeb system', async () => {
    const destination = siatWebSystem(page);
    await expectArrival(
      page,
      async () => {
        await destination.expectOpen(SIATWEB_ARRIVAL_TIMEOUT_MS);
      },
      (screenText) =>
        new LegacyTraversalError(
          'The session did not arrive at the SIATWeb system after activating the menu ' +
            'option. A second authentication anywhere along the crossing is an error, ' +
            'and so is any landing that is not the destination.',
          screenText,
        ),
    );
  });
}
```

### `openNfeExportScreen(page)` — `e2e/support/nfe-export-arrival.ts`

```ts
export async function openNfeExportScreen(page: Page): Promise<void> {
  await test.step('Walk the destination menu to the NF-e export screen', async () => {
    const system = siatWebSystem(page);
    await system.openNfeExportScreen(NF_EXPORT_SCREEN_TIMEOUT_MS);
  });

  await test.step('Dismiss the notice on the NF-e export screen', async () => {
    const screen = siatWebNfeExport(page);
    await screen.dismissNotice();
  });

  await test.step('Confirm the NF-e export screen is usable', async () => {
    const screen = siatWebNfeExport(page);
    await screen.expectUsable();
  });
}
```

### `scheduleExport(page, target, period)` — `e2e/support/nfe-export-scheduling.ts`

```ts
export async function scheduleExport(
  page: Page,
  target: ExportToSchedule,
  period: EmissionPeriod,
): Promise<void> {
  const form = siatWebNfeContributorForm(page);

  await test.step(`Check the form offers the inscription at position ${target.position}`, async () => {
    await form.expectInscriptionOffered(target.inscription, target);
  });

  await test.step(`Select the inscription at position ${target.position}`, async () => {
    await form.selectInscription(target.inscription);
    await form.expectInscriptionSelected(target.inscription);
  });

  await test.step('State which notes the exported file must bring', async () => {
    await form.applyAuthorisedNoteChoices();
  });

  await test.step('Fill the emission period and confirm the form kept it', async () => {
    await form.fillEmissionPeriod(period.start, period.end);
    await form.expectEmissionPeriodKept(period.start, period.end, async () => {
      await refillEmissionPeriod(page, period);
    });
  });

  await test.step('Register the export request', async () => {
    await form.scheduleExport(period, target);
  });
}
```

### `revisitExportScreen(page)` — `e2e/support/nfe-export-scheduling.ts`

```ts
export async function revisitExportScreen(page: Page): Promise<void> {
  await test.step('Reload the export screen', async () => {
    await page.reload();
    expectPortalIsNotOnItsErrorScreen(page);
  });

  await test.step('Dismiss the notice the reload brought the screen back with', async () => {
    await siatWebNfeExport(page).dismissNotice();
  });

  await openNfeExportScreen(page);
  await chooseDestinationRecipientRole(page);
}
```

### `scheduleEveryConfiguredExport(page, targets, period)` — `e2e/support/nfe-export-scheduling.ts`

O desenho é o que o [ADR 0008](decisoes.md#adr-0008--ciclo-de-agendamento-um-teste-uma-sessão-lista-inteira-série-sem-retentativa) decidiu:

```ts
export async function scheduleEveryConfiguredExport(
  page: Page,
  targets: readonly ExportToSchedule[],
  period: EmissionPeriod,
): Promise<number> {
  const failures: unknown[] = [];
  const scheduled: { target: ExportToSchedule; rowsBefore: number }[] = [];

  for (const target of targets) {
    await test.step(`Schedule the export of the inscription at position ${target.position} of ${String(targets.length)}`, async () => {
      try {
        await revisitExportScreen(page);
        const rowsBefore = await countScheduledRowsFor(page, target);
        await scheduleExport(page, target, period);
        scheduled.push({ target, rowsBefore });
      } catch (failure) {
        failures.push(failure);
      }
    });
  }

  await test.step('Confirm a new row for every scheduled inscription', async () => {
    await revisitExportScreen(page);

    for (const { target, rowsBefore } of scheduled) {
      try {
        const rowsAfter = await waitForScheduledRow(page, target, rowsBefore);
        expect(rowsAfter, `rows for position ${target.position}`).toBeGreaterThan(rowsBefore);
      } catch (failure) {
        failures.push(failure);
      }
    }
  });

  const [firstFailure] = failures;
  if (firstFailure instanceof Error) {
    throw firstFailure;
  }
  if (firstFailure !== undefined) {
    throw new Error('The scheduling cycle met a failure that was not an error.', {
      cause: firstFailure,
    });
  }

  return scheduled.length;
}
```

Quatro coisas que o código faz e que vale notar:

- **A primeira falha é elevada como foi elevada.** Envolver a exceção trocaria a
  fase que falhou por um resumo que o relatório não sabe usar. O ramo seguinte
  existe para a falha que chegou e não era uma `Error` — que não tem nome de fase
  para carregar, então vira um erro explícito em vez de sumir.
- **Um item cujo agendamento falhou não entra em `scheduled`**, e portanto não é
  esperado depois: não há linha vindo para um pedido que nunca foi registrado.
- **`rowsBefore` é contado antes do pedido**, para que uma linha deixada por um
  ciclo anterior não possa servir de prova deste.
- **A lista inteira é percorrida mesmo com uma falha no meio**, e é por isso que o
  relatório é a única forma de saber o que ficou agendado em produção.

### O ciclo de emitente — `e2e/support/nfe-export-issuer-scheduling.ts`

O segundo ciclo, pelo papel `Contribuinte como Emitente`, e ele é uma **nova
instância da mesma costura** em vez de uma variante da primeira
([ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo)):
um teste, uma sessão, uma apresentação de certificado e a lista inteira, com o
mesmo período e a mesma lista de inscrições.

O módulo exporta a mesma superfície do outro — `toExportTargets`,
`chooseIssuerRole`, `scheduleExport`, `revisitExportScreen`,
`countScheduledRowsFor`, `waitForScheduledRow` e
`scheduleEveryConfiguredExport` — e cada função nomeia a tela do emitente em vez da
do destinatário. Os dois módulos de ciclo **não se importam em nenhum lugar**: o
trabalho (`ExportToSchedule`, `toExportTargets`) e a rota da tela de erro interna
(`PORTAL_ERROR_SCREEN_PATH`, `expectPortalIsNotOnItsErrorScreen`) são declarados
de novo, e a razão de cada um está escrita onde ele é declarado. São poucas linhas
sem comportamento para divergir, e são o preço de uma garantia que o compilador
deveria ter de impor à mão: que um ciclo não anda por dentro do outro.

O que é compartilhado continua sendo só infraestrutura: `openNfeExportScreen`,
`nfe-export-error`, `route`, `timeouts`, `environment` e as fábricas.

### O ciclo NFC-e Todas — `e2e/support/nfce-export-issuer-all-status-scheduling.ts`

O quarto ciclo, segundo do ramo NFC-e, com `Tipo de nota` = `Saída` e
`Status da NFC-e` = `Todas`
([ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração)).
Ele redeclara a mesma superfície dos ciclos de agendamento — `ExportToSchedule`,
`toExportTargets`, `chooseIssuerRole`, `refillEmissionPeriod`, `scheduleExport`,
`revisitExportScreen`, `countScheduledRowsFor`, `waitForScheduledRow`,
`PORTAL_ERROR_SCREEN_PATH` com a sua checagem e
`scheduleEveryConfiguredExport` — com a mesma razão de sempre escrita onde cada
um é declarado: os ciclos de agendamento **não se importam em nenhum lugar**, e a
duplicação de poucas linhas sem comportamento para divergir é o preço da garantia
de que um não anda por dentro do outro. As classes de erro e os prazos são os
existentes, importados sem cópia.

As duas diferenças estruturais deste ciclo, ambas medidas:

- **As escolhas vêm de fora.** `scheduleExport` chama o objeto de tela com
  `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS` — `Saída` (`tipoDeNota` = `1`) e `Todas`
  (`statusNota` = `2`) —, declarada em
  `e2e/support/nfce-export-issuer-all-status-note-choices.ts` como **dado só**: sem
  funções e sem vocabulário de recusa próprios. Uma troca de `statusNota` por aqui
  muda o arquivo sem tocar em código de leitura.
- **O prazo deriva do formato do próprio ciclo.**
  `allStatusSchedulingTestDeadlineMs(count)` soma travessia + `count` × (passo da
  inscrição + visita de prova) + folga, e recusa `RangeError` para contagem não
  positiva ou fracionária. A visita de prova é paga **por item** aqui — não existe
  passe final de lote —, então o termo por item leva as duas cadeias; a função
  mora ao lado do ciclo (`timeouts.ts` é dono das constantes e das cadeias, não do
  formato de um ciclo) e tem bateria unitária própria, sem tocar em
  `timeouts.test.ts`.

Compartilhado com os outros ciclos: `loginWithCertificate`, `openAgeatModule`,
`enterAgeatLegacySystem`, `enterSiatWebSystem`, a chegada e a travessia pelo
ramo `NFC-e`, `nfe-export-error`, `route`, `timeouts`, `environment` e as
fábricas. A prova de cada item é a variação da contagem de linhas em
`lista-agendamentos-nfce`, lida **na visita própria do item**, depois do clique e
antes do item seguinte: a spike 06 mediu que a linha só entra na listagem numa
nova carga, e `expect.poll` de contagem sem `waitForTimeout` é o que converte essa
medição em prova.

### `expectArrival(page, proveArrival, describeDeadEnd)` — `e2e/support/arrival.ts`

A forma compartilhada de toda chegada da suíte, e a menor de todas:

```ts
export async function expectArrival(
  page: Page,
  proveArrival: () => Promise<void>,
  describeDeadEnd: (screenText: string) => Error,
): Promise<void> {
  try {
    await proveArrival();
  } catch {
    throw describeDeadEnd(await readVisibleText(page));
  }
}
```

Chegar a algum lugar e ler onde se caiu são duas perguntas diferentes, e a segunda
só vale a pena quando a primeira falhou. Só o **contorno** é compartilhado; qual
beco sem saída é o de cada fluxo é do fluxo, e por isso o texto da tela é lido uma
vez aqui em vez de uma vez por chegada.

### `awaitAuthenticatedSession(page)` — `e2e/support/certificate-authentication-outcome.ts`

```ts
export async function awaitAuthenticatedSession(page: Page): Promise<void> {
  const afterHandoff = await pollUntilSettled(page, CERTIFICATE_HANDOFF_TIMEOUT_MS);
  if (afterHandoff === 'authenticated') {
    return;
  }
  if (afterHandoff === 'refused') {
    raiseForRefusal();
  }
  if (afterHandoff === 'on-login-screen') {
    throw new PortalUnavailableError(
      'The portal did not finish the certificate hand-off before the timeout.',
    );
  }

  const afterSso = await pollUntilSettled(page, CERTIFICATE_SSO_SETTLE_TIMEOUT_MS);
  if (afterSso === 'authenticated') {
    return;
  }
  if (afterSso === 'refused') {
    raiseForRefusal();
  }
  if (afterSso === 'in-certificate-sso') {
    await raiseForUnmappedStep(page);
  }
  if (afterSso === 'on-login-screen') {
    throw new PortalUnavailableError(
      'The browser went back to the login screen after the certificate hand-off.',
    );
  }
  throw new PortalUnavailableError(
    'The certificate was accepted, but the portal had not finished establishing the session when the wait ended.',
  );
}
```

Dois tempos porque são dois eventos: a entrega do certificado ao portal, e depois
o assentamento do host de SSO. Um timeout no `pollUntilSettled` **não** é fatal —
a classificação feita depois dele nomeia o estado exato em que o navegador ficou.

## 4. Tipos

### `EmissionPeriod` — `e2e/support/environment.ts`

```ts
export interface EmissionPeriod {
  readonly start: string;
  readonly end: string;
}
```

Ambas em `dd/mm/yyyy`, o formato que a tela mostra. As duas leituras são validadas
com um _round-trip_ por instante UTC, que recusa um dia que o calendário não tem
(`31/02` vira `03/03`) sem que fuso nenhum consiga deslocar o resultado.

### `ScheduledExportReference` — `e2e/support/nfe-export-error.ts`

```ts
export interface ScheduledExportReference {
  readonly position: string;
}
```

A **posição** é texto, e o tipo diz por quê: existe para ser citada numa mensagem,
não calculada. E é a única forma de identificar uma exportação sem que o valor
fiscal saia do navegador.

### `ExportToSchedule` — `e2e/support/nfe-export-scheduling.ts`

```ts
export interface ExportToSchedule extends ScheduledExportReference {
  readonly inscription: string;
}
```

A inscrição viaja porque o navegador precisa dela; a posição viaja porque tudo o
que for dito sobre ela a quem leu o relatório tem de ser dito sem o valor.

O tipo e `toExportTargets()` são **declarados de novo** em
`e2e/support/nfe-export-issuer-scheduling.ts`, e é uma das duas duplicações do
projeto que não têm fonte única. Não é conhecimento de tela — é a lista configurada
virando posição —, então a tentação era lê-los do ciclo de destinatário; ela foi
recusada porque faria um ciclo depender do outro, e nenhum dos dois faz isso em
lugar nenhum. São quatro linhas sem comportamento para divergir, e se alguma vez
crescerem a resposta é um módulo próprio, não um empréstimo de um dos ciclos.

### `ExportNoteChoiceGroup` — `e2e/support/nfe-export-note-choices.ts`

```ts
export interface ExportNoteChoiceOption {
  readonly name: string;
  readonly value: string;
}

export interface ExportNoteChoiceGroup {
  readonly rowLabel: string;
  readonly field: string;
  readonly authorised: string;
  readonly options: readonly ExportNoteChoiceOption[];
}
```

O par **nome e valor** é o que sustenta a conferência: `name` é o que a pessoa lê no
`<label for>` do rádio e o que o fluxo marca; `value` é o que o portal posta, e é com
ele que o pedido é comparado. `rowLabel` existe porque `Todas` é opção dos dois
grupos — o nome da opção não diz a qual grupo ela pertence. E o módulo fica **fora**
do objeto de página de propósito: sem navegador, a leitura do pedido vira uma função
pura, e é a única costura em que se prova que o valor esperado e o valor medido não
divergiram depois de alguém editar a tabela.

### `IssuerNoteChoiceGroup` — `e2e/support/nfe-export-issuer-note-choices.ts`

```ts
export interface IssuerNoteChoiceOption {
  readonly name: string;
  readonly value: string;
}

export interface IssuerNoteChoiceGroup {
  readonly rowLabel: string;
  readonly field: string;
  readonly authorised: string;
  readonly options: readonly IssuerNoteChoiceOption[];
}
```

Mesma forma que `ExportNoteChoiceGroup`, e **nenhum campo é importado de lá**. Duas
medições de duas telas que concordam hoje e podem divergir amanhã: um módulo só
estaria sendo uma foto valendo por duas, e a divergência apareceria como uma
exportação errada em vez de como uma falha. O desenho do módulo é o mesmo, inclusive
a vocabulária de recusa (`ISSUER_NOTE_CHOICE_FAILURE`) e a guarda que mantém as
mensagens em sincronia com as classes de erro. [ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo).

### `AllStatusNfceNoteChoiceGroup` — `e2e/support/nfce-export-issuer-all-status-note-choices.ts`

```ts
export interface AllStatusNfceNoteChoiceOption {
  readonly name: string;
  readonly value: string;
}

export interface AllStatusNfceNoteChoiceGroup {
  readonly rowLabel: string;
  readonly field: string;
  readonly authorised: string;
  readonly options: readonly AllStatusNfceNoteChoiceOption[];
}
```

Mesma forma que `IssuerNoteChoiceGroup`, e **nenhum campo é importado de lá**.
Aqui as duas tabelas descrevem, porém, **uma só medição** — a spike 08 mediu a
tela da NFC-e inteira uma vez para os dois ciclos —, e a guarda que as separa é
outra: o teste unitário deste fluxo compara as duas tabelas da NFC-e nos fatos de
tela (rótulo, campo, opções, valores) e exige que **coincidam**, restando como
diferença livre só o que cada fluxo autoriza, fixado como o par `Saída`/`Todas`.
O desenho do módulo segue o mesmo dos outros: **só dados**, sem funções nem
vocabulário de recusa próprios — marcar e ler vivem no objeto de página,
parametrizados pelo `groups` que o contrato recebe
([ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração)).

### `RequiredScreenControl` — `e2e/support/screen-readiness.ts`

```ts
export interface RequiredScreenControl {
  readonly name: string;
  readonly locator: (page: Page) => Locator;
}
```

O locator é uma **função** e não um `Locator` porque o controle só existe depois
que a tela é servida. Os controles são **nomeados** e não contados, porque uma
tela que renderiza metade do formulário e uma que não renderizam nenhuma são
falhas diferentes, e só os nomes as distinguem.

### `AuthenticationOutcome` — `e2e/support/certificate-authentication-outcome.ts`

```ts
type AuthenticationOutcome =
  'on-login-screen' | 'in-certificate-sso' | 'refused' | 'establishing-session' | 'authenticated';
```

Uma union discriminada de valores fechados. `isSettled()` marca os dois estados
finais — `refused` e `authenticated` — e é isso que `pollUntilSettled` espera.

### `SiatWebFixtures` — `e2e/fixtures/certificate-login.fixture.ts`

```ts
interface SiatWebFixtures {
  certificateContext: BrowserContext;
  certificatePage: Page;
}
```

`certificateContext` é o contexto capaz de apresentar o A1 na negociação TLS;
`certificatePage` é a página criada nele, e por ser fixture ela é **por teste**.

## 5. Seletores

Cinco objetos `as const`, um por page object que carrega markup medido. A regra do
projeto é que **nenhum localizador carrega markup escrito por extenso dentro de
si mesmo**: o markup vai para um objeto `as const` no page object que o usa, com a
justificativa escrita ao lado. O motivo é único e está no `AGENTS.md`: a marcação
da tela passa a ter uma fonte da verdade só, e fica visível de relance.

Os cinco objetos abaixo são **reproduzidos na íntegra, comentários incluídos** —
e aqui o comentário _é_ parte da entrega, porque é ele que declara a medição que
sustenta o seletor. Um seletor sem a justificativa ao lado é um seletor que ninguém
conferiu.

São quatro telas e cinco objetos, e a diferença é o formulário de exportação: ele é
endereçado por **dois** page objects, o do contribuinte e o do emitente, e cada um
declara o que ele próprio endereça. Uma constante partilhada faria uma tela ler a
implementação da outra — que é o que o desenho dos dois objetos proíbe — e pôr o
markup num módulo de suporte feriria a camada de cima desta mesma tabela: suítes
orquestram telas e não conhecem markup. As duas entradas medidamente iguais foram
medidas duas vezes, na spike 06 e na spike 07; a correção de uma delas é feita nos
dois objetos, e a escolha está registrada no
[ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo).

### `CONTRIBUTOR_SELECTION_SELECTORS`

```ts
const CONTRIBUTOR_SELECTION_SELECTORS = {
  /**
   * A company the session may act for.
   *
   * The dialog lists the companies in a table, so a row is a table row. The
   * header row is excluded by filtering on the select control rather than by
   * position, which keeps the result honest if the portal adds or reorders
   * columns.
   */
  row: 'tr',
} as const;
```

### `APPLICATION_PANEL_SELECTORS`

```ts
const APPLICATION_PANEL_SELECTORS = {
  /**
   * Every module the signed-in user may open.
   *
   * The href prefix is what says "this link opens a module", whatever internal
   * identifier the portal routes it by.
   */
  moduleEntry: `a[href^="${MODULE_HREF_PREFIX}"]`,
} as const;
```

### `AGEAT_WELCOME_SELECTORS`

```ts
const AGEAT_WELCOME_SELECTORS = {
  /**
   * The visible dropdown toggle.
   *
   * The class list is what picks the visible toggle over the hidden same-label
   * duplicate the page also renders; the label then narrows it to this menu.
   */
  menuToggle: 'a.dropdown-toggle.btn',

  /**
   * The option that leads to the SIATWeb system.
   *
   * Matched by href and not by accessible name on purpose: the revealed menu
   * holds both "SIAT" and "SISAT", and a name match cannot tell them apart
   * because Playwright matches accessible names by substring.
   */
  siatWebOption: `.dropdown-menu a[href="${SIATWEB_OPTION_HREF}"]`,
} as const;
```

### `CONTRIBUTOR_FORM_SELECTORS`

O maior dos cinco, com nove entradas.

```ts
const CONTRIBUTOR_FORM_SELECTORS = {
  /**
   * A row of the form, carrying the label the person reads in one cell and the
   * control in the next.
   *
   * Measured: the form is built as rows, and a `tr` narrowed by the exact visible
   * label is the one relation common to both containers the fields are split across
   * (spike 06, "O formulário de destinatário"). No semantic locator replaces it — the
   * form exposes no group, no landmark and no list to be the container. The label is
   * checked for uniqueness where it is used, so a portal that adds a second row with
   * the same label fails instead of quietly matching two.
   */
  row: 'tr',

  /**
   * The inscription control, inside the row its own label identifies.
   *
   * Measured: the inscription carries no `label[for]`, no `aria-label` and no
   * `placeholder` (spike 06), so neither `getByLabel` nor `getByRole` can name it,
   * and its server id `j_idt39` is a generated counter that shifts between loads
   * (spike 06). The row is the only stable relation left, and this is the only
   * `select` in it.
   */
  inscriptionSelect: 'select',

  /**
   * How a field would mark itself required.
   *
   * **Justification pending.** The measured form carries no required marker anywhere
   * (spike 06), so which spelling the portal would use if it added one was never
   * observed. Both attribute forms are written here on the strength of HTML rather
   * than of a measurement — the outcome is safe either way, but the shape is an
   * assumption and is labelled as one.
   */
  requiredField: '[required], [aria-required="true"]',

  /**
   * Wrapper the scheduled exports table is rendered in, by its server id.
   *
   * Measured: the table element itself carries neither id nor class, and its header
   * cells concatenate the column filter the table has, so only `Situação`, `ID`,
   * `Data de criação` and `Ações` come out clean (spike 06). This id is written by
   * hand, unlike the `j_idt…` counters the portal generates, so it does not shift.
   *
   * Scoping is not tidiness: the table is paginated and the page carries others, so a
   * count taken over the page reports the header bar and the pagination as exports
   * and misreports whether anything was added (measured — counting whole-page
   * `table tbody tr` returned the form's own row and reported a false success).
   */
  scheduledExportsWrapper: `#${SCHEDULED_EXPORTS_TABLE_ID}`,

  /**
   * A data row of that table.
   *
   * Measured for the reason given above: the count has to exclude the header bar and
   * the pagination, which only a row scoped inside the wrapper does.
   */
  scheduledExportsRow: 'table tbody tr',

  /**
   * The element carrying one column's value inside a row.
   *
   * **Justification pending.** Spike 06 records which columns the table carries, not
   * which element holds a column's value. `td` is written here on the strength of
   * what a table is rather than of a measurement — ask before trusting the shape.
   */
  scheduledExportsCell: 'td',

  /**
   * Containers the form's own fields live in.
   *
   * Measured, and the reason is measured too: the fields are **not** under one
   * parent. The inscription sits in a table with no id inside `span#altExterno`,
   * while the company name, the note number and the two dates sit in
   * `table#formularioPanel` inside `span#panel-dados`, and the common ancestor is a
   * `div` with no id at all (spike 06). A check scoped to one of them would cover
   * half the form and pass while missing the other half — which is exactly the defect
   * the first attempt at this flow had, where it skipped the inscription in silence.
   * No semantic locator replaces it: a span with no role is not one.
   */
  formFieldContainers: ['#altExterno', '#panel-dados'],

  /**
   * Server id of the first emission date field.
   *
   * Markup addressing, under the same measurement: the field carries a visible label
   * but no `label[for]`, no `aria-label` and no `placeholder`, so no semantic locator
   * can name it. This id is written by hand, unlike the inscription's `j_idt39`,
   * which is a generated counter and shifts between loads.
   */
  emissionStartField: `#${EMISSION_START_FIELD_ID}`,

  /** Server id of the last emission date field, under the same measurement. */
  emissionEndField: `#${EMISSION_END_FIELD_ID}`,
} as const;
```

### `ISSUER_FORM_SELECTORS`

O quinto objeto, e o menor dos dois do formulário de exportação: três entradas.
O objeto da página do emitente declara **só o que ele próprio endereça** — o papel
se marca por papel acessível e o clique por papel acessível, então nenhum dos dois
precisa de markup — e o que ele endereça é a guarda de campo obrigatório e a
marcação das escolhas, que são as operações que pertencem àquele page object.

```ts
const ISSUER_FORM_SELECTORS = {
  /**
   * A row of the form, carrying the label the person reads in one cell and the
   * control in the next.
   *
   * Measured in spike 07: the form is built as rows, and the row carrying a group's
   * label is an **outer** row — the radios sit in a row of their own that carries
   * only the options. A `tr` narrowed by the exact visible label is the one relation
   * common to both containers the fields are split across, and it lands on the outer
   * row, which contains the radios as descendants. No semantic locator replaces it:
   * the form exposes no group, no landmark and no list to be the container. The label
   * is checked for uniqueness where it is used, so a portal that adds a second row
   * with the same label fails instead of quietly matching two.
   */
  row: 'tr',

  /**
   * Containers the form's own fields live in.
   *
   * Measured in spike 07, and the reason is measured too: the fields are not under
   * one parent — the inscription sits in a table with no id inside `span#altExterno`,
   * while the company name, the note number, the dates and the choice groups sit in
   * `table#formularioPanel` inside `span#panel-dados`. Scoping to them rather than to
   * the page is what keeps the hidden Info dialog, which stays in the DOM and writes
   * the same labels with the same colons, from matching twice. No semantic locator
   * replaces it: a span with no role is not one.
   */
  formFieldContainers: ['#altExterno', '#panel-dados'],

  /**
   * How a field would mark itself required.
   *
   * **Justification pending.** Spike 07 measured no required marker anywhere on this
   * form either, so which spelling the portal would use if it added one was never
   * observed. Both attribute forms are written here on the strength of HTML rather
   * than of a measurement — the outcome is safe either way, but the shape is an
   * assumption and is labelled as one.
   */
  requiredField: '[required], [aria-required="true"]',
} as const;
```

Duas entradas — `row` e `formFieldContainers` — trazem os **mesmos valores** da
página do contribuinte, e o comentário de cada uma difere porque cada cita a **sua**
medição: a spike 06 mediu os dois no formulário de destinatário, a spike 07 os mediu
de novo no de emitente e os achou idênticos. Isso está escrito no objeto e no
[ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo):
as três saídas possíveis foram testadas contra o que o projeto escreve, e duas delas
violariam uma regra documentada. O `row` do emitente traz a medição **novo** da spike
07 — o rótulo de cada grupo está na linha externa, célula por célula —, que a spike 06
não tinha separado.

### Medido contra assumido

Nove entradas, sete medidas e **duas assumidas**. As duas assumidas estão marcadas
`**Justification pending.**` no próprio código, e a distinção importa porque o modo
de falha delas é oposto:

| Entrada                | Estado                         | Modo de falha se estiver errada                                                                                |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `requiredField`        | Assumida pela HTML             | **Silencioso** — a guarda nunca dispara, e o campo novo é ignorado.                                            |
| `scheduledExportsCell` | Assumida pelo que uma tabela é | **Alto** — a contagem dá zero e a prova do ciclo reprova com `MissingScheduledExportError`. Nunca verde falso. |

O motivo de as duas terem justificativa pendente e não uma justificativa inventada
está escrito no cabeçalho do próprio objeto: _um motivo ausente convida à pergunta,
onde um motivo inventado parece uma resposta._

### Os ids e marcadores que não são seletores

Some estão fora do objeto, porque não são markup de tela — são nomes de rota, de
campo ou de request:

| Constante                      | Valor                                    | O que é                                                                                                   |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `LOGIN_PATH`                   | `/painel-aplicacoes`                     | Rota da tela de login. Exportada, porque o classificador de autenticação precisa reconhecer a mesma rota. |
| `APPLICATION_PANEL_PATH`       | `/painel-aplicacoes/main`                | Rota do painel autenticado.                                                                               |
| `AGEAT_MODULE_NAME`            | `e-AGEAT`                                | Fonte única do nome do módulo, no painel e na rota dele.                                                  |
| `SCHEDULED_EXPORTS_TABLE_ID`   | `lista-agendamentos`                     | Id escrito à mão pelo portal; único, então nomeia exatamente uma tabela.                                  |
| `EMISSION_START_FIELD_ID`      | `dataInicial_input`                      | Id do primeiro campo de emissão. Escrito à mão.                                                           |
| `EMISSION_END_FIELD_ID`        | `dataFinal_input`                        | Id do último campo de emissão. Escrito à mão.                                                             |
| `VALUE_CHANGE_POSTBACK_MARKER` | `javax.faces.behavior.event=valueChange` | O que distingue o postback do próprio formulário do request que o botão faz.                              |
| `PORTAL_ERROR_SCREEN_PATH`     | `/siatweb/faces/views/comum/erro.xhtml`  | A tela de erro interno do portal, identificada pela rota e não pelo texto.                                |

## 6. Erros

Dezesseis classes em quatro módulos. **Nenhuma tem classe base**, e a razão está
no cabeçalho de cada módulo: o que um relatório mostra é o nome da classe e a
mensagem, então é o **nome** que carrega a fase que falhou. Uma classe base embaixo
seria uma categoria que nada lê.

Consequência de leitura: para saber em que fase um teste vermelho falhou, leia o
`name` do erro, não a hierarquia.

### `e2e/support/certificate-login-error.ts` — 3 classes

| Classe                            | Quando                                                                                                                                              | O que carrega                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `CertificateRejectedError`        | O A1 não pôde ser lido, o navegador recusou o PFX, ou o portal redirecionou para `/painel-aplicacoes/certificado-erro`.                             | `message`, `cause`.                |
| `PortalUnavailableError`          | O portal não respondeu como esperado, independente do certificado. Três pontos: abrir a tela de login, ativar a entrada, e o hand-off não terminar. | `message`, `cause`.                |
| `UnmappedAuthenticationStepError` | O host de SSO pediu algo **depois** de aceitar o certificado.                                                                                       | `message`, `visibleText`, `cause`. |

### `e2e/support/legacy-traversal-error.ts` — 2 classes

| Classe                 | Quando                                                                                                                             | O que carrega                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `LegacyTraversalError` | A travessia pousou numa tela que o fluxo não conhece, ou não chegou ao destino depois de ativar a opção do menu.                   | `message`, `screenText`, `cause`.     |
| `LostSessionError`     | A travessia caiu em `Usuário não identificado`. **A empresa é a primeira suspeita** — é ela que decide se a saída leva ao destino. | `companyName`, `screenText`, `cause`. |

O texto da tela é limitado a `MAX_SCREEN_TEXT_LENGTH` (300 caracteres) para a
mensagem continuar legível.

### `e2e/support/nfe-export-error.ts` — 10 classes

Todas com `ScheduledExportReference` quando o erro é sobre um item da lista, e
todas nomeando a **posição**, nunca o valor.

| Classe                                         | Quando                                                                                                                                                                                                                    | O que carrega                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `MissingExportControlError`                    | A tela chegou sem um controle que o fluxo precisa. Levantado **antes** de a tela ser tocada, para que um controle que nunca renderizou não seja relatado como um que não pôde ser acionado.                               | `missingControls`, `cause`.                                   |
| `InscriptionNotOfferedError`                   | O formulário não oferece a inscrição configurada.                                                                                                                                                                         | `reference`, `offeredCount`.                                  |
| `UnexpectedFormChoiceError`                    | Um grupo de opção não ficou com a escolha autorizada marcada. **Duas causas, uma classe, duas mensagens**: `failure` diz qual foi — `not-offered` é mudança do lado do portal, `not-marked` é desta automação.            | `failure`, `group`, `actualChoice`.                           |
| `UnknownFormChoiceError`                       | O formulário carrega uma opção que o fluxo não conhece.                                                                                                                                                                   | `unknownChoices`.                                             |
| `UnknownRequiredFieldError`                    | O formulário marca como obrigatório um campo que o formulário medido não tem.                                                                                                                                             | `requiredFieldIds`.                                           |
| `PortalInternalErrorScreenError`               | O portal respondeu na própria tela de erro interno, `ORA-01924`. **Não há retentativa**: a falha é do portal, e a única coisa que responde se o pedido foi registrado é a prova da contagem de linhas.                    | `route`, `cause`.                                             |
| `ExportRequestWithoutPeriodError`              | O pedido de exportação saiu com o período vazio.                                                                                                                                                                          | `reference`, `cause`.                                         |
| `ExportRequestWithUnauthorisedNoteChoiceError` | O pedido de exportação saiu sem a escolha de notas que o fluxo marcou no formulário. **Não ecoa o valor posto**: é parâmetro fiscal de uma exportação real.                                                               | `reference`, `choiceName`, `authorisedChoice`.                |
| `RejectedFieldValueError`                      | Um campo não guardou o valor escrito nele.                                                                                                                                                                                | `fieldName`, `cause`.                                         |
| `MissingScheduledExportError`                  | A linha do agendamento não apareceu na tabela depois da revisita. Carrega as **duas** contagens, porque "não há linha" e "a linha já estava lá antes desta rodada" são falhas diferentes e só as contagens as distinguem. | `reference`, `requiredRowCount`, `observedRowCount`, `cause`. |

**O fluxo de emitente usa exatamente estas classes, e nenhuma nova foi criada.**
Onde ele escolhe um papel, uma escolha ou um clique, ele fala com a mesma
família — `MissingExportControlError` para o papel que não veio na tela,
`UnknownFormChoiceError` e `UnknownRequiredFieldError` para a guarda,
`UnexpectedFormChoiceError` para a marcação, as duas do pedido e
`MissingScheduledExportError` para a linha que não apareceu. O vocabulário de recusa
que é dele — `ISSUER_NOTE_CHOICE_FAILURE`, em `nfe-export-issuer-note-choices.ts` —
é dado e não classe: ele preenche o campo `failure` de `UnexpectedFormChoiceError`,
e existe um teste unitário que falha se o texto dele sair de sincronia com as
mensagens que a classe conhece.

### `e2e/support/environment.ts` — 2 classes

| Classe                            | Quando                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `MissingEnvironmentVariableError` | Uma variável que a automação não roda sem está ausente ou em branco. |
| `InvalidEnvironmentValueError`    | A variável está presente e o valor não pode ser usado.               |

As duas são distintas **de propósito**: uma pede para preencher a variável, a
outra para corrigir o que foi preenchido, e confundi-las manda a correção para o
lugar errado.

## 7. Prazos e o deadline

Onze limites declarados, em `e2e/support/timeouts.ts`. O módulo não sabe nada
sobre o portal: **um limite é um teto que uma espera pode alcançar sem que a rodada
esteja errada.**

| Constante                                | Valor | O que limita                                                                                                                                                                                                                 |
| ---------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CERTIFICATE_HANDOFF_TIMEOUT_MS`         | 60 s  | Sair da tela de login e alcançar o host de SSO do certificado.                                                                                                                                                               |
| `CERTIFICATE_SSO_SETTLE_TIMEOUT_MS`      | 15 s  | O host de SSO terminar a sua parte. Graça curta: o navegador legitimamente fica na URL do Keycloak um instante.                                                                                                              |
| `LEGACY_ENTRY_TIMEOUT_MS`                | 15 s  | O controle de entrada do sistema legado aparecer no módulo.                                                                                                                                                                  |
| `LEGACY_ARRIVAL_TIMEOUT_MS`              | 60 s  | A sessão alcançar a tela de boas-vindas, ou um beco sem saída documentado.                                                                                                                                                   |
| `SIATWEB_ARRIVAL_TIMEOUT_MS`             | 60 s  | A sessão alcançar o sistema de destino depois da opção clicada.                                                                                                                                                              |
| `MENU_WALK_TIMEOUT_MS`                   | 15 s  | O caminho do menu ficar utilizável antes de o item ser ativado: dois `hover` e um `click`. Antes media 403 s dentro de um único `hover`, sem uma requisição depois dele.                                                     |
| `NF_EXPORT_SCREEN_TIMEOUT_MS`            | 60 s  | A tela de exportação ser servida depois do item de menu ativado.                                                                                                                                                             |
| `FORM_CONTROLS_TIMEOUT_MS`               | 60 s  | O formulário servir os próprios controles depois do papel marcado.                                                                                                                                                           |
| `INSCRIPTION_RERENDER_TIMEOUT_MS`        | 60 s  | O formulário ser re-renderizado pelo pós-retorno que a escolha da inscrição dispara. Mesmo relógio do outro pós-retorno: o formulário inteiro volta na resposta.                                                             |
| `EMISSION_PERIOD_TIMEOUT_MS`             | 15 s  | Os campos de emissão assentarem no período escrito. Graça curta: a reescrita é local ao datepicker e não atravessa o portal.                                                                                                 |
| `EXPORT_REGISTRATION_REQUEST_TIMEOUT_MS` | 10 s  | O request de registro sair do navegador depois do clique. **Não** é uma espera pelo portal: existe porque a confirmação de que o pedido levou o período é uma leitura do fio, e um pedido que nunca saiu não tem nada a ler. |
| `SCHEDULED_ROW_TIMEOUT_MS`               | 60 s  | A linha agendada aparecer na tabela depois da revisita.                                                                                                                                                                      |
| `NOTICE_DISMISSAL_TIMEOUT_MS`            | 5 s   | O aviso sair da tela depois do seu reconhecimento acionado.                                                                                                                                                                  |

### As cadeias

Quatro cadeias, e **não** uma soma de tudo:

| Cadeia                                 | O que é                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRAVERSAL_WAIT_CHAIN_MS`              | As esperas que **todo** teste que atravessa o portal paga, na ordem em que paga.                                                                                                                                                                                                                                                                                                         |
| `SCHEDULED_INSCRIPTION_PASS_BOUNDS_MS` | O que **uma inscrição** custa o ciclo: o caminho do menu abre a travessia, a tela chega, o aviso sai duas vezes, o papel é marcado e o formulário é servido, a inscrição é escolhida e o formulário volta re-renderizado, o período assenta, o request de registro sai. A espera pela linha **não** está aqui: uma linha não pertence a um item, ela é lida na visita que fecha o ciclo. |
| `SCHEDULED_CLOSING_VISIT_BOUNDS_MS`    | O que a visita que fecha o ciclo custa: mais uma travessia da tela e do formulário, com o caminho do menu que a abre, e a espera pelas linhas que este ciclo registrou.                                                                                                                                                                                                                  |
| `LONGEST_WAIT_CHAIN_MS`                | A maior corrida de esperas em que um teste pode estar sentado.                                                                                                                                                                                                                                                                                                                           |

E o deadline:

| Constante                     | O que é                                                                                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST_DEADLINE_SLACK_MS`      | A **folga** sobre as esperas. O único número do módulo que não é medição. Paga duas coisas: as leituras que não nomeiam limite próprio e herdam o do Playwright, e a variância normal de uma rodada contra um portal de produção. |
| `TEST_DEADLINE_MS`            | `LONGEST_WAIT_CHAIN_MS` mais a folga. É o `timeout` da configuração do Playwright.                                                                                                                                                |
| `schedulingTestDeadlineMs(n)` | Travessia uma vez, uma passagem por inscrição `n` vezes, a visita de fechamento uma vez, a folga uma vez.                                                                                                                         |

### Por que não é a soma de todos os limites

Porque **as esperas estão em alternativas**. Uma sessão chega à tela de
boas-vindas ou cai na tela de sessão perdida, nunca as duas; e o hand-off só ganha
uma segunda chance quando a primeira não assentou. Somar cada ramo com o outro
descreveria uma rodada que não pode acontecer.

A propriedade que importa é a oposta: **um teste que esgota o prazo esgotou a
espera em que ele estava**, e por isso consegue relatar a tela que respondeu em vez
de um timeout pelado.

`schedulingTestDeadlineMs()` lança `RangeError` quando `n` não é um inteiro
positivo — um ciclo sem nada para agendar receberia tempo suficiente só para se
autenticar, e falharia numa tela sobre a qual ele jamais alcançaria um veredito.

### O segundo prazo derivado, do ciclo NFC-e Todas

`allStatusSchedulingTestDeadlineMs(n)`, em
`e2e/support/nfce-export-issuer-all-status-scheduling.ts`, deriva do **formato daquele
ciclo**, não do de todos: travessia uma vez, uma passagem por inscrição **com a sua
própria visita de prova** `n` vezes, a folga uma vez. A visita de fechamento de um
único passe não existe neste ciclo — quem lê a prova de cada item paga a visita que a
leitura exige, dentro da própria iteração —, então o termo por item leva duas cadeias
(`SCHEDULED_INSCRIPTION_WAIT_CHAIN_MS` e `SCHEDULED_CLOSING_WAIT_CHAIN_MS`) em vez
de uma.

A função mora ao lado do próprio ciclo porque `timeouts.ts` é dono das **constantes
e das cadeias** — o que todo teste espera —, e não do formato de um ciclo
específico; o mesmo `RangeError` para contagem não positiva ou fracionária vale
aqui, e a bateria unitária é a de
`e2e/unit/nfce-export-issuer-all-status-scheduling.test.ts`, sem alterar
`timeouts.test.ts`.

### A folha de guarda

`DECLARED_WAIT_BOUNDS_MS` lista os onze limites declarados, e existe para que um
limite novo não possa ser deixado de fora de uma cadeia. A suíte unitária falha
quando isso acontece. É a única verificação automática da derivação, e ela não
depende de portal.

## 8. Variáveis de ambiente

Todas lidas por `e2e/support/environment.ts`, e nenhuma com valor padrão quando a
automação não roda sem ela. `playwright.config.ts` chama `getBaseUrl()` no escopo
do módulo, então uma configuração errada falha **antes** de qualquer navegador
abrir.

| Variável                        | Obrigatória | Quando é exigida                  | O que é                                                                                                                                                                   |
| ------------------------------- | ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`                  | sim         | Na configuração, ao carregar      | Endereço do portal sob teste, sem barra final.                                                                                                                            |
| `E2E_CERT_SSO_ORIGIN`           | sim         | Quando a fixture monta o contexto | Origem do host de SSO, e **a única** para a qual o A1 é apresentado.                                                                                                      |
| `E2E_CERT_PATH`                 | sim         | Quando a fixture monta o contexto | Caminho absoluto do arquivo A1, fora do repositório. O nome da variável é exportado para que a falha aponte para a variável a corrigir, em vez de ecoar um caminho local. |
| `E2E_CERT_PASSWORD`             | sim         | Quando a fixture monta o contexto | Senha do A1.                                                                                                                                                              |
| `E2E_SIATWEB_SYSTEM_ORIGIN`     | sim         | Na travessia, ao chegar           | Origem do sistema de destino. A URL de chegada da travessia é absoluta porque a origem é outra.                                                                           |
| `E2E_COMPANY_INSCRIPTION`       | sim         | **Nunca — ver abaixo**            | Inscrição estadual da empresa que a sessão representa.                                                                                                                    |
| `E2E_NFE_EXPORT_INSCRIPTIONS`   | sim         | No ciclo de agendamento           | Lista de inscrições a agendar, separada por vírgulas, **na ordem em que devem ser agendadas**. A ordem é da pessoa e nunca é ordenada.                                    |
| `E2E_NFE_EXPORT_EMISSION_START` | sim         | No ciclo de agendamento           | Início do período, em `dd/mm/yyyy`.                                                                                                                                       |
| `E2E_NFE_EXPORT_EMISSION_END`   | sim         | No ciclo de agendamento           | Fim do período, em `dd/mm/yyyy`.                                                                                                                                          |
| `E2E_USER` / `E2E_PASSWORD`     | não         | —                                 | Só para o formulário de CPF/CNPJ, que esta automação **não** usa.                                                                                                         |
| `E2E_DOWNLOAD_DIR`              | não         | —                                 | Diretório de downloads, para a fase de download.                                                                                                                          |

### `E2E_COMPANY_INSCRIPTION`: exigida e nunca lida

Esta é a única divergência entre o que a documentação promete e o que o código faz,
e ela está registrada aqui em vez de ser escondida:

- O [`.env.example`](../.env.example) a declara **exigida, sem valor padrão**.
- O [ADR 0007](decisoes.md#adr-0007--empresa-da-travessia-por-variável-de-ambiente-não-fixada-no-código) a transformou na fonte da
  empresa da travessia.
- `getCompanyInscription()` existe em `e2e/support/environment.ts` e é **exportada**.
- `selectContributorByInscription()` existe no contrato da tela de seleção de
  contribuinte e **nunca é chamada**.
- `enterAgeatLegacySystem()` chama `selectFirstAvailableContributor()`.

Consequência: a variável não é exigida em momento algum, porque nada a lê, e a
empresa da travessia é a primeira disponível — a escolha que a spike 05 provou
**errada**. Ver as [pendências](fluxo.md#7-pendências).

### A leitura das inscrições

`getNfeExportInscriptions()` devolve `[string, ...string[]]`, e o tipo diz o que a
leitura já garante: uma variável em branco e um item vazio são ambos recusados.
A pontuação é removida (`[.\-/ \t]`), porque o diálogo de contribuinte mostra a
inscrição pontuada e o dropdown do formulário de exportação a mostra como dígitos
soltos — então quem cola qualquer uma das duas formas resolve para o mesmo
número. O que sobrar não-dígito é **erro de digitação**, não formatação, e é
relatado em vez de descartado em silêncio.

A leitura recusa, cada uma nomeando a posição do item: item vazio, item com
caracteres que não são dígitos nem pontuação, e item que repete outro anterior
(agendar a mesma inscrição duas vezes agendaria a mesma exportação duas vezes).

## 9. As classes de page object

Dez classes. Todas têm a mesma forma: `constructor(private readonly page: Page)`,
o estado é só a página, e **não há estado próprio nem armazenamento entre
chamadas** — com uma exceção declarada, a do emitente, cujo construtor recebe
também o page object do contribuinte a que delega as sete operações comuns. Ele
guarda o **contrato**, nunca a classe, e a fábrica é o único lugar que os constrói.

O que cada uma **deliberadamente omite** é a parte que mais importa, e é a
consequência direta do [ADR 0006](decisoes.md#adr-0006--contratos-de-página-interface-estendendo-interface-nunca-herança-de-classe): uma superfície
mínima é o que dificulta alcançar por acidente um controle que não deveria ser
acionado.

| Classe                            | O que modela                                                                                                                        | O que omite de propósito                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SiatWebLoginPage`                | A entrada por certificado.                                                                                                          | A entrada por CPF/CNPJ — é uma segunda forma de entrar, e o fluxo não a usa.                                                                            |
| `SiatWebApplicationPanelPage`     | A lista de módulos e a entrada de um módulo pelo nome.                                                                              | Nada mais do painel.                                                                                                                                    |
| `SiatWebContributorSelectionPage` | A busca e as duas formas de escolher uma empresa.                                                                                   | Fechar o diálogo sem escolher: o portal não deixa, e fingir que deixa seria um caminho que não existe.                                                  |
| `AgeatModulePage`                 | **Só a chegada**, e o único controle de entrada no legado.                                                                          | Tudo que age sobre um documento — reconhecer mensagem, responder.                                                                                       |
| `AgeatWelcomePage`                | O menu de auto-regularização e a opção que leva ao destino.                                                                         | O resto da tela de boas-vindas.                                                                                                                         |
| `SiatWebSystemPage`               | A chegada, e o caminho de ida para a tela de exportação.                                                                            | A tela do destino em si: a travessia termina na chegada.                                                                                                |
| `SiatWebNfeExportPage`            | **Só a chegada**: que a tela abriu no formulário de busca por chave, que os controles estão, que o aviso saiu.                      | O formulário do contribuinte — é o outro componente, e este não o alcança.                                                                              |
| `SiatWebNfeContributorFormPage`   | O formulário do contribuinte inteiro: papel, inscrição, período, agendamento, contagem.                                             | As escolhas do papel de emitente — é o outro componente, e este não as conhece.                                                                         |
| `SiatWebNfeIssuerFormPage`        | O formulário **sob o papel de emitente**: o papel, a guarda, as escolhas e o clique conferido no fio.                               | As sete operações comuns, que delega ao objeto acima injetado no construtor.                                                                            |
| `SiatWebNfceIssuerFormPage`       | O formulário da **NFC-e** sob o papel de emitente: papel, guarda, escolhas, inscrição, período, clique conferido no fio e contagem. | Qual fluxo está rodando: as escolhas chegam como parâmetro (`applyNoteChoices(groups)`, `scheduleExportValidated(..., groups)`), e a tabela é do ciclo. |

Dez classes e nove telas. A diferença é o formulário de exportação de NF-e,
modelado **duas vezes** — uma para cada papel — porque as duas medições que o
sustentam podem divergir
([ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo)).
O formulário da NFC-e é a nona tela: classe própria, medição própria
([spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)),
e **dois ciclos** o usam — é a única classe cuja escolha fiscal não está nela
([ADR 0011](decisoes.md#adr-0011--fluxo-nfce-um-terceiro-ciclo-a-tela-própria-da-nfce-escolhas-e-prova-próprias),
[ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração)).

### O que uma tela não expõe e por quê

Duas omissões são decididas por uma medição, e não por disciplina:

**`SiatWebLoginPage` não tem operação de chegada.** Nada na tela de login marca
ela como distinta de uma sessão ainda sendo estabelecida, que é servida do prefixo
de rota logo acima. Uma operação inventada para preencher o vão afirmaria uma
distinção que a tela não faz. `open()` é a prova de chegada — navega e **depois**
prova que a entrada de certificado está na tela — e `expectCertificateEntryAvailable()`
é a verificação de prontidão que a segue.

**`SiatWebContributorSelectionPage` também não tem.** O diálogo é a resposta do
portal a chegar sem empresa escolhida, não um marcador que distingue esta tela de
qualquer outra. `searchAllContributors()` é a prova de chegada — roda a busca e
**depois** prova que uma linha pode ser escolhida — e todo o resto são passos que
a seguem.

### Os helpers privados que importam

`SiatWebNfeContributorFormPage` é a única classe com membros privados, e eles
existem porque cada um responde a uma pergunta que o browser não deixa responder
de fora:

| Membro                         | Por que é privado                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expectChoiceMarked(choice)`   | Um grupo de opção é achado pelo rótulo da linha, porque `Todas` é opção dos dois grupos. A unicidade do rótulo é **conferida**, não assumida.                                                  |
| `unknownChoiceNames()`         | A lista `MEASURED_CHOICE_NAMES` é um **multiconjunto**, não um conjunto, justamente porque `Todas` aparece nos dois grupos — é isso que permite notar uma opção desconhecida.                  |
| `requiredFieldIds()`           | Lê os ids dos campos marcados, e **nunca os valores**: um id é um nome que o servidor inventou, e um valor seria dado fiscal.                                                                  |
| `radioChoiceNames(radios)`     | O nome acessível de um radio tem de ser lido de dentro da página, porque não há outro jeito de perguntar a um browser. E os radios são os únicos controles da tela com `<label for>` — medido. |
| `markedChoiceNames(container)` | O mesmo, para os radios marcados dentro de um contêiner.                                                                                                                                       |

## Ver também

- [`fluxo.md`](fluxo.md) — o fluxo fase a fase, e por que ele é feito assim.
- [Glossário de domínio](glossary.md) — o vocabulário das telas e dos conceitos.
- [`AGENTS.md`](../AGENTS.md) — as regras do projeto, e o objetivo do download.
- [Decisões](decisoes.md) — as doze decisões técnicas (ADR 0001 a 0012).
- [Medições](spikes.md) — as cinco rondas de inspeção contra o portal (spikes 04 a 08).
