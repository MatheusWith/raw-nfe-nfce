# Glossário de domínio

Vocabulário do projeto de automação do SIATWeb da SEFAZ-PI. A convenção central
deste documento é a distinção entre **portal** e **sistema de destino**, porque
os dois compartilham o nome "SIATWeb" e são aplicações diferentes, em origens
diferentes.

## Aplicações

- **Portal.** A aplicação de onde a sessão parte: `siatweb.sefaz.pi.gov.br`, com
  a home pública `/portal-publico/`. É o alvo de `E2E_BASE_URL`, hospeda a tela
  de login, o painel de aplicações e o diálogo de seleção de contribuinte.
- **Sistema de destino (SIATWeb).** A aplicação servida por **outra origem** —
  `webas.sefaz.pi.gov.br`, alvo de `E2E_SIATWEB_SYSTEM_ORIGIN` — onde ficam os
  arquivos que a fase de download vai baixar. Chega-se a ela pela travessia; a
  URL de chegada é absoluta porque o destino é outra origem. Também chamada de
  "sistema SIATWeb" nos documentos.
- **Sistema legado (e-AGEAT).** Aplicação JSF do módulo e-AGEAT, servida pelo
  portal em caminho próprio (`/eageat`). Contém a tela de boas-vindas e o menu
  de auto-regularização; a sessão a atravessa a caminho do sistema de destino.
- **Host de SSO de certificado.** Host dedicado do Keycloak
  (`siatweb-certificado.sefaz.pi.gov.br`) que negocia o certificado A1 na camada
  TLS. É o único host para o qual o A1 é apresentado (`E2E_CERT_SSO_ORIGIN`).

## Telas e controles

- **Tela de login.** Primeira tela do portal; contém a entrada de certificado
  digital A1.
- **Painel de aplicações.** Tela do portal autenticado, com a lista de módulos.
- **Seleção de contribuinte.** Diálogo modal obrigatório do portal que escolhe a
  empresa que a sessão representa; a sessão entra como CONTADOR e o diálogo
  bloqueia os módulos até a escolha.
- **Tela do módulo e-AGEAT.** Página do painel em que o módulo é oferecido;
  contém a entrada no sistema legado.
- **Entrada no sistema legado ("Acessar Sistema").** Controle da tela do módulo
  que cruza a sessão para o sistema legado. É provado antes de ser acionado,
  porque depois do acionamento ele não existe mais.
- **Tela de boas-vindas.** Primeira tela do sistema legado (`bemVindo.jsf`,
  título "e-Processo"), alcançada ao cruzar a entrada do sistema. É o
  pós-requisito da travessia do módulo para o legado.
- **Menu de auto-regularização.** Menu da tela de boas-vindas, revelado por um
  dropdown toggle (`a.dropdown-toggle.btn`, "Autorregularização"), que contém a
  opção que leva ao SIATWeb ("SIAT", `javascript:logarSiatWeb();`).
- **Tela do sistema de destino.** Tela do SIATWeb em
  `/siatweb/faces/index.xhtml` na origem de destino; a travessia termina na
  chegada e nada é clicado ali.
- **Telas de exportação.** As telas `Consultar/Exportar NF-e` e
  `Consultar/Exportar NFC-e` do sistema de destino, cada uma no seu ramo do menu
  (`Autoatendimento → NF-e` e `Autoatendimento → NFC-e`), ambas alcançadas na
  mesma aba e na mesma URL de chegada. São **telas distintas** e não duas
  variantes de uma: o ramo NFC-e serve a sua própria `form`
  (`consultarNFCeForm`), os seus próprios grupos de escolha e a sua própria tabela
  de agendamentos (`lista-agendamentos-nfce`). Ver a
  [spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e).

## Conceitos do fluxo

- **Formulário do contribuinte.** O formulário de exportação da tela
  `Consultar/Exportar NF-e`, que só existe depois que um papel de contribuinte é
  marcado: controle de inscrição, período de emissão, os dois grupos de escolha e o
  botão `Agendar exportação`. Hoje ele é endereçado por **dois** page objects — o do
  contribuinte e o do emitente —, um por papel, cada um com a sua medição. A spike 06
  e a spike 07 os mediram nas duas telas e os acharam idênticos, menos o valor do
  papel e os contadores; é um fato de duas datas, e não uma garantia.
