# Decisões da automação

As decisões técnicas do projeto, registradas no formato de ADR. Cada uma é um
capítulo deste arquivo, com o mesmo contexto/decisão/consequências que tinha
quando foi aceita — nada foi resumido, e o número de cada decisão foi preservado
porque é ele que o código, a documentação e os comentários referenciam.

O formato é o mesmo em todas: **Contexto** diz o problema e por que a decisão
existiu; **Decisão** diz a escolha; **Consequências** diz o que ela passa a
exigir. Uma decisão não é revisitada aqui — ela vale enquanto ninguém a revogar,
e revogá-la é acrescentar uma decisão nova, não editar uma antiga.

Uma entrada que **não** está aqui é uma medição. Fato sobre o portal pertence a
[spikes.md](spikes.md); escolha nossa pertence aqui. Quando um dos dois depende
do outro, é esta que cita a spike, nunca o contrário.

## Índice

| Decisão  | Assunto                                                                                               | Data       |
| -------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| ADR 0001 | Compilador TypeScript: série 6 pelo suporte às regras de lint sensíveis a tipos                       | 2026-09-28 |
| ADR 0002 | Escopo de navegadores: binários de todos instalados, execução apenas em Chromium                      | 2026-09-28 |
| ADR 0003 | Estratégia de login: componente reutilizável por teste, sem estado global compartilhado               | 2026-09-28 |
| ADR 0004 | Mecanismo do certificado A1: negociação TLS de certificado de cliente                                 | 2026-09-28 |
| ADR 0005 | Tolerância ao redirecionamento automático: prova de chegada antes do acionamento, pós-requisito único | 2026-09-28 |
| ADR 0006 | Contratos de página: interface estendendo interface, nunca herança de classe                          | 2026-09-28 |
| ADR 0007 | Empresa da travessia por variável de ambiente, não fixada no código                                   | 2026-09-29 |
| ADR 0008 | Ciclo de agendamento: um teste, uma sessão, lista inteira, série sem retentativa                      | 2026-10-01 |
| ADR 0009 | Escolhas do arquivo exportado: o fluxo as diz e as confere no fio, não as herda dos padrões da tela   | 2026-10-02 |
| ADR 0010 | Ciclo de emitente: um segundo ciclo sob demanda, conhecimento do formulário por fluxo                 | 2026-10-08 |
| ADR 0011 | Fluxo NFC-e: um terceiro ciclo, a tela própria da NFC-e, escolhas e prova próprias                    | 2026-10-09 |
| ADR 0012 | Fluxo NFC-e Todas: um quarto ciclo, mesma tela, escolhas como parâmetro e prova por iteração          | 2026-10-14 |

---

## ADR 0001 — Compilador TypeScript: série 6 pelo suporte às regras de lint sensíveis a tipos

**Data:** 2026-09-28
**Status:** aceita

### Contexto

O projeto usa `typescript-eslint` com as configurações `strictTypeChecked` e
`stylisticTypeChecked`, que dependem de informação de tipos para funcionar. A
série 7 do TypeScript altera regras de análise que essas configurações
consomem, e a migração não traria ganho para este projeto: ele não usa os
recursos novos das versões 7, e a compatibilidade das regras de lint é o
critério que decide a série.

### Decisão

Fixar o compilador na série 6 (`typescript@6.0.3`), a mais recente compatível
com as regras de lint sensíveis a tipos já configuradas, em vez de migrar para
a série 7. A versão é exata, sem faixa, tanto no `package.json` quanto no
lockfile.

### Consequências

- As regras de lint sensíveis a tipos continuam produzindo resultados
  confiáveis, e a atualização do compilador não exige reavaliar a configuração
  de lint.
- A escolha fica registrada para quem vier a atualizar o TypeScript: a decisão
  não é "não atualizar nunca", e sim "atualizar quando as regras de lint da
  configuração suportarem a série seguinte".

---

## ADR 0002 — Escopo de navegadores: binários de todos instalados, execução apenas em Chromium

**Data:** 2026-09-28
**Status:** aceita

### Contexto

O portal-alvo é um sistema governamental que exige certificado digital A1, e a
automação roda contra produção. A entrega atual não exige mais de um motor de
navegador, e cada navegador adicional multiplicaria superfície de manutenção e
de variação de comportamento sem ganho de cobertura para o fluxo.

### Decisão

Instalar os binários de todos os navegadores suportados pelo Playwright
(`playwright install`), mas executar a suíte apenas em Chromium, declarado como
o único projeto da configuração (`projects: [{ name: 'chromium' }]`).

### Consequências

- O Chromium é o navegador com o qual o fluxo é verificado localmente e na CI.
- Os binários dos demais navegadores ficam disponíveis para investigação quando
  um comportamento precisar ser comparado entre motores, sem custo de
  manutenção enquanto não forem usados.
- A configuração de execução continua simples: um único projeto, sem matrix de
  navegadores.

---

## ADR 0003 — Estratégia de login: componente reutilizável por teste, sem estado global compartilhado

**Data:** 2026-09-28
**Status:** aceita

### Contexto

O login por certificado é pré-condição de todos os fluxos do projeto. Duas
estratégias eram possíveis: preparar a sessão uma única vez em um
`globalSetup` e compartilhar o estado (via `storageState`) entre os testes, ou
autenticar por teste, reutilizando a mesma sequência.

### Decisão

O login é um componente reutilizável por teste: a fixture `certificate-login`
cria um contexto de navegador por teste com o A1 limitado à origem de SSO, e a
função `loginWithCertificate` autentica explicitamente, aparecendo como etapas
nomeadas no relatório. Não há `globalSetup` nem `storageState` compartilhado.

### Consequências

- Cada teste parte de uma sessão limpa, e nenhum teste depende do estado deixado
  por outro.
