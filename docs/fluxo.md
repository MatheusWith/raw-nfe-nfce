# O fluxo: do login por certificado ao agendamento das exportações

Este documento é o narrativo da automação. Ele conta o que o fluxo faz, fase a
fase, e explica por que ele é feito assim. O companheiro
[`referencia-tecnica.md`](referencia-tecnica.md) é a outra metade: as
assinaturas, os seletores, os erros e os prazos, para consulta.

Se você chega ao projeto agora, leia este arquivo inteiro. Se você já conhece o
fluxo e quer saber o que um símbolo significa, pule para a
[referência técnica](referencia-tecnica.md).

Todo símbolo citado aqui — nome de função, de classe, de constante, de rota, de
string de seletor — é cópia byte a byte da árvore, e portanto conferível com
`grep`. Se um deles divergir do código, é o código que está certo e este
documento que está errado: corrija o documento no mesmo commit.

## Sumário

1. [O que a automação faz, e onde ela está](#1-o-que-a-automação-faz-e-onde-ela-está)
2. [As quatro aplicações](#2-as-quatro-aplicações)
3. [O fluxo em sete fases](#3-o-fluxo-em-sete-fases)
4. [Os invariantes da suíte](#4-os-invariantes-da-suíte)
5. [Como estender o fluxo: medir antes de escrever](#5-como-estender-o-fluxo-medir-antes-de-escrever)
6. [A fase de download: o que já existe](#6-a-fase-de-download-o-que-já-existe)
7. [Pendências](#7-pendências)

## 1. O que a automação faz, e onde ela está

O objetivo final do projeto é **baixar os arquivos do portal e nada mais**. Ele
está definido no [`AGENTS.md`](../AGENTS.md) e é permanente: as entregas
atuais são a pré-condição dele, e nenhuma outra ação é executada além do
verificável para o download.

O download ainda não foi implementado. Onde a automação está hoje:

```
spec  →  loginWithCertificate        login por certificado A1
      →  enterAgeatLegacySystem      módulo e-AGEAT → sistema legado
      →  enterSiatWebSystem          sistema legado  → sistema de destino
      →  openNfeExportScreen         menu → "Consultar/Exportar NF-e"
      →  scheduleEveryConfiguredExport  agenda a lista inteira de inscrições
                                       e prova cada agendamento
```

Cada uma dessas cinco funções é **nomeada, explícita e chamada pelo teste**. Não
há `beforeEach`, não há `globalSetup`, nenhum estado é compartilhado entre
testes, e a autenticação aparece no relatório como etapas nomeadas, exatamente
como as outras quatro. A razão está no
[ADR 0003](decisoes.md#adr-0003--estratégia-de-login-componente-reutilizável-por-teste-sem-estado-global-compartilhado): um estado preparado uma vez e
compartilhado esconderia justamente a classificação de falha que o login sozinho
entrega.

`scheduleEveryConfiguredExport` existe em **quatro módulos**, um por fluxo, e é a
única etapa desse diagrama que tem mais de uma versão — ver
[fase 6](#36-fase-6--o-mesmo-agendamento-pelo-papel-de-emitente-sob-demanda) e
[fase 7](#37-fase-7--o-mesmo-agendamento-na-tela-da-nfce-com-o-status-em-todas-sob-demanda).
As quatro primeiras funções são as mesmas em todos os casos, e a troca de papel e
de tela acontece dentro da última.

### A regra do efeito fiscal

Rodar a suíte significa **registrar pedidos de exportação reais, para empresas
reais, em um portal de produção**. Daí decorrem três regras que a automação
cumpre e que valem para qualquer código novo:

- **Nenhuma ação com efeito fiscal.** Sem assinar, finalizar, transmitir,
  autorizar, excluir ou arquivar. Agendar a exportação é o máximo — e é
  necessário, porque é o pedido que produz o arquivo a ser baixado.
- **Nenhuma retentativa.** Uma retentativa deste fluxo não é uma segunda
  chance: é um segundo pedido de exportação para a mesma empresa, no mesmo
  período. Ver [§4](#4-os-invariantes-da-suíte).
- **Nenhum dado fiscal em relatório, log ou mensagem.** A inscrição estadual e o
  período de emissão são dados fiscais de empresa real, e uma asserção Playwright
  que falha é copiada direto para o relatório. Por isso toda falha nomeia a
  **posição** do item na lista configurada, nunca o valor — a posição é algo que
  quem configurou consegue mapear de volta para o seu próprio valor, e identifica a
  exportação com a mesma precisão sem o valor sair do navegador.

### O que não é executado

Para além da regra do efeito fiscal, três coisas estão fora do escopo por
decisão, não por esquecimento:

- **Download.** A [seção 6](#6-a-fase-de-download-o-que-já-existe) registra o que
  já existe para ele. Nenhum arquivo é baixado hoje.
- **A tela do sistema de destino, depois da chegada.** A travessia termina na
  chegada; nenhum clique é executado no sistema de destino pela travessia em si.
  O que a automação faz nele é o caminho de ida para a tela de exportação.
- **Conteúdo de e-AGEAT.** Nenhuma das empresas da conta tem conteúdo cadastrado,
  e todas abrem a mesma tela. O page object do módulo modela **só a chegada** —
  ver [Pendências](#7-pendências).

## 2. As quatro aplicações

O fluxo atravessa quatro aplicações, e a distinção entre elas é a confusão mais
cara de quem chega ao projeto: **o portal e o sistema de destino chamam-se
ambos "SIATWeb" e são aplicações diferentes, em origens diferentes.**

| Aplicação                    | Papel no fluxo                                                                                                  | Origem                                | Variável de ambiente        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------- |
| Portal                       | De onde a sessão parte. Hospeda a tela de login, o painel de aplicações e o diálogo de seleção de contribuinte. | `siatweb.sefaz.pi.gov.br`             | `E2E_BASE_URL`              |
| Host de SSO de certificado   | Recebe o certificado A1 na negociação TLS e devolve o código de autorização.                                    | `siatweb-certificado.sefaz.pi.gov.br` | `E2E_CERT_SSO_ORIGIN`       |
| Sistema legado (e-AGEAT)     | Aplicação JSF servida em caminho próprio pelo portal. A sessão a atravessa a caminho do destino.                | `/eageat`, mesmo portal               | —                           |
| Sistema de destino (SIATWeb) | Onde os arquivos do fluxo estão. É aqui que a exportação é agendada e de onde ela será baixada.                 | `webas.sefaz.pi.gov.br`               | `E2E_SIATWEB_SYSTEM_ORIGIN` |

Duas consequências práticas saem da tabela, e as duas aparecem no código:

- **A URL de chegada do sistema de destino é absoluta**, montada a partir de
  `E2E_SIATWEB_SYSTEM_ORIGIN`. Uma rota começada com `/` resolveria para a origem
  do portal e nunca chegaria lá.
- **O A1 tem escopo restrito a uma origem só.** O certificado é apresentado
  apenas ao host de SSO, nunca ao portal nem ao sistema de destino. Ampliar esse
  escopo é uma decisão que exige o usuário, e o
  [ADR 0004](decisoes.md#adr-0004--mecanismo-do-certificado-a1-negociação-tls-de-certificado-de-cliente) registra por quê.

O vocabulário completo das telas, dos controles e dos conceitos está no
[glossário de domínio](glossary.md).

## 3. O fluxo em sete fases

Cada fase abaixo diz: qual spec é dona dela, que funções a compõem, em que rota
acaba, o que **prova**, e o que acontece quando ela falha. A seção
[Referência técnica](referencia-tecnica.md) tem a lista completa de erros e
seletores; aqui vão só os que a fase realmente usa.

### 3.1 Fase 1 — Login por certificado

**Spec dona:** `e2e/certificate-login.spec.ts`, `signs in with the A1 certificate`.

**Funções:** `buildClientCertificates()` monta o contexto,
`loginWithCertificate(page)` executa, e `awaitAuthenticatedSession(page)`
classifica o desfecho.

O login não é um formulário. O bloco `CERTIFICADO DIGITAL` da tela de login
delega a autenticação a um host de SSO dedicado do Keycloak, que aceita o
certificado **na negociação TLS** — não há upload de arquivo nem instalação de
componente local. O A1 é apresentado pelo Playwright via `clientCertificates`,
com o arquivo lido em memória para que a senha não vire argumento de navegador.

Quatro etapas nomeadas, nesta ordem:

| Etapa                                                    | O que faz                                                                           | Falha                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| `Open the SIATWeb login screen`                          | Navega para `/painel-aplicacoes` e prova que a entrada de certificado está visível. | `PortalUnavailableError` |
| `Confirm the certificate way in is offered`              | Confirma que o controle está habilitado.                                            | erro do Playwright       |
| `Present the A1 certificate to the certificate SSO host` | Clica na entrada, e o navegador apresenta o certificado ao chegar no host de SSO.   | `PortalUnavailableError` |
| `Confirm the session is authenticated`                   | Classifica o desfecho.                                                              | ver abaixo               |

**O que prova.** A sessão está viva. Isso é mais difícil do que parece, e a
razão está no [ADR 0003](decisoes.md#adr-0003--estratégia-de-login-componente-reutilizável-por-teste-sem-estado-global-compartilhado): o portal serve a tela de
login e o painel autenticado a partir do **mesmo prefixo de rota**
(`/painel-aplicacoes`), e a rota de callback responde uma casca `Loading...`
antes de a sessão existir. Só a lista de módulos presente prova sessão viva — é
isso que `isRendered()` exige, e por isso o spec verifica as duas metades
separadamente.

**Becos sem saída, cada um com erro próprio.** O classificador
`classifyOutcome()` devolve um veredito — nunca lança — e quem consome transforma
em erro:

| Estado                 | Erro                              | Quando                                                                              |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `refused`              | `CertificateRejectedError`        | O portal redirecionou para `/painel-aplicacoes/certificado-erro`.                   |
| `in-certificate-sso`   | `UnmappedAuthenticationStepError` | O Keycloak pediu algo **depois** de aceitar o certificado. Carrega o texto da tela. |
| `on-login-screen`      | `PortalUnavailableError`          | O portal não terminou a entrega, ou o navegador voltou ao login.                    |
| `establishing-session` | `PortalUnavailableError`          | O certificado foi aceito, mas a sessão não se estabeleceu.                          |

Um timeout aqui não é fatal: a classificação depois dele nomeia o estado exato em
que o navegador ficou, o que é mais útil do que um timeout pelado.

### 3.2 Fase 2 — Chegar ao módulo e-AGEAT

**Spec dona:** `e2e/ageat-access.spec.ts`,
`opens the e-AGEAT module from a certificate session`.

**Funções:** `openAgeatModule(page)`, que compõe a escolha da empresa e
`openEageatModuleFromPanel(page)`.

O painel de aplicações é a rota de chegada de **toda** visita autenticada, e ele
lista os módulos. Duas etapas:

1. **`Choose which company the session acts for`** — o diálogo
   `Selecionar Contribuinte` é modal e **bloqueia os módulos até uma empresa ser
   escolhida**; a sessão entra como CONTADOR. `searchAllContributors()` roda a
   única busca que funciona sem já conhecer um identificador — a busca com todos
   os campos vazios — e `selectFirstAvailableContributor()` escolhe a primeira.
2. **`Open the e-AGEAT module from the application panel`** — a entrada do
   módulo é clicada, e a chegada é provada esperando a **lista de módulos
   desaparecer** antes de acreditar na página do módulo. A rota muda antes do
   painel ser trocado, e essa ordem é o que impede que a troca seja lida como
   chegada.

**O que prova.** A página do módulo e-AGEAT está na tela. O spec verifica
três coisas separadamente: a rota é a do módulo, a entrada de certificado não
está mais visível (a sessão não caiu de volta no login) e o marcador da página do
módulo está visível.

**A divergência conhecida desta fase.** A escolha da empresa usa
`selectFirstAvailableContributor()`, e o
[ADR 0007](decisoes.md#adr-0007--empresa-da-travessia-por-variável-de-ambiente-não-fixada-no-código) diz que essa escolha está
**errada** e que a empresa deveria vir de `E2E_COMPANY_INSCRIPTION`. O código da
decisão existe — `getCompanyInscription()` e
`selectContributorByInscription()` estão ambos escritos e prontos — mas a
travessia nunca foi religada neles. Ver [Pendências](#7-pendências).

### 3.3 Fase 3 — A travessia

**Spec dona:** `e2e/ageat-legacy-access.spec.ts`, com dois testes: um para a
primeira travessia e um para a segunda.

**Funções:** `enterAgeatLegacySystem(page)` e `enterSiatWebSystem(page)`.

A travessia leva a sessão do módulo e-AGEAT até o **sistema de destino**, passando
pelo sistema legado, dentro de uma sessão contínua. A cadeia medida é:

```
módulo e-AGEAT
  → "Acessar Sistema"
  → tela de boas-vindas (bemVindo.jsf, título "e-Processo")
  → menu "Autorregularização"
  → opção "SIAT" (javascript:logarSiatWeb();)
  → https://webas.sefaz.pi.gov.br/siatweb/faces/index.xhtml
```

**sem segunda autenticação** e sem nenhum clique na tela do destino — a
travessia termina na chegada. Uma segunda autenticação, ou qualquer pouso que não
seja o destino, é **erro**, nunca uma etapa a contornar.

#### A primeira travessia: módulo → sistema legado

| Etapa                                                | O que faz                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `Choose the company the traversal runs as`           | A empresa, e o texto da linha, ficam guardados para a mensagem de falha. |
| `Open the e-AGEAT module from the application panel` | Reabrir o módulo, como na fase 2.                                        |
| `Cross from the module page into the legacy system`  | Provar a chegada **antes** de acionar, e clicar.                         |
| `Confirm the legacy welcome screen is on screen`     | O pós-requisito único.                                                   |

Três decisões carregam esta travessia, e as três estão registradas fora do
código:

**A chegada é provada antes do acionamento.** Depois do acionamento o controle
`Acessar Sistema` não existe mais, então a única janela para provar que ele estava
lá é antes. E é essa única prova: esperar pelo controle e depois afirmá-lo
provava a mesma coisa duas vezes, e a segunda com um prazo curto o bastante para
relatar um controle que já tinha chegado como um que nunca chegou.

**O clique precisa de `force: true`.** O overlay de carregamento que o módulo
desenha sobre a página intercepta os eventos de ponteiro. É medido, e por isso o
`eslint-disable` do `playwright/no-force-option` está ao lado do clique com a
razão escrita.

**Um único pós-requisito absorve os dois caminhos.** O portal às vezes atravessa
sozinho para o legado cerca de 15 s depois da chegada, sempre recebendo HTTP 500
em `bemVindo.jsf`, e não foi provado que isso é determinístico. Então clicar e
esperar são o mesmo caminho: qualquer falha intermediária é absorvida, e **a
decisão final é sempre** `Confirm the legacy welcome screen is on screen`. Nada é
engolido em silêncio — o pós-requisito seguinte falha com diagnóstico. A decisão
está no [ADR 0005](decisoes.md#adr-0005--tolerância-ao-redirecionamento-automático-prova-de-chegada-antes-do-acionamento-pós-requisito-único), e ela tem uma condição:
se a tolerância se provar intermitente, deixa de ser tolerância e vira
instabilidade a corrigir pela causa.

**Becos sem saída, com erro próprio:**

| Pouso                      | Erro                   | O que ele carrega                                                                                                                             |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Usuário não identificado` | `LostSessionError`     | O nome da empresa — **a empresa é a primeira suspeita**, porque é exatamente ela que decide se a saída leva ao destino. Mais o texto da tela. |
| Qualquer outro             | `LegacyTraversalError` | O texto da tela, limitado a 300 caracteres.                                                                                                   |

O texto `Usuário não identificado` é lido **dentro do `catch`**, e a falha tem o
nome do `step` que a compôs. É assim que um beco sem saída legítimo vira
diagnóstico em vez de uma falha anônima.

#### A segunda travessia: sistema legado → sistema de destino

| Etapa                                                      | O que faz                                 |
| ---------------------------------------------------------- | ----------------------------------------- |
| `Reveal the auto-regularização menu on the welcome screen` | Clica o toggle e espera a opção aparecer. |
| `Activate the option that leads to SIATWeb`                | Clica a opção `SIAT`.                     |
| `Confirm the session reached the SIATWeb system`           | Espera a URL absoluta de chegada.         |

A tela do destino é modelada **só pela chegada e pelo caminho de ida para a tela
de exportação**. A chegada é a URL, montada por
`buildSiatWebSystemArrivalUrlPattern()`, e ela só existe na origem de destino —
é por isso que a comparação é ancorada na origem e não só no caminho.

### 3.4 Fase 4 — Chegar à tela de exportação

**Spec dona:** `e2e/nfe-export-arrival.spec.ts`,
`reaches the NF-e export screen with its notice dismissed`.

**Funções:** `openNfeExportScreen(page)`, dentro da qual
`SiatWebSystemPage.openNfeExportScreen()` caminha o menu.

O caminho até a tela é **semântico e estável**: dois hovers e um clique, cada item
endereçado pelo texto exato que a pessoa lê.

| Etapa                                                 | O que faz                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Walk the destination menu to the NF-e export screen` | Passa o ponteiro por `Autoatendimento` e `NF-e`, clica em `Consultar/Exportar NF-e`, e **prova a chegada dentro da caminhada, antes de tocar em nada**. |
| `Dismiss the notice on the NF-e export screen`        | Reconhece o aviso.                                                                                                                                      |
| `Confirm the NF-e export screen is usable`            | Confirma que os controles estão visíveis e habilitados.                                                                                                 |

Três detalhes que não são óbvios:

**A exatidão do item de menu é o que a torna segura.** Por substring, o mesmo
texto também casa `Consultar/Exportar NF-e Detalhada`, que mede dois elementos
onde o casamento exato mede um. Os dois grupos do menu abrem no ponteiro, não no
clique, e por isso são revelados por `hover()` e nunca acionados.

**A tela não abre no formulário de exportação.** Ela abre no formulário de
busca por chave, e o controle de inscrição, os campos de data e o botão
`Agendar exportação` só existem depois que um papel de contribuinte é escolhido.
Asserir os três aqui seria asserir um estado em que a tela não está — o que o
`ARRIVAL_CONTROLS` do page object deixa explícito em vez de esconder.

**O aviso é modal e volta em toda visita.** Ele bloqueia o menu atrás, então
`dismissNotice()` é idempotente — só clica se estiver visível, e sempre afirma
que saiu. E `openNfeExportScreen` **volta a chamá-la**, porque a tela da fase 5
é reaberta uma vez por inscrição.

**O que prova.** A tela de exportação está aberta no formulário de busca por
chave e o aviso não está mais nela. Nada é preenchido, nenhuma opção é marcada e
nada é agendado — por isso este teste pode ser repetido a qualquer momento sem
deixar nada para trás no portal.

### 3.5 Fase 5 — Agendar a lista inteira

**Spec dona:** `e2e/nfe-export-scheduling.spec.ts`,
`schedules the export of every configured inscription and finds its row`.

**Funções:** `toExportTargets()`, `scheduleEveryConfiguredExport()`,
`revisitExportScreen()`, `scheduleExport()`.

Este é o ciclo de agendamento, e ele é a única parte do fluxo que age. O formato
está no [ADR 0008](decisoes.md#adr-0008--ciclo-de-agendamento-um-teste-uma-sessão-lista-inteira-série-sem-retentativa): **um teste, uma sessão,
lista inteira**.

```
read the environment ─→ login ─→ travessia ─→ ┐
                                             │  por inscrição:
                                             │    revisitar a tela
                                             │    contar as linhas de antes
                                             │    conferir a inscrição
                                             │    selecioná-la
                                             │    escrever e rele o período
                                             │    registrar o pedido
                                             ├→ ao fim, uma única visita:
                                             │    reler a tabela, esperar a linha nova de cada item
                                             └→ elevar a primeira falha tipada
```

Quatro decisões definem o formato, e nenhuma delas é estética:

**Um teste para a lista inteira, e o laço no módulo de passos.** A
apresentação é o relatório HTML, e o relatório é feito para ser lido **depois**.
Um teste por inscrição daria N relatórios para comparar e N sessões para o portal
recusar.

**Uma sessão para o ciclo inteiro.** Uma sessão por inscrição esgotaria o limite
de `SESSIONS_PER_USER` do próprio banco do sistema de destino — que já produziu
becos sem saída na travessia.

**A lista inteira, mesmo com uma falha no meio.** A falha de um item é
registrada, o próximo é tentado, e a primeira falha é elevada ao fim. Um item já
agendado com êxito não é desfeito pelo item seguinte falhar, e o relatório é a
única forma de saber o que ficou agendado em produção. Um item cujo agendamento
falhou não é esperado depois, porque não há linha vindo para um pedido que nunca
foi registrado.

**O prazo é derivado do tamanho da lista**, por `schedulingTestDeadlineMs(n)`, e
não escrito à mão. Um número escrito à mão não pode ser conferido contra as
esperas que o fluxo realmente faz — e o número que a configuração carregava antes
descrevia um ciclo **mais curto** do que o prazo que ele dizia Sitio acima.

#### O que cada item paga

Uma **revisita** por item, e não uma reentrada no formulário aberto. Três motivos,
todos medidos:

- O item anterior consumiu a tela que estava aberta.
- O formulário chega vazio em **toda** visita.
- A tabela só lista a linha nova na **visita seguinte** à que a agendou — é a
  informação do usuário do sistema, e a medição confirma: logo depois do clique a
  tabela continuava igual, sem mensagem e sem diálogo, o que fez a primeira
  versão deste fluxo concluir que o clique não tinha produzido efeito nenhum.

A revisita é um `reload` mais a caminhada do menu de novo, com o aviso
reconhecido antes da caminhada — porque o aviso volta no `reload` também, e
enquanto ele está no ar a caminhada não passa do primeiro grupo. Não há histórico
para voltar: o postback do item de menu é na mesma rota.

#### A prova de cada item

**A variação da contagem de linhas**, e nada mais. Antes do pedido, o fluxo conta
as linhas da tabela que carregam a inscrição; na visita final, espera a contagem
superar aquela. Três decisões fazem a prova valer:

**A contagem tem que ser da tabela certa.** A tabela de exportações agendadas é
paginada e a página carrega outras, então uma contagem tomada sobre a página
inteira devolve a barra de cabeçalho e a paginação como se fossem exportações.
Medido: uma contagem de página inteira mentiu sobre acréscimo. O recorte é pelo
id `lista-agendamentos`.

**A inscrição é comparada dentro da página, e só a contagem sai.** Os dois valores
são identificadores fiscais. Além disso, a célula traz a inscrição **com
máscara** — o dígito verificador separado por um hífen (`NNNNNNNNN-D`, e não
`NNNNNNNNND`; os dígitos são dado fiscal e não são reproduzidos aqui). A pontuação é
removida antes de
comparar, e só ela: uma célula com dois números continua casando por um deles, e
uma inscrição não pode ser confundida com outra que começa com os mesmos dígitos.
Sem essa remoção, a contagem deu zero para uma exportação que o ciclo tinha
acabado de agendar — com a linha na tela, `Processado` e botão de `Download`.

**A contagem, e não a lista, e não o conteúdo.** A tabela não tem coluna de
período e o `select` já vem preenchido com um _default_, o que torna qualquer
conferência de conteúdo uma prova que uma seleção inexistente satisfaz. E uma
remoção entre as duas leituras não faz a prova passar por engano — ela a faz
**reprovar** por engano, o que é o modo de falha aceitável.

#### O que o formulário exige antes de qualquer agendamento

`expectNothingUnauthorisedAsked()` roda **antes do primeiro item** e falha se o
formulário pedir algo que a pessoa não autorizou:

- **Uma opção que o fluxo não conhece** → `UnknownFormChoiceError`. Marcar ou
  deixar em branco são as duas decisões, e escolher parâmetro fiscal não é da
  automação.
- **Um campo marcado como obrigatório** → `UnknownRequiredFieldError`. O
  formulário medido não tem marcador de obrigatório nenhum; um campo que passou a
  ser obrigatório é um campo que o portal adicionou.

Já o que o grupo de opção **tem** de marcar é o que o fluxo diz, e ele diz por
item, depois de selecionar a inscrição:

- **`Tipo de nota: Todas` e `Status da Nota: Todas`** são as escolhas autorizadas, e
  o fluxo **as marca** — em vez de herdar os padrões da tela, que eram Todas e
  Ativas. A consequência fiscal é o arquivo passar a trazer também canceladas,
  inutilizadas e denegadas ([ADR 0009](decisoes.md#adr-0009--escolhas-do-arquivo-exportado-o-fluxo-as-diz-e-as-confere-no-fio-não-as-herda-dos-padrões-da-tela)).
- O grupo é endereçado pela **linha** que o contém, e não pelo nome da opção:
  `Todas` é opção dos dois grupos, então o nome não diz a qual deles pertence.
- **Um grupo que não oferece a escolha, ou que a perde depois de marcada** →
  `UnexpectedFormChoiceError`. Uma classe para as duas causas, e o campo `failure` diz
  qual foi: `not-offered` é mudança do lado do portal — o fluxo diz qual opção o grupo
  passou a oferecer —, e `not-marked` é desta automação, que marcou e leu outra coisa.
- **Um pedido que saiu sem a escolha marcada** →
  `ExportRequestWithUnauthorisedNoteChoiceError`, conferido no fio na mesma leitura
  que confere o período.

O papel de contribuinte é a única opção que o fluxo marca **antes** de cada item,
porque é o que faz o formulário de exportação existir; ele não é parâmetro fiscal.
Neste ciclo o papel é o de destinatário; no do emitente, o de emitente — e cada um
tem o seu próprio objeto de tela, com a sua própria medição
([ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo)).

#### Os erros desta fase

Sete dos nove carregam a posição do item, e **nenhum** carrega o valor. Os dois
que não a carregam são os que não são sobre um item da lista —
`PortalInternalErrorScreenError` e `RejectedFieldValueError` — e por isso nomeiam
a tela ou o campo, nunca a empresa:

| Erro                                           | Quando                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `InscriptionNotOfferedError`                   | O formulário não oferece a inscrição. Carrega quantas ele oferece — uma forma, não um identificador.                       |
| `UnexpectedFormChoiceError`                    | Um dos dois grupos não ficou com a escolha autorizada marcada.                                                             |
| `UnknownFormChoiceError`                       | O formulário carrega uma opção que o fluxo não conhece.                                                                    |
| `UnknownRequiredFieldError`                    | O formulário marca um campo como obrigatório que o formulário medido não tem. Carrega os **ids**, que o servidor inventou. |
| `PortalInternalErrorScreenError`               | O portal respondeu na própria tela de erro interno. Não há retentativa: a falha é do portal.                               |
| `ExportRequestWithoutPeriodError`              | O pedido saiu sem o período. Ver abaixo.                                                                                   |
| `ExportRequestWithUnauthorisedNoteChoiceError` | O pedido saiu sem a escolha de notas autorizada. Ver abaixo.                                                               |
| `RejectedFieldValueError`                      | Um campo não guardou o valor escrito nele.                                                                                 |
| `MissingScheduledExportError`                  | A linha do agendamento não apareceu na visita final. Carrega as duas contagens.                                            |

`ExportRequestWithoutPeriodError` merece a nota. O botão responde sem recarregar,
e o período é comparado **contra o pedido que saiu**, não contra o formulário —
porque o formulário pode ser re-renderizado entre a leitura e o clique, e só o
pedido diz o que o sistema de destino recebeu. Medido: o pedido saiu com os dois
campos de emissão vazios em duas execuções do ciclo, e a causa é uma corrida, não
um defeito do portal. O que o erro compra é que um pedido desses **nunca é
silencioso**: ele nomeia o item, porque quem lê o relatório precisa saber que uma
exportação sem período nenhum foi registrada — e o pedido não pode ser desfeito
aqui, a linha tem de ser descartada no sistema de destino.

`ExportRequestWithUnauthorisedNoteChoiceError` é a mesma compra, para as escolhas
de notas: o formulário pode ser re-renderizado depois de a escolha ser marcada, e
só o pedido diz se ela foi. A leitura é a **mesma resposta** que já era esperada
para o período, então a conferência não custa requisição nem espera — e é ela que
transforma uma escolha herdada em escolha verificada.

### 3.6 Fase 6 — O mesmo agendamento, pelo papel de emitente, sob demanda

**Spec dona:** `e2e/nfe-export-issuer-scheduling.spec.ts`,
`@on-demand schedules the export of every configured inscription as the issuer and
finds its row`.

**Comando:** `pnpm test:scheduling:issuer`. **Não roda na rodada padrão.**

A fase 5 produz o arquivo das notas **recebidas**. Quem responde pela emissão
precisa do arquivo das notas **emitidas**, e ele não é o mesmo arquivo: um relatório
sobre as recebidas não responde a pergunta sobre as emitidas. A tela é a mesma —
um rádio por papel — e a medição está na
[spike 07](spikes.md#4-o-formulário-do-emitente).

Este é um **segundo ciclo**, e não uma variante do primeiro: própria spec, próprio
módulo de ciclo, próprio objeto de tela, próprio comando. Unificar os dois em um
caminho só está fora de escopo por escolha, e a escolha está no
[ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo).

**O que ele faz igual:** a mesma lista (`E2E_NFE_EXPORT_INSCRIPTIONS`), o mesmo
período, a mesma chegada, a mesma travessia, a mesma prova pela variação da contagem
de linhas, as mesmas classes de erro, os mesmos prazos e a mesma re-escrita do
período quando o formulário volta em branco.

**O que ele faz diferente:** marca `Contribuinte como Emitente` em vez de
`Contribuinte como Destinatário`, e conhece o seu **próprio** conjunto de escolhas.
Duas medições de duas telas que concordam hoje e podem divergir amanhã, então o
módulo de escolhas, a lista de nomes conhecidos e as entradas de markup são
declarados de novo naquele fluxo — nenhuma constante é emprestada do outro, e nenhum
módulo de ciclo importa do outro. A correção de uma medição que divergir é feita no
fluxo que compete; a escolha está no ADR 0010.

**As escolhas marcadas:** `Tipo de nota → Todas` e `Status da Nota → Todas`. O
grupo de tipo **existe** no formulário de emitente e chega em Todas — medido na
spike 07 — e o arquivo passa a trazer também canceladas, inutilizadas e denegadas,
como no outro fluxo.

#### A limitação da prova, escrita aqui e não só no código

A prova de cada item é a variação da contagem de linhas, igual à fase 5 — e ela
**não distingue papéis**: a tabela `lista-agendamentos` não tem coluna de papel,
então uma linha não é atribuível a este ciclo. Um agendamento feito fora da
automação entre a leitura de antes e a da visita final satisfaria a prova. Nada
no portal dirá qual papel criou uma linha, e por isso a limitação é parte da
decisão e não um defeito a corrigir.

#### A prova, e uma pergunta aberta antes da primeira execução

O portal recusa um pedido cujo **período** já foi agendado, e a recusa só é vista
ao fim do ciclo — está registrado no
[ADR 0009](decisoes.md#adr-0009--escolhas-do-arquivo-exportado-o-fluxo-as-diz-e-as-confere-no-fio-não-as-herda-dos-padrões-da-tela)
como proposto e não decidido. Este ciclo agenda **as mesmas inscrições e o mesmo
período** do primeiro, sob outro papel. Se o portal julgar a repetição pelo
período, a primeira inscrição já vem recusada e nada é agendado; se levar o papel
em conta, os quatro pedidos passam. Não foi medido — a spike 07 não clica —, e por
isso está escrito como pergunta e não como fato.

#### Por que é sob demanda, e o furo dessa escolha

A rodada padrão agenda **quatro** pedidos reais, no papel de destinatário. Os
quatro do emitente são mais quatro pedidos reais, sobre as mesmas empresas e o
mesmo período, e a decisão é que isso aconteça quando alguém pedir, não toda vez
que a suíte roda.

O mecanismo é a marca `@on-demand` no **título** do teste, e a rodada padrão inverte
o filtro por marca — `pnpm test`, `pnpm test:headed` e `pnpm test:ui` todos passam
`--grep-invert @on-demand`.

**O furo é conhecido e está escrito:** a inversão vive nos comandos do
`package.json`, e não na configuração. Quem invocar o executor sem passar pelo
comando — `npx playwright test`, a extensão do VS Code, qualquer comando sem
`--grep-invert` — agenda **todos os ciclos**: dezesseis pedidos reais em produção
em vez de quatro. Nenhum teste é pulado por isso; é a execução que passa a fazer
mais do que se pediu, e é por isso que os avisos estão aqui, na spec e no
`README.md` em vez de só no código.

### 3.7 Fase 7 — O mesmo agendamento, na tela da NFC-e, com o Status em Todas, sob demanda

**Spec dona:** `e2e/nfce-export-issuer-all-status-scheduling.spec.ts`,
`@on-demand schedules the export of every configured inscription on the NFC-e
screen with every status and finds its row`.

**Comando:** `pnpm test:scheduling:nfce:all-status`. **Não roda na rodada padrão.**

O ramo `NFC-e` do menu abre a tela "Consultar/Exportar NFC-e", e o formulário dela
tem um grupo `Status da NFC-e` com **três** opções — `Ativas`, `Canceladas`,
`Todas` (medido na [spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)).
Quem responde pela emissão precisa, além do arquivo das canceladas, do arquivo de
**todas** as NFC-e do período: mesma tela, mesma lista, mesmo período, **outro
Status** — e o arquivo é justamente o que esse Status diz.

Este é um **quarto ciclo**, e o segundo do ramo NFC-e: própria spec, próprio
módulo de ciclo, própria tabela de escolhas, baterias próprias e próprio comando.
O ciclo que agenda as `Canceladas` não é alterado em nada; a escolha está no
[ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração).

**O que ele faz igual:** a mesma lista (`E2E_NFE_EXPORT_INSCRIPTIONS`), o mesmo
período, a mesma chegada, a mesma travessia, o mesmo percurso de menu
`Autoatendimento → NFC-e`, a mesma prova pela variação da contagem de linhas na
tabela `lista-agendamentos-nfce`, as mesmas classes de erro, os mesmos prazos
declarados e a mesma re-escrita do período quando o formulário volta em branco.
Nenhuma variável de ambiente nova.

**O que ele faz diferente:** duas coisas, e ambas são a entrega.

- **As escolhas entram como parâmetro, numa tabela própria.** Este fluxo declara
  `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS` (`Saída`, `Todas`) e passa a tabela ao
  objeto de tela, que ganhou para isso os métodos `applyNoteChoices(groups)` e
  `scheduleExportValidated(period, reference, groups)` — os métodos antigos
  continuam apontando para a tabela do ciclo `Canceladas`, com o mesmo
  comportamento. É a diferença entre duas telas (onde cada fluxo declara tudo, ADR
  0010 e 0011) e **dois fluxos sobre uma tela só**: aqui o que separa é dado, não
  código, e o teste unitário **pendura as duas tabelas** nos fatos de tela
  (rótulo, campo, opções, valores) para que uma correção feita num lugar só vira
  vermelho sem portal.
- **A prova de cada item paga a própria visita, e não existe passe final.** A spike
  06 mediu que `Agendar exportação` responde sem recarregar e que **a tabela só
  lista a nova linha na próxima carga** — um `expect.poll` apontado na página que
  acabou de clicar esperaria o limite inteiro e reportaria, com razão, que nada foi
  agendado. Então cada iteração revisita a tela, agenda, e revisita de novo para
  ler a sua própria prova antes do item seguinte: a falha de um item é nomeada onde
  aconteceu, o item seguinte é tentado mesmo assim, e a primeira falha da lista é
  reexecutada no fim.

**As escolhas marcadas:** `Tipo de nota → Saída` (`tipoDeNota` = `1`) e
`Status da NFC-e → Todas` (`statusNota` = `2`). O tipo **coincide** com o padrão da
tela e com o outro ciclo do ramo — e é declarado mesmo assim, para que uma troca de
padrão pelo portal não mude o arquivo em silêncio. O status é o que separa os dois
ciclos: este posta `2`, o ciclo `Canceladas` posta `0`, e a tela chega em `Ativas`.
Contra o formulário de NF-e, os valores são **outros** (`Saída` é `2` lá e `1`
aqui) — é por isso que cada tabela traz a sua lista de opções.

#### A limitação da prova, escrita aqui e não só no código

A prova de cada item é a variação da contagem de linhas — e ela **não distingue
fluxo nem papel**: `lista-agendamentos-nfce` é a **mesma tabela** do outro ciclo do
ramo NFC-e, e não tem coluna que diga qual ciclo criou uma linha. Cada execução lê
os seus próprios contadores (antes e depois do **seu** clique), então os dois
ciclos não se satisfazem um ao outro quando rodam em momentos distintos; um
agendamento feito **fora** da automação entre as duas leituras de um mesmo item
satisfaria a prova. Nada no portal dirá qual ciclo criou uma linha, e por isso a
limitação é parte da decisão e não um defeito a corrigir.

#### A prova, e a pergunta aberta antes da primeira execução autorizada

Este ciclo agenda **as mesmas inscrições e o mesmo período** do ciclo `Canceladas`,
pela mesma tela. A recusa "Já existe um agendamento com os parâmetros passados"
já foi medida em produção — mas sempre com parâmetros **idênticos**. Se o portal
julgar a repetição só pelo período, o segundo dos dois ciclos vem recusado no
primeiro item, com 200 e a recusa na resposta, e a prova falha ali; se levar as
escolhas em conta, os dois pedidos passam. Não foi medido — nada disto exige um
clique para saber —, e por isso está escrito como pergunta e não como fato. Ver a
[ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração)
e o README ao lado dos comandos.

#### Por que é sob demanda, e o furo dessa escolha

A rodada padrão agenda **quatro** pedidos reais, no papel de destinatário. Os
quatro deste ciclo são mais quatro pedidos reais, sobre as mesmas empresas, o
mesmo período e a mesma tela do ciclo `Canceladas`, e a decisão é que isso
aconteça quando alguém pedir, não toda vez que a suíte roda.

O mecanismo é o mesmo dos outros dois ciclos sob demanda: a marca `@on-demand` no
**título** do teste, invertida pelos comandos do `package.json`. O furo conhecido
agora cobre **quatro** ciclos: quem invocar o executor sem passar pelo comando
agenda dezesseis pedidos reais em vez de quatro.

## 4. Os invariantes da suíte

Quatro decisões da configuração não são preferência de estilo. Cada uma tem uma
medição ao lado, no próprio `playwright.config.ts`.

**A suíte roda em série, com um trabalhador só.** `fullyParallel: false` e
`workers: 1`. Em paralelo, todas as sessões da rodada caem de uma vez, com
`controle-acesso-ws/mensagens/900004` — _"não foi possível localizar um usuário
ativo vinculado a esse certificado"_. Em série, o mesmo login passa. Está na
configuração e não em opção de linha de comando porque a próxima rodada sem a
opção quebraria o portal de novo.

**A retentativa é zero, em qualquer ambiente, inclusive na CI.** Neste fluxo uma
retentativa não é uma segunda chance: é um segundo pedido de exportação real para
uma empresa real, no mesmo período. E a causa da instabilidade observada era o
paralelismo, não uma execução mal-sucedida — corrigir pela causa, como manda o
[AGENTS.md](../AGENTS.md).

**Só Chromium executa.** Os binários de todos os navegadores ficam instalados
para investigação, mas a suíte tem um projeto só. O [ADR 0002](decisoes.md#adr-0002--escopo-de-navegadores-binários-de-todos-instalados-execução-apenas-em-chromium)
explica a troca: cada motor adicional seria superfície de manutenção sem ganho de
cobertura.

**O prazo de um teste é derivado, não escrito.** `TEST_DEADLINE_MS` vem da cadeia
mais longa de esperas mais uma folga, e o deadline do ciclo de agendamento vem do
tamanho da lista. A regra por trás: **um teste que esgota o prazo esgotou a espera
em que estava**, e por isso consegue relatar a tela que respondeu em vez de um
timeout pelado. Um prazo escrito à mão não tem essa propriedade, e o desta
suíte já esteve errado uma vez. A [referência técnica](referencia-tecnica.md)
tem a tabela dos onze limites declarados e a derivação.

Uma consequência que atravessa o resto: **não há um único `waitForTimeout` na
suíte**. Toda espera é sobre estado observável — um controle que aparece, uma
contagem que cresce, uma URL que muda — com asserções web-first do Playwright.

## 5. Como estender o fluxo: medir antes de escrever

Esta é a seção mais importante para quem vai acrescentar algo. A regra do projeto
não é "prefira localizadores semânticos"; é:

> **Quando você não pode usar um localizador semântico, diga o que você mediu.**

Localizador semântico é o padrão porque é o que sobrevive à mudança de markup. Mas
o portal é um sistema legado, e há telas em que nenhum localizador semântico
resolve — e nesse caso o padrão não é uma proibição, é uma **exigência de
justificativa medida**.

### O ciclo

**1. Abra o portal à mão e inspecione.** Não no código: no navegador, com o
inspetor. Cada medição é gravada numa spike em `docs/spikes.md`, e é de lá que
saem as justificativas. As spikes 04, 05, 06, 07 e 08 são o registro dessas rondas
para o login, a travessia, o agendamento, o formulário do papel de emitente e a
tela da NFC-e.

**2. Meça o marcador da chegada antes de medir os controles.** A chegada vem
primeiro, porque é o que impede que uma tela que saiu errada seja relatada depois
como um controle que não quis agir. Cada tela tem **um** marcador, e ele é
medido, não presumido.

**3. Meça o papel acessível, e não o nome do elemento.** `getByRole` prova que o
controle é um botão, o que é parte do que tem que estar certo. Quando o campo
não tem `label[for]`, `aria-label` nem `placeholder`, nenhum localizador semântico
o nomeia — e aí a pergunta não é "qual seletor escrevo", é **"por que esse
elemento não é alcançável semanticamente"**, e a resposta vira o comentário ao
lado do seletor.

**4. Escolha o seletor mais estreito que a medição sustente.** Quando dois
elementos compartilham nome acessível, o casamento por substring não separa —
esse é o caso em que seletor de markup é **necessário**, e é o único. Registre
isso ao lado do seletor, com o caso concreto.

**5. Escreva o porquê em uma linha, e o resto no ADR ou na spike.** A justificativa
completa vive no registro de medição; o código e a documentação carregam a linha
que aponta para lá. É o que mantém a justificativa honesta: a medição é
datada, e o código envelhece sem ficar para trás sem ninguém perceber.

**6. Escreva o beco sem saída antes do caminho feliz.** Toda chegada e todo
formulário têm um estado em que saem errado. O que o portal respondeu nesse estado
é a informação que o relatório precisa, e ela se perde se ninguém a olhou.

### Um exemplo, tirado do próprio código

O caso em que seletor de markup é **necessário** já está no repositório, e ele
ilustra o ciclo inteiro. No menu de auto-regularização da tela de boas-vindas, a
opção que leva ao sistema de destino chama-se `SIAT` — e ao lado dela, no mesmo
menu revelado, existe uma opção chamada `SISAT`.

O instinto manda escrever `getByText('SIAT')`. Isso não funciona, e o motivo é
uma propriedade do Playwright: o casamento de nome acessível é **por substring**,
e `SIAT` é substring de `SISAT`. O localizador encontraria as duas opções. Como
o fluxo aciona a primeira e a segunda levaria a outro lugar, um `getByText`
silenciosamente errado é exatamente o tipo de bug que sobrevive à revisão.

A saída medida foi casar pelo `href`, `javascript:logarSiatWeb();`, que só a
opção certa carrega. E é por isso que a entrada do objeto de seletores tem
justificativa escrita: não é "o seletor é mais preciso", é **"o casamento por
nome não separa estes dois elementos, porque o Playwright casa por substring"** —
uma afirmação conferível sobre um caso concreto, não uma preferência de estilo.

O outro caso é o inverso, e vale igualmente. A inscrição do formulário do
contribuinte não tem `label[for]`, nem `aria-label`, nem `placeholder`, e o id
`j_idt39` que a nomeia é um contador gerado que muda entre cargas. Não existe
localizador semântico que a alcance — e a justificativa escrita diz **exatamente
isso**, e não "o seletor é mais estável". A diferença importa: a primeira
justificativa diz que um caminho melhor existe e foi recusado por uma razão
medida; a segunda diz que o caminho melhor **não existe**, e quem a ler sabe que
não vai encontrá-lo procurando mais.

O que as duas têm em comum é a forma: nenhuma diz "porque funciona", e as duas
dizem o que foi medido — e o que foi medido está na spike.

### Spike ou ADR, e o que cada um guarda

São dois registros diferentes e a distinção é de propósito:

- A **spike** guarda **medida**. É o registro datado de uma ronda contra o portal:
  o que se abriu, o que se viu, o que se concluiu. Ela envelhece sem ser
  reescrita, porque seu valor é ser um documento histórico do portal em uma data.
- O **ADR** guarda **decisão**. É o registro de uma escolha entre alternativas,
  com o contexto que a tornou necessária e as consequências que ela impõe. Ele não
  envelhece: uma decisão continua valendo enquanto ninguém a revogar.

Um seletor medido pertence à spike, com uma linha no código apontando para lá. A
escolha de rodar em série pertence a um ADR, com a medição que a motivou citada
dentro dele. A pergunta que separa os dois é **"isso é um fato sobre o portal ou
uma escolha nossa?"** — e quando a resposta é "as duas coisas", é um ADR que cita
a spike, nunca uma spike que editorializa a decisão.

### Três regras de tipagem que o fluxo impõe

São as que mais custam a quem chega de outra linguagem:

**As telas se descrevem por interface, nunca por herança.** Cada classe de página
`implements` um contrato que declara o que é público, e todo consumidor é tipado
contra a interface. Quando duas telas compartilham um conceito, isso é
**interface estendendo interface** — herança de classe concreta é proibida. A
razão está no [ADR 0006](decisoes.md#adr-0006--contratos-de-página-interface-estendendo-interface-nunca-herança-de-classe), e a consequência prática é
que trocar a implementação por trás de um contrato é invisível de fora.

**Uma tela só expõe o que ela permite, e omite de propósito.** A página do módulo
e-AGEAT não tem como "abrir mensagem", mesmo que o elemento exista na tela. A
tela de exportação não alcança o formulário do contribuinte. O que não é exposto
não pode ser acionado por acidente — e o objetivo declarado de download é
justamente o tipo de acidente que custa caro.

**`factories.ts` é o único lugar onde um page object é construído.** Cada
`factory(page)` devolve o **contrato**, e nenhum consumidor nomeia uma classe.
Construir um é grátis; ler dezenas delas não é — e a repetição chegou a
consumir quatro linhas em um módulo só. A alternativa idiomática, uma fixture
Playwright distribuindo todas as telas, foi considerada e recusada: faria cada
módulo de passos depender da fixture para poder ser usado.

### Quatro famílias de erro, e nenhuma classe base

As 16 classes de erro estão em quatro módulos — login por certificado, travessia,
exportação e ambiente — e **nenhuma tem classe base**. Isso é deliberado, e a
razão é curta: o que um relatório mostra é o nome da classe e a mensagem, então é
o **nome** que carrega a fase que falhou. Uma classe base embaixo seria uma
categoria que nada lê. Quando duas telas compartilham um conceito, vale a regra
das interfaces: **interface estendendo interface**, nunca herança.

O segundo ciclo de agendamento não criou nenhuma classe nova: ele fala com as
mesmas dezesseis. Onde ele escolhe um papel, uma escolha ou um clique, ele levanta
o mesmo erro do primeiro.

E há uma regra de leitura no meio disso: **quem lê, levanta; quem classifica,
devolve veredito.** Um classificador nunca lança — devolve um estado, e quem o
consome transforma em erro. Já um método `expect…` **lança** um erro tipado em vez
de devolver `boolean`, porque um passo que ramifica sobre uma leitura é um passo
cuja falha é um `Error` anônimo, e a fase em que um teste vermelho falhou é
exatamente o que tem que ser legível.

## 6. A fase de download: o que já existe

O **download ainda não foi implementado**. Esta seção registra o que já está
ligado e o que já foi medido para ele, e nada mais — não há desenho de
implementação aqui.

O objetivo é permanente e está no [AGENTS.md](../AGENTS.md): baixar os arquivos
do fluxo, e nada mais. Nenhuma ação com efeito fiscal além do agendamento pode
ser executada para chegar lá.

### O que já está ligado

**`acceptDownloads: true`** está em `use` da configuração do Playwright. A fase de
download não precisa mexer na configuração para baixar arquivo.

**A tabela de exportações agendadas é o ponto de partida, e ela já está
recortada.** O id `lista-agendamentos` é escrito à mão pelo portal, e o recorte
por ele já existe em `scheduledExportsRow`. A tabela carrega as colunas `ID`,
`Situação` (`Aguardando`, `Processado`), `Data de criação`, `CNPJ`, `IE`,
`Data processamento` e `Ações`, e é a única que interessa: o download acontece
por linha.

**A coluna `Ações` traz `Info`, `Download` e `Excluir` por linha.** O botão de
`Download` é o alvo. `Info` é leitura. `Excluir` é a proibição permanente, abaixo.

**`E2E_DOWNLOAD_DIR`** está no `.env.example`, com o cabeçalho de comentário
correspondente, e é o que dirá onde o arquivo baixado vai parar.

### O que já foi medido

**O processamento leva cerca de um minuto.** `Data processamento` é o
`dd/mm/aaaa hh:mm:ss` da linha, e a medição da spike 06 mostra a linha cerca de
um minuto depois do clique. `Situação` transita de `Aguardando` para
`Processado`.

**O botão de agendamento não recarrega a tela, e a linha só aparece na visita
seguinte.** Foi medido duas vezes: na primeira, o clique pareceu não ter
produzido efeito nenhum; na visita seguinte, a linha estava lá, com a situação e a
data de processamento. A linha **não** pode ser esperada no lugar onde ela é
criada.

**A tabela é paginada, com `rowsPerPage: 15` configurado pelo próprio portal.** Na
medição, a inscrição tinha um número de registros que cabia numa página só, e a
contagem lida era a contagem total. **A ordem de classificação nunca foi medida** — se a tabela
ordena da linha mais nova para a mais antiga, um acréscimo aparece na primeira
página; se ordena da mais antiga para a mais nova, a linha nova cai na segunda
página. Ver [Pendências](#7-pendências).

### O que precisa ser obedecido, e o que é proibido

**A proibição permanente: nunca procurar por `Excluir`, em lugar nenhum.** A
tabela traz a ação e um diálogo `Confirmar exclusão agendamento` (Sim/Não) no
DOM. Nenhum dos dois é clicado, e nenhum localizador deve procurar por esse
texto em nenhum momento — nem para ler, nem para contar, nem para verificar. Não
é uma etapa a ser cuidada: é uma superfície a ser evitada.

**Comparar é sempre dentro da página.** A inscrição e o período são
identificadores fiscais. Qualquer verificação sobre a linha tem de ser feita
dentro da página, e **só o resultado pode sair dela**.

**Nenhuma ação com efeito fiscal.** Agendar é o máximo, e é o que produz o
arquivo. Assinar, finalizar, transmitir, autorizar, excluir e arquivar estão fora
— e o `Download` é leitura do arquivo que o agendamento produziu.

## 7. Pendências

O que está aberto, e por quê. Cada item diz o que seria preciso para fechá-lo.

### 1. O download não está implementado

**O que falta.** A fase de download inteira: percorrer as linhas da tabela,
esperar o processamento, acionar `Download` e verificar o arquivo baixado.
**Por que está aberta.** É o objetivo do projeto, por definição posterior às
entregas atuais.
**O que já existe.** A [seção 6](#6-a-fase-de-download-o-que-já-existe).

### 2. A empresa da travessia não está religada

**O que falta.** A travessia usa `selectFirstAvailableContributor()`, e o
[ADR 0007](decisoes.md#adr-0007--empresa-da-travessia-por-variável-de-ambiente-não-fixada-no-código) decidiu que a empresa vem de
`E2E_COMPANY_INSCRIPTION`. A decisão está implementada — `getCompanyInscription()`
e `selectContributorByInscription()` existem, tipadas e testadas por leitura — mas
a travessia nunca foi religada nelas.
**Por que importa.** A escolha da primeira empresa disponível é a escolha que a
spike 05 provou **errada**: das cinco empresas que a sessão pode representar, as
duas primeiras terminam no beco `Usuário não identificado` e só a terceira
alcança o destino. A variável é exigida e não tem valor padrão, e hoje ela é
lida em lugar nenhum.
**Como fechar.** Substituir a escolha em `enterAgeatLegacySystem` pela seleção
por inscrição, mantendo o texto da linha na mensagem de `LostSessionError`.

### 3. Dois seletores não têm medição que os justifique

`CONTRIBUTOR_FORM_SELECTORS` carrega duas entradas marcadas com
`**Justification pending.**` no próprio código. Elas estão escritas com o que a
HTML sugere, não com o que o portal faz, e o modo de falha de cada uma é
diferente — o que muda o que medido significaria:

| Seletor                | O que é                              | Modo de falha                                                                                                                                                                                                                                                                              | O que medir                                                          |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `requiredField`        | `[required], [aria-required="true"]` | **Silencioso.** O formulário medido não tem marcador de obrigatório nenhum, então a guarda nunca dispara hoje. Se o portal usar outra grafia, ela continua não disparando — e o campo novo é ignorado em silêncio, que é exatamente o que `UnknownRequiredFieldError` existe para impedir. | A grafia que o portal usaria, ou a prova de que ele não usa nenhuma. |
| `scheduledExportsCell` | `td`                                 | **Alto.** A spike registra quais colunas a tabela tem, não qual elemento guarda o valor de uma coluna. Se não for `td`, a contagem de linhas dá zero e a prova do ciclo reprova com `MissingScheduledExportError` depois de esperar o limite inteiro. Nunca dá verde falso.                | Qual elemento guarda o valor de uma coluna.                          |

O que a medição custaria é uma visita à tela de exportação com o inspetor aberto
— a mesma ronda que produziu a spike 06. Está registrada aqui, e não feita,
porque uma medida nova contra produção não cabe numa tarefa de documentação.

A página do emitente tem uma terceira entrada marcada, e é a mesma `requiredField`
de novo: a spike 07 repetiu a ronda no formulário do outro papel e **achou o mesmo
resultado** — nenhum marcador de obrigatório em lugar nenhum da tela. O que
continua aberto é a mesma pergunta de sempre, a grafia que o portal usaria se
usasse alguma; a existência do marcador foi medida duas vezes, nas duas telas.

### 4. A ordem de classificação da tabela não foi medida

**O que falta.** Se a tabela de exportações agendadas ordena da linha mais nova
para a mais antiga, ou da mais antiga para a mais nova.
**Por que importa.** Com `rowsPerPage: 15`, a diferença decide se uma inscrição
com mais de 15 agendamentos ainda tem a prova do ciclo valendo. Na ordem
decrescente, um acréscimo aparece na primeira página e a prova continua valendo.
Na ordem crescente, a linha nova cai na segunda página, a contagem não cresce e a
prova **reprova por engano** depois de esperar o limite inteiro. O modo de falha é
uma falha falsa, nunca uma prova falsa — aceitável, mas precisa ser dito.
**Como fechar.** Uma visita à tela com mais de 15 agendamentos numa inscrição, e
ler a ordem.

### 5. O módulo e-AGEAT com conteúdo não foi observado

**O que falta.** O comportamento do módulo com mensagens de DT-e.
**Por que está aberta.** Nenhuma das empresas da conta tem conteúdo de e-AGEAT, e
todas abrem a mesma tela, com `Nenhuma página ou conteúdo público cadastrado.`
**O que já está decidido.** O page object do módulo modela **só a chegada**, e é
isso que vai continuar valendo: nenhuma ação sobre documento está exposta.

### 6. O ciclo da NFC-e com Status em Canceladas não tem seção própria aqui

**O que falta.** Uma seção paralela à fase 6 para o terceiro ciclo
(`e2e/nfce-export-issuer-scheduling.spec.ts`, `pnpm test:scheduling:nfce`), e o
mesmo na [referência técnica](referencia-tecnica.md). O quarto ciclo tem a
[fase 7](#37-fase-7--o-mesmo-agendamento-na-tela-da-nfce-com-o-status-em-todas-sob-demanda)
e as suas seções de referência; o terceiro continua sem.
**Por que está aberta.** O conteúdo daquela entrega ficou concentrado na
[spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e),
na [ADR 0011](decisoes.md#adr-0011--fluxo-nfce-um-terceiro-ciclo-a-tela-própria-da-nfce-escolhas-e-prova-próprias)
e no [plano executado daquela etapa](plano-nfce-export-agendamento.md), e a
seção daqui ficou registrada como fora do escopo daquela entrega. Não foi
preenchida nesta, para não misturar a documentação de dois fluxos num só corte.
**O que já está decidido.** O ciclo é `@on-demand`, agenda `Saída` + `Canceladas`,
e prova cada item na visita de fechamento; nada disso muda com o quarto ciclo.

## Ver também

- [Referência técnica](referencia-tecnica.md) — assinaturas, seletores, erros,
  prazos e variáveis de ambiente.
- [Glossário de domínio](glossary.md) — o vocabulário das telas e dos conceitos.
- [`AGENTS.md`](../AGENTS.md) — as regras do projeto, e o objetivo do download.
- [Decisões](decisoes.md) — as doze decisões técnicas (ADR 0001 a 0012), com o
  contexto e as consequências de cada uma.
- [Medições](spikes.md) — as cinco rondas de inspeção contra o portal (spikes 04 a
  08), de onde sai a medição de cada seletor.