- **Formulário da NFC-e.** O formulário de exportação da tela
  `Consultar/Exportar NFC-e`, servido **já na chegada**, com
  `Contribuinte como Emitente` marcado e o `select` de inscrição no placeholder. Não
  existe nele o estado intermediário de busca por chave que separa os dois page
  objects do formulário NF-e — por isso ele é endereçado por **um único** page
  object, sem delegação por composição. Diferenças medidas contra o formulário NF-e:
  **dois** papéis em vez de três (não existe o papel de busca por chave), rótulo da
  inscrição `Inscrição::` com dois pontos, grupo de status com **três** opções e
  `Todas` só nele. Ver a spike 08 e o
  [ADR 0011](decisoes.md#adr-0011--fluxo-nfce-e-um-terceiro-ciclo-a-tela-própria-da-nfce-e-escolhas-e-prova-próprias).
- **Travessia.** Passagem da sessão autenticada do módulo e-AGEAT até o sistema
  de destino, através do sistema legado, dentro de uma única sessão contínua.
- **Ciclo de agendamento.** Execução única que agenda a exportação de **toda** a
  lista de inscrições configurada, dentro de uma sessão só, percorrendo a tela de
  exportação uma vez por inscrição e mais uma ao fim para conferir as linhas. Uma
  falha em um item não interrompe a lista: o item seguinte é tentado e a primeira
  falha é elevada ao fim. Ver o ADR 0008. São **três** ciclos — ver _Ciclo do
  emitente_ e _Ciclo da NFC-e_.
- **Ciclo do emitente.** O segundo ciclo de agendamento, pelo papel
  `Contribuinte como Emitente`, que produz o arquivo das notas **emitidas** em vez
  das recebidas. Mesma lista, mesmo período, mesmo formato — e módulo próprio,
  tela própria e comando próprio: `pnpm test:scheduling:issuer`. Ele **não roda
  na rodada padrão**, por marca `@on-demand` no título do teste. Ver o
  [ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo).
- **Ciclo da NFC-e.** O terceiro ciclo de agendamento, e o primeiro por **ramo de
  tela** em vez de por papel: ele desce `Autoatendimento → NFC-e` e agenda o
  arquivo das NFC-e **emitidas e canceladas** — `Tipo de nota = Saída` e
  `Status da NFC-e = Canceladas`, ditas pelo fluxo e não herdadas da tela, que
  chega em Ativas. Mesma lista e mesmo período das duas variantes de NF-e, sem
  variável própria; módulo, tela, tabela, teste unitário e comando próprios:
  `pnpm test:scheduling:nfce`. Também **não roda na rodada padrão**, por marca
  `@on-demand` no título. Ver o
  [ADR 0011](decisoes.md#adr-0011--fluxo-nfce-e-um-terceiro-ciclo-a-tela-própria-da-nfce-e-escolhas-e-prova-próprias).
- **Papel de contribuinte.** A escolha de rádio que decide **qual arquivo** a tela
  exporta. Três opções medidas na tela `Consultar/Exportar NF-e`:
  `Contribuinte como Destinatário` (notas recebidas), `Contribuinte como Emitente`
  (notas emitidas) e `Chave de acesso`. A tela `Consultar/Exportar NFC-e` tem
  **dois** papéis apenas — o de busca por chave não existe nela — e chega na de
  emitente já marcado. O papel não é parâmetro fiscal — é o que
  faz o formulário de exportação existir — e só o de destinatário tem a escolha
  conferida no corpo do pedido; a do emitente não é conferida no fio, lacuna
  conhecida e registrada.
- **Marca de sob demanda.** O literal `@on-demand`, escrito no **título** de cada
  teste de ciclo fora do de destinatário — hoje no do emitente de NF-e e nos
  **dois** da NFC-e. Os comandos `test`, `test:headed` e `test:ui` invertem o
  filtro por ela, então a rodada padrão continua com quatro pedidos reais. O furo
  é conhecido: chamar o executor sem passar pelo comando agenda **todos** os
  ciclos — dezesseis pedidos — porque a inversão vive nos comandos e não na
  configuração.
- **Revisita.** Nova abertura da tela de exportação dentro de um ciclo de
  agendamento, pelo menu e com recarregamento, sem nova autenticação. É exigida
  antes de cada item, porque a tela chega vazia a cada visita, e a prova da linha
  acontece sempre **em visita seguinte à que agendou**: nos ciclos de NF-e e no
  da NFC-e `Canceladas`, numa visita de fechamento única ao fim da lista; no
  fluxo NFC-e `Todas`, na visita própria de cada item, logo após o seu clique —
  não existe passe final naquele formato.
- **Sessão perdida.** Estado em que a travessia não se completa e a sessão não
  atravessa: o portal responde "Usuário não identificado"
  (`usuarioNaoLogado.jsf`). É um beco sem saída legítimo e documentado; o erro
  gerado nomeia a empresa como primeira suspeita e carrega o texto da tela.
- **Segunda autenticação.** Qualquer desafio de certificado (ou de credenciais)
  em outro host ao longo da travessia. É tratada como **erro**, não como etapa a
  contornar; na inspeção não houve segunda autenticação.
- **Marcador.** Elemento observável usado como afirmação de chegada a uma tela.
  É escolhido na inspeção (medido, não presumido), e cada chegada tem um único
  marcador.
- **Escolhas do arquivo exportado.** Os dois grupos de rádio do formulário de
  exportação que decidem **quais notas o arquivo traz**. Na tela de NF-e:
  **Tipo de nota** (Todas / Entrada / Saída) e **Status da Nota** (Ativas /
  Canceladas / Inutilizadas / Denegadas / Todas), com `Todas` em ambos e por
  autorização. Na tela de NFC-e: **Tipo de nota** (Entrada / Saída) e
  **Status da NFC-e** (Ativas / Canceladas / Todas) — o fluxo `Canceladas`
  autoriza `Saída` + `Canceladas`, o fluxo `Todas` autoriza `Saída` + `Todas`,
  e em ambos `Tipo` chega `Saída` por autorização. São parâmetro fiscal, e cada
  fluxo os **marca** — nunca os herda dos padrões com que a tela chega. Cada fluxo
  tem a **sua própria** tabela de escolhas, declarada no seu módulo: são **quatro**
  tabelas sobre **três** medições de telas — as duas da NFC-e declaram a mesma
  tela (uma medição só, a spike 08), e o teste unitário do fluxo `Todas` as
  pendura iguais nos fatos de tela, restando como diferença livre só o autorizado
  —, os valores não são transferíveis entre elas (`Saída` vale `1` na NFC-e e `2`
  na de NF-e), e uma constante só seria uma foto valendo por todas. Ver o
  [ADR 0009](decisoes.md#adr-0009--escolhas-do-arquivo-exportado-o-fluxo-as-diz-e-as-confere-no-fio-não-as-herda-dos-padrões-da-tela),
  o [ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo),
  o [ADR 0011](decisoes.md#adr-0011--fluxo-nfce-e-um-terceiro-ciclo-a-tela-própria-da-nfce-e-escolhas-e-prova-próprias)
  e o
  [ADR 0012](decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração).
- **Prova por variação da contagem.** Como cada item de um ciclo prova que o seu
  agendamento aconteceu: conta-se a linha da própria tabela do ciclo —
  `lista-agendamentos` nos fluxos NF-e, `lista-agendamentos-nfce` no da NFC-e —
  antes do pedido e na visita seguinte, e a contagem tem de subir. A pontuação que
  o portal escreve no número da inscrição é removida antes da comparação.
  **Limitação registrada:** nenhuma tabela tem coluna de ciclo, então a linha não é
  atribuível a um ciclo — nada no portal dirá quem a criou. O que a tabela da NFC-e
  acrescenta é apenas o ramo: uma linha dela é uma linha da tela de NFC-e, ainda que
  não diga qual dos quatro ciclos a criou.
- **Prova de chegada.** Afirmação, antes de qualquer acionamento, de que a tela
  esperada está na tela, usando o marcador.
- **Empresa (contribuinte).** A empresa que a sessão representa, escolhida no
  diálogo de seleção de contribuinte. A travessia desta entrega roda para a
  empresa nomeada por `E2E_COMPANY_INSCRIPTION`, porque só uma empresa
  habilitada alcança o sistema de destino; o valor é do ambiente e nunca do
  código versionado, por ser identificador fiscal real. O download é por
  empresa.
- **Download.** Objetivo final do projeto, definido no AGENTS.md: baixar os
  arquivos do fluxo, e nada mais. Permanente: **as entregas atuais são a
  pré-condição dele**, e nenhuma outra ação é executada além do verificável
  para o download.
- **Certificate digital A1.** Certificado de cliente apresentado por negociação
  TLS ao host de SSO, com escopo restrito à origem dele.
- **E-AGEAT.** Módulo do portal para domicílio tributário eletrônico; seu
  sistema legado é atravessado pela travessia.
- **Fluxo.** Sequência de passos que a automação executa contra o sistema real,
  com pré-condições, cliques autorizados e resultado esperado verificável.