- O custo do login se repete por teste, e é aceito em troca de isolamento: a
  regra do projeto é corrigir instabilidade pela causa, não escondê-la atrás de
  estado compartilhado.
- A falha de login é classificada com precisão (certificado recusado, etapa não
  mapeada, portal indisponível), o que um estado preparado globalmente
  esconderia.

---

## ADR 0004 — Mecanismo do certificado A1: negociação TLS de certificado de cliente

**Data:** 2026-09-28
**Status:** aceita

### Contexto

O SIATWeb da SEFAZ-PI autentica por certificado digital A1, e a forma exata
como o navegador apresenta esse certificado era desconhecida até a investigação
registrada em `docs/spikes/04-a1-certificate-login.md`. Confirmou-se que o
mecanismo é **negociação de certificado de cliente na camada TLS**, entregue
por um host de SSO dedicado do Keycloak, e não formulário com upload de arquivo
nem instalação de componente local.

### Decisão

O Playwright apresenta o certificado via `clientCertificates`, configurado no
contexto do navegador com o arquivo do A1 (`.pfx` ou `.p12`) e a senha vindos de
variáveis de ambiente. O escopo do certificado fica **restrito à origem do host
de SSO** (`E2E_CERT_SSO_ORIGIN`): o A1 só é oferecido a esse host, e a nenhum
outro.

### Consequências

- Não há upload de arquivo nem instalação de componente local: o certificado é
  apresentado na negociação TLS quando o navegador alcança o host de SSO.
- O segredo (arquivo e senha) jamais é versionado; caminhos e senha vêm de
  variáveis de ambiente lidas pelo módulo de ambiente.
- O escopo restrito à origem de SSO é o motivo próximo da regra do projeto de
  nunca ampliar o escopo do A1 a uma segunda origem sem decisão do usuário.

---

## ADR 0005 — Tolerância ao redirecionamento automático: prova de chegada antes do acionamento, pós-requisito único

**Data:** 2026-09-28
**Status:** aceita

### Contexto

A inspeção (spike 05) observou que a tela do módulo e-AGEAT **atravessa sozinha**
para o sistema legado cerca de 15 s depois da chegada, sempre recebendo HTTP 500
em `bemVindo.jsf` — e que esse comportamento é estável na inspeção, mas não foi
provado ser determinístico em todas as rodadas. A travessia, portanto, pode
acontecer por dois caminhos: clicando no controle "Acessar Sistema", ou
aguardando o cruzamento automático.

### Decisão

A sequência de travessia tolera os dois caminhos com um **único pós-requisito**:
alcançar a tela de boas-vindas do sistema legado, verificada sempre da mesma
forma. A chegada ao módulo é provada **antes** de acionar a entrada (o controle
só existe antes do acionamento), mas a falha de qualquer passo intermediário não
é tratada como caminho alternativo: nada é engolido, e a decisão final é sempre
o pós-requisito único. Se a tolerância se provar intermitente, ela deixa de ser
tolerância e vira instabilidade a corrigir pela causa, conforme a regra do
projeto.

### Consequências

- Não existem dois caminhos tratados separadamente no código: a prova de chegada
  ao sistema legado é uma só, independentemente de como a navegação aconteceu.
- Um redirecionamento que não leve à tela de boas-vindas falha com diagnóstico
  (texto da tela no momento da falha), nunca com retentativa silenciosa.
- A regra permanece: corrigir intermitência pela causa, não mascarando com
  esperas ou tentativas.

---

## ADR 0006 — Contratos de página: interface estendendo interface, nunca herança de classe

**Data:** 2026-09-28
**Status:** aceita

### Contexto

As classes de página modelam telas de sistemas legados em JSF e de um portal
SPA, cujos controles têm papéis e nomes acessíveis medidos na inspeção. Os
consumidores (testes e sequências) precisavam depender da implementação, o que
acoplava o spec ao detalhe do localizador. Algumas telas compartilham conceitos
(por exemplo, "chegada provável por marcador único"), e esse compartilhamento
precisava de uma forma de modelagem.

### Decisão

Toda classe de página implementa uma interface que declara seu contrato público,
e todo consumidor é tipado contra a interface, nunca contra a classe concreta.
Compartilhamentos entre telas são modelados por **interface estendendo
interface**; herança de classe concreta é proibida. Cada contrato expõe apenas o
que a tela permite (em geral, a chegada e os controles do fluxo autorizado),
deixando deliberadamente de fora qualquer ação que a automação não deve
executar.

### Consequências

- O teste descreve o comportamento observado e depende do contrato, não do
  detalhe de implementação do localizador.
- Conceitos compartilhados têm uma única fonte de verdade em formato de
  interface, sem cadeias de herança de classe.
- A superfície exposta por cada tela é mínima, o que dificulta alcançar por
  acidente um controle que não deveria ser acionado.

---

## ADR 0007 — Empresa da travessia por variável de ambiente, não fixada no código

**Data:** 2026-09-29
**Status:** aceita

### Contexto

A spec original fixava a empresa da travessia como "primeira disponível". A
inspeção (spike 05) provou que essa escolha estava errada: das cinco empresas que
a sessão pode representar, as duas primeiras terminam no beco sem saída
"Usuário não identificado" e só a terceira alcança o sistema de destino. O
usuário autorizou, naquela ocasião, fixar a empresa de sucesso por inscrição em
vez da primeira disponível, e a implementação gravou essa inscrição no código.

Isso atendia ao fluxo, mas contrariava duas regras do AGENTS.md. A inscrição
estadual é dado fiscal de empresa real, e o AGENTS.md proíbe escrever dado
sensível no código versionado e determina lê-lo de variáveis de ambiente. E a
própria entrega apontava a empresa como pendência, porque o download final é por
empresa e depende de a escolha ser explícita.

### Decisão

A inscrição da empresa passa a ser lida de `E2E_COMPANY_INSCRIPTION`, exigida e
sem valor padrão, no mesmo padrão das demais variáveis que a automação não roda
sem. Ela substitui a constante que estava no código, e a decisão de "fixar a
empresa de sucesso" é **invertida**: não há mais empresa fixada no código, e sim
uma empresa configurada, que continua explícita para quem roda.

O valor real fica apenas no `.env` local, que é ignorado pelo Git. A documentação
passa a descrever as empresas com identificadores fictícios de formato válido,
mantendo a ordem e o desfecho de cada linha, que são os achados reais.

### Consequências

- Nenhum identificador fiscal de empresa real fica no código nem na documentação
  versionada.
- A empresa continua sendo uma escolha explícita e centralizada, o que serve à
  fase de download, sem exigir alteração no código quando ela mudar.
- A variável só é exigida no momento em que a travessia roda, porque a abertura
  do módulo, que usa a primeira empresa disponível, não depende dela.
- Falta a variável é um erro explícito que nomeia `E2E_COMPANY_INSCRIPTION`, como
  as demais.

---

## ADR 0008 — Ciclo de agendamento: um teste, uma sessão, lista inteira, série sem retentativa

**Data:** 2026-10-01
**Status:** aceita

### Contexto

O agendamento das exportações do NF-e é uma ação real: cada item da lista
configurada registra um pedido para uma empresa real. A entrega anterior executava
o fluxo uma inscrição por vez, dentro de um laço escrito no próprio teste, e a
medição do pós-retorno mostrou que a lista inteira não podia ser tratada assim.

Três fatos medidos determinaram o formato do ciclo:

- **A suíte não pode rodar em paralelo.** Em paralelo, todas as sessões caem de
  uma vez, com `controle-acesso-ws/mensagens/900004` — "não foi possível localizar um
  usuário ativo vinculado a esse certificado". Em série, o mesmo login passa. A
  configuração anterior subia com `fullyParallel: true` e deixa o número de
  trabajadores e a retentativa para quem executa.
- **O laço por inscrições reusa uma sessão** (spike 06). Uma sessão por inscrição
  esgotaria o limite de `SESSIONS_PER_USER` do próprio banco do sistema de destino,
  que já produziu "becos sem saída" na travessia. Uma sessão para o ciclo inteiro é
  a opção que sobra.
- **Cada item custa uma passagem pela tela de exportação**, porque o formulário
  chega vazio a cada visita e a tela só lista a linha nova na visita seguinte. O
  prazo do teste depende, portanto, do tamanho da lista configurada — que é
  desconhecido em tempo de compilação.

### Decisão

O ciclo de agendamento tem o formato **um teste, uma sessão, lista inteira**:

- **Um teste** para a lista inteira, com o laço no módulo de passos e não no
  arquivo de teste. A apresentação é o relatório HTML, e o relatório é feito para
  ser lido depois: um teste por inscrição daria N relatórios para comparar e N
  sessões para o portal recusar.
- **Uma sessão**, atravessada uma vez, sem nova autenticação entre itens.
- **A lista inteira, mesmo com uma falha no meio.** A falha de um item é
  registrada, o próximo item é tentado, e a primeira falha é elevada ao fim. Um
  item já agendado com êxito não é desfeito por o item seguinte falhar, e o
  relatório é a única forma de saber o que ficou agendado.
- **Retentativa zero, sempre, inclusive na CI.** Neste fluxo uma retentativa não é
  uma segunda chance: é um segundo pedido de exportação para a mesma empresa, no
  mesmo período. A instabilidade se corrige pela causa, como manda a regra do
  projeto — e a causa da instabilidade observada era o paralelismo, não uma
  execução mal-sucedida.
- **Execução serial, gravada na configuração** (`fullyParallel: false`,
  `workers: 1`), e não em opção de linha de comando: a próxima execução sem a
  opção quebraria o portal de novo.
- **Prazo derivado do tamanho da lista**, e não escrito à mão: a travessia, uma
  passagem por inscrição, a visita final de conferência e a folga. Um número escrito
  à mão não pode ser conferido contra as esperas que o fluxo realmente faz, e já
  esteve errado uma vez na configuração deste repositório.

A prova de cada item é a **variação da contagem de linhas** da tabela de
exportações agendadas, conferida numa visita final única ao fim do ciclo. A
tabela não tem coluna de período e o `select` já vem preenchido com um _default_,
o que torna qualquer conferência de conteúdo uma prova que uma seleção inexistente
satisfaz.

### Consequências

- A configuração da suíte impõe série e zero retentativa a **todos** os testes, e
  não só ao ciclo. O custo é tempo de execução; o benefício é um portal que não
  recusa a sessão.
- A primeira falha tipada do ciclo é a que aparece no relatório. Um item que
  falhou depois dela continua nos passos, mas o relatório nomeia a fase que
  falhou — quem lê depois precisa dessa fase, não de uma média.
- Consequência registrada por decisão do solicitante: continuar a lista depois de
  uma falha e aceitar duplicatas entre ciclos significam que **o próximo ciclo
  re-agenda o que já foi agendado com êxito**. É o comportamento pedido; o
  relatório é o que torna isso visível.
- A contagem de linhas vale para a **página visível** da tabela. O tamanho de
  página nunca foi medido, e isso está registrado como pendência na spike 06.
- A tolerância do pós-retorno (campo vazio ⇒ o período é escrito de novo; campo
  com valor divergente ⇒ falha imediata) existe para que a lista inteira seja
  executável, e aparece no relatório como passo próprio quando acontece.

---

## ADR 0009 — Escolhas do arquivo exportado: o fluxo as diz e as confere no fio, não as herda dos padrões da tela

**Data:** 2026-10-02
**Status:** aceita

### Contexto

O formulário do contribuinte tem dois grupos de rádio que decidem **quais notas o
arquivo exportado traz**: **Tipo de nota** (Todas / Entrada / Saída) e **Status da
Nota** (Ativas / Canceladas / Inutilizadas / Denegadas / Todas). A medição da spike 06
registrou as opções, os valores que o portal posta para cada uma e o fato de que
nenhum dos dois grupos dispara pós-retorno na marcação — e registrou também que a tela
chega marcada com os padrões dela: Tipo = Todas, Status = Ativas.

A implementação herdou essa leitura: ela **conferia** os dois padrões e nunca escrevia
nada, com o argumento de que os padrões eram os desejados. Duas coisas tornam esse
argumento falso.

A primeira é que **herdar não é escolher**. A escolha passava a ser um efeito colateral
do que a tela tivesse marcado, e não uma decisão da automação: um portal que mudasse
um padrão mudaria, em silêncio, o conteúdo de todo arquivo agendado, sem que nada
aparecesse no relatório e sem que nenhuma verificação pudesse notar.

A segunda é o **efeito fiscal**, que é autorizável e precisa ser dito: com Status =
Ativas o arquivo traz apenas as notas ativas; com Status = Todas ele passa a trazer
**canceladas, inutilizadas e denegadas** também. Quem conduz a automação autorizou
**Todas** no campo Status da Nota, e é o que a decisão registra.

O mesmo argumento vale para Tipo de nota, que a implementação deixava herdado por
ser o mesmo valor do padrão: as duas escolhas que definem o conteúdo do arquivo ficam
declaradas pelo mesmo mecanismo, ou nenhuma das duas fica.

O risco desta vez não é teórico, e é da mesma classe do defeito do período em branco já
corrigido: o formulário pode ser re-renderizado entre a leitura que o preencheu e o
clique que o submete, e só o **pedido que saiu** diz o que o sistema de destino
recebeu.

### Decisão

O fluxo **diz** as escolhas fiscais do arquivo, e **confere no fio** o que disse:

- **O fluxo marca `Todas` nos dois grupos**, pela linha do grupo e não pelo nome da
  opção — `Todas` é opção dos dois, então o nome não diz a qual grupo pertence. A
  escolha é marcada **depois** da seleção da inscrição, que é a última coisa do item
  que re-renderiza o formulário, e antes do preenchimento do período.
- **Cada grupo é relido depois de marcado.** Um grupo que não oferece a opção
  autorizada, ou que a perde depois de marcada, é o mesmo erro nomeado de antes:
  nenhuma exportação de um conjunto de notas não autorizado é agendada.
- **O pedido que sai é conferido contra o período e contra as escolhas**, na mesma
  leitura e na mesma espera que já existiam. **Nenhuma requisição e nenhuma espera
  nova**: o botão já é esperado por um `waitForRequest` para conferir o período, e o
  corpo dessa resposta é o que se lê.
- **Uma opção nova continua sendo falha antes do primeiro pedido**, porque escolher
  parâmetro fiscal não é da automação. O que mudou foi que o valor **conhecido** deixou
  de ser herdado.
- **Nenhum limite de espera novo por causa disto, e nenhum prazo novo por causa
  disto.** Marcar um rádio não dispara nada (medido), então a ação resolve-se no tempo
  do runner e as cadeias de limites continuam sendo as declaradas. Os limites que o
  módulo passou a declarar depois — `MENU_WALK_TIMEOUT_MS` e
  `INSCRIPTION_RERENDER_TIMEOUT_MS` — não vêm desta decisão: o primeiro corrigiu uma
  espera sem teto que a execução de verificação expôs, e o segundo deu teto à espera pelo
  pós-retorno da inscrição, que já era usada e ainda não tinha um. Ambos estão na
  [spike 06](spikes.md#uma-espera-sem-limite-declarado-e-o-que-ela-custa).

### Consequências

- O arquivo exportado passa a ser **mais largo**: além das notas ativas, traz
  canceladas, inutilizadas e denegadas. É a consequência autorizada, e ela passa a
  estar escrita aqui e na medição, não implícita num padrão de tela.
- **Um valor postado diferente do marcado agora é falha por item**, e não uma surpresa
  no arquivo que ninguém confere: `ExportRequestWithUnauthorisedNoteChoiceError` nomeia
  o item e o grupo, e não o valor — que é parâmetro fiscal de uma exportação real.
- A verificação de "a tela chegou com o padrão esperado" **sai**: com o fluxo marcando a
  escolha, o padrão de chegada não tem consequência, e verificá-lo seria uma afirmação
  sobre a tela, não sobre o pedido.
- A lista de opções de cada grupo, com o valor que cada uma posta, passa a ser **dado
  do código e assunto de teste unitário**: uma opção que o portal deixe de oferecer, ou
  um valor que mude, tem um lugar único onde ser corrigido e um lugar único onde falhar.
- **Proposto e não decidido:** nomear na hora a recusa por repetição, que o portal
  comunica na própria resposta do clique recusado (medido na spike 06) e que o fluxo
  hoje descarta por recarregar para o item seguinte. Custa uma leitura da área de
  mensagens da resposta que já é esperada — nenhuma requisição e nenhuma espera a mais
  — e é a decisão que falta para que a recusa deixe de ser descoberta só ao fim do ciclo.

---

## ADR 0010 — Ciclo de emitente: um segundo ciclo sob demanda, conhecimento do formulário por fluxo

**Data:** 2026-10-08
**Status:** aceita

### Contexto

A tela "Consultar/Exportar NF-e" serve três papéis, um por rádio, e o arquivo
exportado muda de papel. A automação só produzia o arquivo de **recebidas**, pelo
papel `Contribuinte como Destinatário`. Quem responde pela emissão precisa do
arquivo de **emitidas**, e ele não é o mesmo arquivo: um relatório sobre as notas
recebidas não responde a pergunta sobre as notas emitidas.

As duas telas foram medidas separadamente — o formulário de destinatário na
[spike 06](spikes.md), o de emitente na
[spike 07](spikes.md#4-o-formulário-do-emitente) — e hoje são idênticas
byte a byte, menos o valor do papel e os contadores `j_idt…`. Isso é um fato de
duas datas, e não uma garantia: foi medido justamente para não precisar ser
assumido.

Três restrições apertam a escolha. A suíte roda contra o **portal de produção**,
com efeito fiscal real, e o prazo do teste já é derivado do tamanho da lista.
A tabela de agendados não tem coluna de papel. E a pessoa que opera o projeto pediu
que a rodada padrão continuasse sendo quatro pedidos, não oito.

### Decisão

1. **O papel de emitente é um segundo ciclo**, com a própria spec, o próprio módulo
   de ciclo, o próprio objeto de tela e o próprio comando — e não uma variante do
   ciclo existente. Um ciclo parametrizado por papel pouparia linhas e custaria a
   garantia de que os dois ciclos não se tocam: unificar os dois em um caminho só
   está fora de escopo, e está fora de escopo **por escolha**, não por falta de
   tempo.
2. **A lista e o período são os mesmos.** `E2E_NFE_EXPORT_INSCRIPTIONS` e
   `E2E_NFE_EXPORT_EMISSION_START/END` alimentam os dois ciclos sem variável nova,
   porque o que se exporta é o mesmo conjunto de inscrições pelo outro papel.
3. **O conhecimento do formulário é de cada fluxo, e não da tela.** O módulo de
   escolhas do emitente tem os seus próprios grupos, os seus próprios tipos e as
   suas próprias funções de leitura, e nenhum deles é importado do de destinatário.
   Duas medições de duas telas que concordam hoje e podem divergir amanhã; uma
   constante só ficaria sendo uma foto valendo por duas.
4. **`Tipo de nota → Todas` também é do emitente.** Medido na spike 07: o grupo
   existe naquele formulário e chega em Todas, como no outro. A escolha está
   escrita, não herdada.
5. **O papel não é conferido no fio.** Os três nomes de papel são conhecidos pela
   guarda, mas só o destinatário tem a sua escolha conferida no corpo do pedido.
   É a mesma lacuna dos dois fluxos, agora declarada dos dois lados em vez de uma.
6. **A prova de cada item é a variação da contagem de linhas**, com a pontuação
   removida antes da comparação — e a limitação dela é parte da decisão: a tabela
   não tem coluna de papel, então uma linha não é atribuível a este ciclo.
7. **O fluxo roda sob demanda**, pela marca `@on-demand` no título do teste, e a
   rodada padrão inverte o filtro por marca em `test`, `test:headed` e `test:ui`.
8. **Não escolhido, e registrado como tal:** usar a presença de `buscaComoId` no
   corpo do pedido de registro para provar o papel. Medido na spike 07: o papel, as
   duas escolhas, as duas datas e o botão moram todos no mesmo `<form>`, então o
   pedido de registro **levaria** o papel. Atingiria a prova que a tabela não dá —
   mas seria uma segunda leitura do corpo do pedido, uma asserção a mais sobre o
   mesmo fio, e o fluxo de destinatário não faria a mesma coisa.

### Consequências

- **A rodada padrão continua sendo quatro pedidos reais**, um por inscrição, pelo
  papel de destinatário. Os quatro do emitente só acontecem com
  `pnpm test:scheduling:issuer`, e a troca é escolhida a cada vez em vez de ser o
  padrão.
- **O furo conhecido da inversão fica escrito** no `README.md`, no
  [fluxo](fluxo.md) e no comentário da própria spec: quem invocar o executor sem
  passar pelo comando — `npx playwright test`, a extensão do VS Code, qualquer
  comando sem `--grep-invert` — agenda **os dois ciclos**, oito pedidos reais em
  produção em vez de quatro. Nenhum teste é pulado por isso; é a execução que
  passa a fazer mais do que se pediu. Trocar `test`, `test:headed` e `test:ui`
  **altera o comando padrão do projeto**, e a troca foi **aprovada
  explicitamente** antes de entrar, porque é a única peça desta decisão que muda
  o que acontece quando alguém digita o comando de sempre.
- **O conhecimento de tela duplica entre os dois fluxos e é corrigido nos dois
  lugares**: a lista de escolhas conhecidas, as entradas de markup e as duas
  leituras do corpo do pedido existem na página do emitente e na do contribuinte.
  A alternativa — exportar o markup de uma para a outra — faria uma página ler a
  implementação da outra, e a alternativa de baixo, pôr o markup num módulo de
  suporte, feriria a regra de que suítes orquestram telas e não conhecem markup.
  Cada entrada cita a medição que a sustenta, e um portal que mudar de um lado só
  falha onde compete.
- **Uma linha da tabela não é atribuível ao papel**, e nada no portal dirá qual
  papel a criou. Um agendamento feito fora da automação entre as duas leituras
  satisfaria a prova. Isso está escrito na
  [documentação do fluxo](fluxo.md), não só no código.
- **O papel segue sem conferência no fio.** Se o portal mudar o valor que o papel
  posta, os dois fluxos seguem marcando o rádio certo e nada disso. É a lacuna
  que sobra, e ela é conhecida.
- **A recusa por repetição do período passa a ser uma pergunta aberta deste ciclo
  também, e antes de ele rodar.** O portal recusa um pedido cujo período já foi
  agendado, e a recusa é lida só ao fim, como está registrado no
  [ADR 0009](decisoes.md#adr-0009--escolhas-do-arquivo-exportado-o-fluxo-as-diz-e-as-confere-no-fio-não-as-herda-dos-padrões-da-tela).
  O emitente agenda **as mesmas inscrições, o mesmo período**, por outro papel — e
  se o portal decidir pela repetição a partir do período só, a primeira inscrição já
  é recusada e o teste falha antes de agendar nada. Se a recusa levar o papel em
  conta, os quatro pedidos passam. Isso **não foi medido** (a spike 07 não clica),
  e por isso está escrito como pergunta e não como fato: a primeira execução
  autorizada responde, e a resposta entra na spike que a acompanha.
- **A prova do emitente é a mesma forma de prova do destinatário**, com a mesma
  tolerância da re-escrita do período: duas telas que concordam hoje em cada
  detalhe, e que o código trata como independentes porque é isso que elas são.

---

## ADR 0011 — Fluxo NFC-e: um terceiro ciclo, a tela própria da NFC-e, escolhas e prova próprias

**Data:** 2026-10-09
**Status:** aceita

### Contexto

O menu do SIATWeb tem dois ramos que exportam notas: `NF-e` e `NFC-e`. A automação
endereçava só o primeiro — o arquivo de NF-e, nas duas pontas (recebidas e emitidas).
O ramo `NFC-e` abre uma **tela diferente**: outra `form` (`consultarNFCeForm`), outro
conjunto de escolhas, outro rótulo de inscrição e outra tabela de agendamentos
(`lista-agendamentos-nfce`). Quem responde pela emissão precisa também das NFC-e
**canceladas**, e esse arquivo não sai de nenhuma tela de NF-e.

A tela foi medida **antes** de qualquer código endereçá-la — a
[spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)
— e a medição revelou três diferenças que uma suposição teria errado: a tela **chega
já no formulário do emitente** (não no formulário de consulta por chave, como a de
NF-e), o grupo de status tem só **três** opções (`Todas` existe só nele) e o rótulo da
inscrição é **`Inscrição::`**, com dois pontos.

As mesmas três restrições do [ADR 0010](decisoes.md#adr-0010--ciclo-de-emitente-um-segundo-ciclo-sob-demanda-conhecimento-do-formulário-por-fluxo)
seguem valendo: a suíte roda contra o **portal de produção**, com efeito fiscal real;
a tela de agendamentos não tem coluna que diga qual fluxo criou uma linha; e a rodada
padrão tem de continuar sendo quatro pedidos reais.

### Decisão

1. **O ramo NFC-e é um terceiro ciclo**, com a própria spec, o próprio módulo de
   ciclo, o próprio objeto de tela, a própria tabela de escolhas, o próprio teste
   unitário e o próprio comando — e não uma variante do ciclo de NF-e. Um ciclo
   parametrizado por ramo de menu custaria a garantia de que os fluxos não se tocam.
2. **A lista e o período são os mesmos.** `E2E_NFE_EXPORT_INSCRIPTIONS` e
   `E2E_NFE_EXPORT_EMISSION_START/END` alimentam o terceiro ciclo sem variável nova: o
   que se exporta é o mesmo conjunto de inscrições, pelo outro ramo.
3. **O conhecimento de tela é do fluxo.** O módulo de escolhas da NFC-e tem os seus
   grupos, os seus tipos e as suas leituras, e nada é importado dos módulos de NF-e.
   Agora são **três** medições de telas que podem divergir.
4. **O objeto de tela é autónomo, sem delegação.** O objeto do emitente de NF-e
   delega sete operações a um formulário de contribuinte porque, naquela tela, o
   formulário só existe depois de um papel ser marcado. Na NFC-e **não há esse estado
   intermediário**: a tela já chega no formulário do emitente, então não há um
   formulário de contribuinte a que delegar, e o objeto implementa tudo o que
   endereça.
5. **As escolhas do arquivo são ditas e conferidas, e nenhuma é a de NF-e.** A NFC-e
   declara `Tipo de nota → Saída` (`tipoDeNota` = `1`) e
   `Status da NFC-e → Canceladas` (`statusNota` = `0`). Não é `Todas`/`Todas` como no
   fluxo de NF-e: o arquivo pedido é o das notas **emitidas** e **canceladas**. A tela
   chega com `Tipo de nota` = Saída (o que coincide com a escolha) e
   `Status` = Ativas (o que **diverge** e é trocado); o ponto de o fluxo declarar a
   escolha é não herdar o padrão da tela.
6. **A leitura de retorno das escolhas é `toBeChecked`.** Medido na spike 08: os
   rádios de escolha da NFC-e **não disparam postback**. Por isso não há a leitura
   por re-render nem a recusa de "a marcação não pegou" que os fluxos de NF-e têm:
   só existe a recusa de "o grupo não oferece mais a escolha".
7. **A guarda recusa o que o fluxo não conhece.** O conjunto conhecido tem **dois**
   papéis (a NFC-e não tem o papel de consulta por chave) e as opções dos dois grupos.
   Um rádio desconhecido e um **grupo novo** são recusados antes de qualquer marcação,
   e o grupo novo volta ao usuário: escolher quais notas o arquivo traz não é decisão
   da automação.
8. **As classes de erro são reutilizadas, sem classe nova.** As mensagens delas ainda
   dizem "NF-e export form/screen"; neutralizá-las para "export form/screen" é uma
   melhoria **registrada e adiada** (não toca arquivo nem teste de NF-e nesta
   entrega).
9. **Os prazos são as constantes existentes**, sem constante nova: a chegada, a
   travessia do menu, os controles do formulário e o deadline derivado são os mesmos.
10. **A prova de cada item é a variação da contagem de linhas**, na tabela
    `lista-agendamentos-nfce` — uma tabela **separada** da de NF-e. Uma linha não é
    atribuível a um **papel** (a tabela não tem coluna de papel), mas é atribuível ao
    **ramo NFC-e**, porque é a tabela da NFC-e.
11. **O fluxo roda sob demanda**, pela marca `@on-demand` no título, e a rodada
    padrão continua invertendo o filtro por marca.
12. **O escopo termina no agendamento e na prova da linha.** O download — acionar o
    `Download` da linha e verificar o arquivo — é uma fase própria, ainda não
    implementada, e não entra neste ciclo.

### Consequências

- **A rodada padrão continua com quatro pedidos reais**, pelo ramo NF-e. Os pedidos
  da NFC-e só acontecem com `pnpm test:scheduling:nfce`, escolhidos a cada vez.
- **O furo conhecido da inversão cresce**: quem invocar o executor sem passar pelo
  comando agenda **três** ciclos (doze pedidos reais) em vez de dois. Nenhum teste é
  pulado; é a execução que faz mais do que se pediu.
- **O conhecimento de tela passa a duplicar em três fluxos**, corrigido nos três
  lugares: a lista de escolhas conhecidas, as entradas de markup e as leituras do
  corpo do pedido existem em cada objeto de tela, e nenhum importa do outro.
- **O teste unitário da NFC-e difere do de NF-e em dois pontos obrigatórios.** A
  asserção de que "dois grupos compartilham uma opção" não é copiada: no NF-e ela
  filtra os grupos que oferecem a **própria** escolha autorizada e exige dois, então a
  cópia passaria aqui **vazia**, provando uma propriedade que a tela de NFC-e não tem.
  No lugar, prova-se que `rowLabel` e `field` são distintos entre os grupos, e que os
  grupos **não** compartilham opção — a medição que separa esta tabela da de NF-e e que
  um erro de cópia dela quebraria. A seção de vocabulário cobre só a recusa de
  "não oferece", porque a leitura de retorno desta tela é `toBeChecked()`.
- **A recusa por repetição do período também é pergunta aberta aqui**, pelo mesmo
  motivo do ADR 0010: o portal pode recusar um pedido cujo período já foi agendado, e
  isso não foi medido (a spike 08 não clica). Ver o
  [ADR 0009](decisoes.md#adr-0009--escolhas-do-arquivo-exportado-o-fluxo-as-diz-e-as-confere-no-fio-não-as-herda-dos-padrões-da-tela).
- **A mensagem de erro fica dizendo "NF-e"** em uma recusa da NFC-e, até a melhoria
  adiada acima ser feita.
- **A prova da NFC-e é atribuível ao ramo**, e não ao papel — o que a distingue da
  prova de NF-e quanto à limitação: lá, nenhuma coluna dizia o papel; aqui, a própria
  tabela é a da NFC-e.

---

## ADR 0012 — Fluxo NFC-e Todas: um quarto ciclo, mesma tela, escolhas como parâmetro e prova por iteração

**Data:** 2026-10-14
**Status:** aceita

### Contexto

O terceiro ciclo ([ADR 0011](decisoes.md#adr-0011--fluxo-nfce-um-terceiro-ciclo-a-tela-própria-da-nfce-escolhas-e-prova-próprias))
agenda o arquivo de NFC-e **canceladas** (`statusNota` = `0`). Quem responde pela
emissão precisa também do arquivo de **todas** as NFC-e do período — e esse arquivo
não sai daquele ciclo: é a mesma tela, o mesmo ramo de menu, a mesma lista e o mesmo
período, com um **Status** diferente no formulário.

A medição que sustenta os dois fluxos é **uma só**: a
[spike 08](spikes.md#spike-08--tela-e-formulário-da-nfc-e-em-consultarexportar-nfc-e)
mediu a tela inteira — os dois grupos, as opções, os rótulos, os campos e os valores
que o portal posta. O que muda entre um fluxo e o outro não é a tela; é o que cada
um **autoriza** nela.

As restrições do ADR 0010 e do ADR 0011 seguem valendo: produção com efeito fiscal
real; a tabela `lista-agendamentos-nfce` não tem coluna que diga qual fluxo criou uma
linha; e a rodada padrão continua sendo quatro pedidos reais. Somam-se duas questões
desta entrega:

- **Sem variável nova.** A lista e o período vêm das mesmas
  `E2E_NFE_EXPORT_INSCRIPTIONS` e `E2E_NFE_EXPORT_EMISSION_START/END`, como nos outros
  três ciclos.
- **Sobreposição de período entre os dois ciclos da NFC-e.** Os dois agendam as mesmas
  inscrições no mesmo período pela mesma tela. A recusa "Já existe um agendamento com
  os parâmetros passados" já foi medida em produção, mas sempre com parâmetros
  **idênticos**; não foi medido se escolhas diferentes (`statusNota` `0` contra `2`)
  escapam dela.

### Decisão

1. **É um quarto ciclo independente**, com a própria spec, o próprio módulo de ciclo e
   o próprio comando (`test:scheduling:nfce:all-status`) — extensão direta dos ADR
   0010 e 0011. A cópia do ciclo é a única duplicação aceita entre eles: o trabalho
   (`ExportToSchedule`), a tela de erro do portal e a visita de revisão são declarados
   de novo em cada módulo, com a razão escrita onde são declarados, porque a garantia
   de que um ciclo não anda por dentro do outro vale mais que as poucas linhas.
2. **A lista e o período são os mesmos**, pelas mesmas variáveis de ambiente, sem
   variável nova: é o mesmo conjunto de inscrições, pela mesma tela, com outro Status.
3. **As escolhas são `Saída` e `Todas`, numa tabela própria.**
   `NFCE_ALL_STATUS_NOTE_CHOICE_GROUPS` declara `Tipo de nota → Saída`
   (`tipoDeNota` = `1`, coincidente com o padrão da tela e com o terceiro ciclo) e
   `Status da NFC-e → Todas` (`statusNota` = `2`, contra `0` do terceiro ciclo e `1`
   que a tela marca por padrão). Aceitar a tabela do irmão restringiria o arquivo às
   canceladas com o pedido saindo perfeitamente bem — a falha sem sintoma visível.
4. **Os fatos de tela ficam pinados entre as duas tabelas.** Como a medição é uma só,
   o teste unitário do quarto fluxo compara rótulo, campo, opções e valores das duas
   tabelas e exige que **coincidam**; o único campo livre para divergir é o que cada
   fluxo autoriza, e esse é fixado como o par `Saída`/`Todas`. Duas declarações de uma
   só medição, com o desacordo entre elas virando vermelho sem portal.
5. **O objeto de tela modela a tela; as escolhas entram como parâmetro.** Os métodos
   novos `applyNoteChoices(groups)` e `scheduleExportValidated(period, reference,
groups)` são aditivos no contrato da NFC-e, e os métodos existentes passam a ser
   declarações finas que repassam a própria tabela — comportamento antigo intocado,
   inclusive para a bateria unitária já escrita. A leitura do pedido
   (`findDivergedNfceNoteChoiceGroup`) ganha `groups` com a tabela antiga como padrão:
   uma tela, dois fluxos, **uma** lógica de comparação; o que separa os fluxos é
   dado — a tabela — e não código.
6. **O módulo de escolhas novo é só dado.** Sem funções e sem vocabulário de recusa
   próprios: marcar e ler vivem no objeto de página, parametrizados, e a palavra que a
   recusa carrega é a mesma string que a página já cita. Uma segunda constante seria
   um valor que ninguém lê — e o teste unitário fixa a palavra que a **classe de erro
   realmente recebe**, contra o grupo deste fluxo.
7. **A prova é por iteração, com visita própria — não há passe final.** Medido na
   spike 06, seção "A tabela só lista depois de uma nova visita": `Agendar exportação`
   responde sem recarregar e a linha só entra na listagem numa **nova carga** da tela.
   Um poll apontado na página que acabou de clicar esperaria o limite inteiro e
   reportaria, com razão, que nada foi agendado. Então cada item paga a própria visita
   de prova logo após o próprio clique, antes do item seguinte — o que é também o que
   mantém a prova por item: a falha de um item é nomeada onde aconteceu, e o item
   seguinte é tentado.
8. **O deadline deriva do formato do ciclo.** `allStatusSchedulingTestDeadlineMs(n)` =
   travessia + n × (passo da inscrição + visita de prova) + folga, declarada ao lado do
   próprio ciclo (`timeouts.ts` é dono das constantes e das cadeias, não do formato de
   um ciclo) e coberta por teste unitário próprio — `timeouts.test.ts` não é alterado.
9. **As falhas são acumuladas por item e a primeira é reexecutada no fim**, como nos
   outros ciclos; nenhum erro é silenciado e nenhum item é pulado por causa do
   anterior. As classes de erro são as existentes, importadas sem cópia e sem classe
   nova.
10. **A prova continua não atribuível a um fluxo, por ser a mesma tabela do terceiro
    ciclo.** A contagem prova que **uma** linha nova surgiu para a inscrição na tela da
    NFC-e; se os dois ciclos da NFC-e forem executados, cada execução lê os seus
    próprios contadores e não há corrida entre elas, mas a tabela não diz qual ciclo
    criou o que — a limitação está escrita na prova e aqui, não contornada.
11. **O fluxo roda sob demanda**, pela marca `@on-demand` no título, na lista de
    comandos com a inversão de filtro.

### Consequências

- **A rodada padrão continua com quatro pedidos reais.** O quarto ciclo só roda com
  `pnpm test:scheduling:nfce:all-status`, escolhido a cada vez.
- **O furo conhecido da inversão cresce mais uma vez**: quem invocar o executor sem
  passar pelo comando agenda **quatro** ciclos (dezesseis pedidos reais) em vez de um.
  Nenhum teste é pulado; é a execução que faz mais do que se pediu.
- **Rodar os dois ciclos da NFC-e agenda duas exportações por inscrição no mesmo
  período** — uma com `statusNota` = `0`, outra com `statusNota` = `2`. Se o portal
  julgar a repetição só pelo período (não medido; ver a questão aberta acima), o
  segundo ciclo é recusado no primeiro item com "Já existe um agendamento com os
  parâmetros passados" e a prova falha ali. Registrado no README ao lado dos comandos.
- **Uma mudança de portal exige editar as duas tabelas da NFC-e**, e o teste unitário
  do quarto fluxo é quem fala quando só uma foi editada. O preço é ter duas
  declarações de uma medição; a alternativa — uma tabela emprestada do outro fluxo —
  transformaria a separação dos fluxos em detalhe de import.
- **O teste unitário de deadline vive num arquivo próprio**
  (`nfce-export-issuer-all-status-scheduling.test.ts`), porque a função é do módulo do
  ciclo e `timeouts.test.ts` continua tratando só das derivações de `timeouts.ts`.
- **A primeira visita de prova desta entrega bateu na tela de erro interna do portal**
  (ORA-01924, permissão de papel do lado do servidor — a mesma intermitência já
  registrada duas vezes em execuções anteriores). O comportamento é o dos demais
  ciclos: a falha é nomeada e o fluxo não tenta de novo por conta própria.
