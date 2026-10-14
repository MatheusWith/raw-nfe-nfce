# Medições contra o portal

O registro das rondas de inspeção contra o portal SIATWeb da SEFAZ-PI. Cada uma é
um capítulo deste arquivo.

Uma **spike** é uma ida ao portal com inspetor aberto, para descobrir o que uma
tela é — e o registro dela é um documento **histórico**: diz o que se viu, quando
se viu, e com qual alcance. Uma spike não é revisada quando o portal muda, porque
o valor dela é ser o documento que descreve o portal em uma data. O que se faz
quando uma medição envelhece é abrir outra spike, e é por isso que as rodadas
têm número.

É a diferença entre medir e escolher, e ela separa os dois arquivos: o que se
**observou** está aqui; o que se **escolheu** está em
[decisoes.md](decisoes.md). Quando uma escolha cita a medição que a motivou, é a
decisão que aponta para cá — nunca o contrário.

As justificativas de seletor da automação saem daqui, e a regra do `AGENTS.md` de
nunca escrever marcação literal dentro de um localizador é exatamente isto: a
marcação medida tem uma fonte da verdade, datada.

## Índice

| Spike                                                         | Data       | Conclusão                                                                          |
| ------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| Spike 04 — Login do SIATWeb por certificado digital A1        | 2026-09-28 | concluído                                                                          |
| Spike 05 — Travessia do módulo e-AGEAT para o sistema SIATWeb | 2026-09-28 | concluído                                                                          |
| Spike 06 — Tela "Consultar/Exportar NF-e" do SIATWeb          | 2026-09-29 | concluída — a tela inteira está medida e o clique autorizado funcionou             |
| Spike 07 — Formulário do papel de emitente na mesma tela      | 2026-10-08 | concluída — o formulário do emitente está medido, sem nenhum clique de agendamento |
| Spike 08 — Tela e formulário da NFC-e em "Consultar/Exportar" | 2026-10-09 | concluída — a tela da NFC-e está medida, sem nenhum clique de agendamento          |

---

## Spike 04 — Login do SIATWeb por certificado digital A1

**Data:** 2026-09-28
**Alvo:** `https://siatweb.sefaz.pi.gov.br`
**Status:** concluído. Mecanismo identificado e todo o encadeamento pós-certificado
observado com o A1 do usuário.

### Objetivo

Descobrir como o SIATWeb aceita o certificado digital A1 e qual elemento
comprova a chegada à tela do e-AGEAT, sem presumir o mecanismo e sem executar
nenhuma ação com efeito fiscal.

A parte inicial desta investigação usou apenas leitura, sem credenciais. A
observação posterior, feita com o A1 do usuário, autenticou uma sessão de leitura
e não executou nenhuma ação com efeito fiscal.

### Como a investigação foi feita

Como a página é renderizada no cliente (Nuxt/Vuetify) e o texto do spec citava
elementos que não apareciam, o bundle JavaScript do painel foi lido e os
roteiros de carga foram inspecionados com o Chromium em modo headless. Isso
permitiu ler o comportamento real sem precisar do certificado do usuário.

### Tela de login (não autenticado)

`https://siatweb.sefaz.pi.gov.br/painel-aplicacoes` apresenta duas colunas
separadas por um divisor "OU":

| Coluna   | Controles                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Esquerda | Bloco clicável com ícone de certificado e o rótulo **CERTIFICADO DIGITAL**; link "Como obter o certificado digital?" |
| Direita  | Formulário "Login (CPF/CNPJ)" + "Senha" + botão "ENTRAR" + link "Cadastrar Nova Senha"                               |

#### Divergência em relação ao spec

**Na tela de login, o controle "Acessar Sistema" não existe.** A busca pelo texto
em todas as cargas do painel (principal e três blocos preguiçosos) não retornou
nenhuma ocorrência. O controle de entrada por certificado é o bloco
**"CERTIFICADO DIGITAL"**.

Consequência: o critério de aceitação do ticket 05 ("afirma que 'Acessar
Sistema' fica disponível antes de clicar") não é alcançável como escrito e
precisa ser reescrito com o usuário.

**Correção de escopo, vinda do ticket 06.** "Acessar Sistema" existe, mas dentro
do módulo e-AGEAT, e não na tela de login. Ele é a entrada no sistema legado que
o módulo serve. A afirmação original do spec continua errada quanto ao momento em
que o controle aparece; a afirmação de que o texto não existe no portal, não.

### Mecanismo de aceitação do certificado

O mecanismo é **negociação de certificado de cliente na camada TLS**, entregue
por um host de SSO dedicado do Keycloak. Não há depósito local de certificados
nem upload de arquivo.

O bloco "CERTIFICADO DIGITAL" chama `logarcert()`, que executa
`loginWith("keycloak")` com `client_secret` e redireciona para:

| Propriedade                 | Valor                                         |
| --------------------------- | --------------------------------------------- |
| Host de certificado         | `https://siatweb-certificado.sefaz.pi.gov.br` |
| Realm                       | `nsw-sefaz`                                   |
| Client                      | `controle-acesso-sefaz`                       |
| Host de SSO sem certificado | `https://siatweb-sso.sefaz.pi.gov.br`         |

A negociação foi confirmada na mão, com `openssl s_client`: o host pede
certificado de cliente durante o handshake, aceitando `RSA sign`, `DSA sign` e
`ECDSA sign`.

#### Comportamento observado

| Cenário                              | Resultado                                              |
| ------------------------------------ | ------------------------------------------------------ |
| Sem certificado                      | Redireciona para `/painel-aplicacoes/certificado-erro` |
| Certificado autoassinado de sondagem | `400 The SSL certificate error`, do nginx              |

O segundo cenário mostra que a validação é estrita e acontece no nginx, antes
do Keycloak.

#### Falso caminho descartado

O bundle do painel inclui a biblioteca Web PKI, com `listCertificates`,
`readCertificate` e um serviço REST PKI em `http://restpki.sefaz.pi.gov.br/`.
Esses recursos **não participam do login**. Eles atendem à assinatura de
documentos: o diálogo "Selecione um Certificado" aparece quando o usuário
clica em "Assinar" e a lista é filtrada pelo CPF/CNPJ do usuário autenticado.

### Viabilidade headless: confirmada

O receio principal da fase era que o portal exigisse um componente local. Não
exige, e o caminho headless funciona.

O Playwright 1.63 implementa `clientCertificates` por um proxy local que
termina a TLS e apresenta o certificado configurado. O código é comum à camada
de contexto compartilhada, e não uma exclusividade do Firefox. Para conferir
foi feito um ensaio com certificado autoassinado gerado na hora e um servidor
TLS local que exige certificado de cliente:

```
httpStatus: 200
serverObservedSubjectCN: playwright-client-certificate-probe
RESULT: SUPPORTED — Chromium apresentou o certificado de cliente configurado.
```

Ou seja: o Chromium headless apresenta certificado de cliente, e a senha do A1
pode ser informada em `passphrase` em vez de gravada no disco.

### Encadeamento observado com o A1 válido

Não há formulário pós-certificado. A hipótese de um passo extra do Keycloak não
se confirmou, e o `probe-keycloak-form.ts` deste spike ficou obsoleto.

| Passo | Onde                                   | O que acontece                                                                 |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 1     | `/painel-aplicacoes`                   | Redireciona para `/painel-aplicacoes/login`                                    |
| 2     | Bloco "CERTIFICADO DIGITAL"            | `loginWith("keycloak")` redireciona para o host de certificado                 |
| 3     | `siatweb-certificado.sefaz.pi.gov.br`  | O navegador apresenta o A1 na negociação TLS; o Keycloak aceita sem pedir nada |
| 4     | `/painel-aplicacoes/callback?code=...` | O portal responde uma casca "Loading..." e troca o código por uma sessão       |
| 5     | `/painel-aplicacoes/main`              | Lista os 13 módulos aos quais a sessão tem acesso                              |

A tela de login e o painel autenticado saem do mesmo prefixo de rota, e a casca
"Loading..." também não se distingue pela URL. A lista de módulos presente é o
único sinal observável de sessão viva. Isso revelou um falso positivo no teste
de login, descrito no ticket 05.

### Pendências

Resolvidas com o A1 do usuário: senha e arquivo do certificado (o `.pfx` está
dentro da pasta do projeto, e o `.gitignore` passou a cobrir `*.pfx`, `*.p12`,
`*.pem` e `*.key`), formulário pós-certificado (não existe) e marcador do
e-AGEAT (nome acessível do link, sem `exact`, por decisão do usuário).

Em aberto, e bloqueando o ticket 06:

- **Escolha do contribuinte.** A sessão entra como CONTADOR e o portal abre um
  diálogo "Selecionar Contribuinte" (`role="dialog"`, `aria-modal="true"`) cujo
  scrim impede clicar em qualquer módulo. O Escape não fecha o diálogo, e a
  busca só traz resultado depois de "CONSULTAR" ou de escolher "Todos os
  Contribuintes" no menu do seletor. Falta saber qual empresa usar, dado que só
  o usuário tem.
- **Um erro de JavaScript na carga da tela, sem dono.** Medido na 3ª execução do
  ciclo de agendamento: aos 8,6 s da execução — ou seja, já com o A1 autenticado e
  o painel aberto — a página lançou `SyntaxError: Unexpected token '<'`, com a URL
  e a linha em branco no registro do navegador. O sintaxe é de HTML servido onde o
  navegador esperava script, mas **o trace não guardou qual recurso**, então não é
  possível dizer de onde veio. Não derrubou nada: o painel carregou e a sessão
  seguiu. Pendente apenas para diagnóstico, sem efeito no fluxo.

### Arquivos desta investigação

Ficaram em `sandbox/`, que é ignorado pelo Git e serve para descarte:

| Arquivo                       | Função                                                  |
| ----------------------------- | ------------------------------------------------------- |
| `inspect-login.ts`            | Lê a tela de login e seus controles interativos         |
| `inspect-login-chunks.ts`     | Grava o HTML renderizado e as cargas de JS              |
| `probe-client-certificate.ts` | Ensaios de certificado de cliente com Chromium headless |
| `probe-keycloak-form.ts`      | Tenta observar o formulário do Keycloak pós-certificado |

---

## Spike 05 — Travessia do módulo e-AGEAT para o sistema SIATWeb

**Data:** 2026-09-28
**Alvo:** `https://siatweb.sefaz.pi.gov.br` (portal), o sistema legado do e-AGEAT
e o sistema de destino SIATWeb em `https://webas.sefaz.pi.gov.br`
**Status:** concluído. A cadeia completa da travessia foi observada e registrada,
com o caso de sucesso e os estados de erro documentados: a travessia depende da
empresa escolhida, e a empresa que alcança o sistema de destino nesta inspeção
foi medida e registrada.

### Objetivo

Descobrir como a sessão autenticada no portal sai da tela do módulo e-AGEAT,
atravessa para o sistema legado e chega ao sistema de destino SIATWeb, sem
presumir o mecanismo e sem executar nenhuma ação com efeito fiscal. Duas das
três telas da travessia nunca haviam sido observadas, e o ticket anterior
registrou que a entrada no sistema legado não foi exercitada.

A inspeção clicou apenas nos três controles que descrevem o fluxo — a entrada
no sistema legado, o gatilho do menu de auto-regularização e a opção que leva
ao SIATWeb — e na tela do destino não clicou em nada. O controle "Efetuar
login" da tela de beco sem saída é um quarto controle, além dos autorizados, e
**não foi clicado**: a informação sobre ele foi obtida por leitura direta da
URL que ele abre (GET, sem clique), o que não exige nova autorização.

### Como a investigação foi feita

Scripts descartáveis em `sandbox/` (ignorados pelo Git), com Chromium headless e
o certificado A1 já configurado no ambiente local. A sessão foi autenticada de
verdade contra produção, percorreu o diálogo de contribuinte e o módulo
e-AGEAT, e executou a entrada no sistema legado. A descoberta de que a
travessia é **por empresa** levou a uma segunda rodada, autorizada pelo usuário
("mate a execução atual e tente novamente, para conseguir o caso de sucesso"):
as cinco empresas do diálogo foram percorridas com exatamente o mesmo caminho
autorizado, e a primeira empresa que alcançou a tela de boas-vindas teve a
cadeia restante (menu + opção SIATWeb + destino) medida na mesma rodada.
Nenhum formulário foi submetido e nenhuma ação com efeito fiscal foi executada.

### Empresas do diálogo de contribuinte

O diálogo "Selecionar Contribuinte" listou **5 empresas** (ordem da lista,
após "Consultar"):

| #   | Inscrição    | CPF/CNPJ           | Razão social           | Travessia observada                        |
| --- | ------------ | ------------------ | ---------------------- | ------------------------------------------ |
| 0   | 00.000.000-0 | 00.000.000/0001-91 | EMPRESA ALFA LTDA      | beco sem saída                             |
| 1   | 00.000.000-1 | 00.000.000/0001-92 | EMPRESA BETA LTDA      | beco sem saída                             |
| 2   | 00.000.000-2 | 00.000.000/0001-93 | EMPRESA GAMMA LTDA ME  | **sucesso: tela de boas-vindas + destino** |
| 3   | 00.000.000-3 | 00.000.000/0001-94 | EMPRESA GAMMA LTDA ME  | não testada (inspeção parou no sucesso)    |
| 4   | 00.000.000-4 | 00.000.000/0001-95 | EMPRESA GAMMA LTDA MEE | não testada (inspeção parou no sucesso)    |

As inscrições, os CNPJs e as razões sociais desta tabela são **fictícios**,
mantendo o formato e a ordem observados: só o desfecho de cada linha é um
achado real. A empresa de sucesso é a que a automação recebe em
`E2E_COMPANY_INSCRIPTION`, cujo valor fica no ambiente local e nunca é
versionado, por ser identificador fiscal real.

O índice "#" é a posição na lista renderizada pelo diálogo (0-based), que é a
ordem usada pela automação ao escolher "a primeira disponível".

### Cadeia de falha (empresas 0 e 1) — estados documentados

Para as empresas 0 e 1, o caminho autorizado termina no beco sem saída já
registrado no ticket anterior, e o usuário confirmou que esses estados de erro
"são possíveis e devem ser documentados".

#### 1. Login e seleção de contribuinte

Login por certificado conforme spike 04: bloco **CERTIFICADO DIGITAL** →
negociação TLS em `siatweb-certificado.sefaz.pi.gov.br` → callback → painel com
13 módulos. O diálogo de contribuinte exige "Consultar" antes de listar.

#### 2. Tela do módulo e-AGEAT

| Controle                  | Papel          | Nome acessível    |
| ------------------------- | -------------- | ----------------- |
| Entrada no sistema legado | texto clicável | "Acessar Sistema" |

#### 3. Lacuna A — a tela do módulo atravessa sozinha?

**Sim.** Cerca de 15 s após a chegada ao módulo, a própria tela navega para
`bemVindo.jsf` e recebe **HTTP 500** (página de erro do servidor). O comportamento
foi constante nas execuções desta inspeção.

#### 4. Clique em "Acessar Sistema" (autorizado)

O clique precisa de `force: true` (o SPA sobrepõe a tela com o overlay
`loading-page` no início da navegação). Cadeia medida:

| Salto | URL                                     | Status | Cookies                          |
| ----- | --------------------------------------- | ------ | -------------------------------- |
| 1     | `/eageat-siatweb`                       | 302    | `EAGEATID=eageat3`, `JSESSIONID` |
| 2     | `/eageat/jsp/login/bemVindo.jsf`        | 302    | —                                |
| 3     | `/eageat/jsp/util/usuarioNaoLogado.jsf` | 200    | —                                |

Página final: **"Acesso proibido / Usuário não identificado / Clique no botão
para efetuar o login. / Efetuar login"** (link, destino `../login/login.jsf`).

#### 5. Navegações diretas (leitura)

| Rota (GET)                        | Cadeia                        | Resultado                                                            |
| --------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `/eageat/jsp/login/login.jsf`     | 302 → `/` → 302               | 200 `/portal-publico` — bounce para a home do portal, sem formulário |
| `/eageat/jsp/login/bemVindo.jsf`  | 302                           | 200 `usuarioNaoLogado.jsf` — mesmo beco                              |
| `/eageat/`                        | 302 → `login.jsf` → 302 → `/` | 200 `/portal-publico` — loop quebrado                                |
| `/eageat-siatweb` (sessão fresca) | 302 → `bemVindo.jsf`          | **500**                                                              |

#### 6. Cookies e sessão no beco

Os cookies legados atravessam (`AUTH_SESSION_ID_LEGACY`, `KEYCLOAK_IDENTITY_LEGACY`,
`KEYCLOAK_SESSION_LEGACY`, `EAGEATID`, `JSESSIONID`, `perfil`), mas a sessão do
sistema legado não é estabelecida para essas empresas: o JSF responde "Usuário
não identificado".

### Cadeia de sucesso (empresa 2) — a travessia completa

1. **Login + contribuinte:** mesma autenticação; empresa [2] — a habilitada,
   vinda de `E2E_COMPANY_INSCRIPTION` — selecionada no diálogo.
2. **Módulo + entrada:** módulo e-AGEAT → clique em "Acessar Sistema"
   (`force: true`).
3. **Tela de boas-vindas do sistema legado:** `bemVindo.jsf` (200), título
   **"e-Processo"**.
4. **Gatilho do menu (2º clique autorizado):** link **"Autorregularização"**
   (`a.dropdown-toggle.btn` — dropdown do tipo Bootstrap), que revela o menu com:
   Autorregularização, Controle de Acesso, Malhas Fiscais, Parcelamento de
   Débitos / Anistia, Órgão Preparador, **SIAT** (`javascript:logarSiatWeb();`),
   SISAT, NF-e, Portal EFD, Conformidade, Honorário.
5. **Opção que leva ao SIATWeb (3º clique autorizado):** item **"SIAT"** do menu
   (`a[href="javascript:logarSiatWeb();"]`), navegação na mesma aba.
6. **Sistema de destino:** `https://webas.sefaz.pi.gov.br/siatweb/faces/index.xhtml`
   (com `?faces-redirect=true`), título **"SIAT - Sistema Integrado de
   Administraçao Tributária"**, usuário autenticado (a sessão atravessa sem
   pedir nada), **sem segunda autenticação**.

#### Marcadores de chegada (Lacuna C — resolvida)

| Tela                  | Marcador identificado                                                                                    | Por que é distinto                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Boas-vindas do legado | link "Autorregularização" (`a.dropdown-toggle.btn`) em `bemVindo.jsf`, título "e-Processo"               | Não aparece no portal, na tela de login nem no beco sem saída        |
| Sistema de destino    | URL `{origem}/siatweb/faces/index.xhtml` + título "SIAT - Sistema Integrado de Administraçao Tributária" | Só existe na origem de destino, é o lugar de onde os arquivos sairão |

#### Autenticação na travessia

**Não houve segunda autenticação.** O legado nunca desafiou certificado de
cliente, e o destino autenticou a sessão silenciosamente: ao clicar em "SIAT",
aparecem no contexto os cookies `SIATID` e o `JSESSIONID` de `webas`.
O escopo do A1 permaneceu restrito à origem `siatweb-certificado.sefaz.pi.gov.br`,
sem alteração. A Lacuna B ficou sem exercício (o destino não pede certificado).

#### Controles medidos (papel e nome acessível)

| Controle                         | Papel                  | Nome acessível / seletor medido                                          |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Entrada no legado (módulo)       | texto clicável         | "Acessar Sistema"                                                        |
| Gatilho do menu (boas-vindas)    | link (dropdown toggle) | "Autorregularização", classe `dropdown-toggle btn`                       |
| Opção que leva ao SIATWeb (menu) | link                   | "SIAT", `href="javascript:logarSiatWeb();"` — dentro do `.dropdown-menu` |
| Saída do beco                    | link                   | "Efetuar login" (destino `login.jsf`, bounce para a home do portal)      |

### Origens atravessadas

| Aplicação                  | Origem                                                | Papel                                                        |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Portal (painel)            | `https://siatweb.sefaz.pi.gov.br`                     | de onde a sessão parte (`E2E_BASE_URL` = `/portal-publico/`) |
| Legado e-AGEAT             | `https://siatweb.sefaz.pi.gov.br` (caminho `/eageat`) | tela de boas-vindas e menu                                   |
| Sistema de destino SIATWeb | `https://webas.sefaz.pi.gov.br`                       | **nova origem** — `E2E_SIATWEB_SYSTEM_ORIGIN`                |

Como o portal hoje é servido na raiz do host (não em `/portal-publico/`), toda
navegação parte de `originOf(baseUrl)`; e o destino, por ser outra origem,
precisa de URL absoluta montada a partir da nova variável.

### Desvios em relação ao ticket anterior e à spec

| Suposição                                                | Realidade                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A travessia leva à tela de boas-vindas do sistema legado | Depende da empresa: a #0 e a #1 terminam em "Usuário não identificado"; a #2 alcança boas-vindas e destino  |
| A sessão atravessa sem novo login (hipótese de trabalho) | **Confirmado no caso de sucesso**: sem segunda autenticação; `SIATID` + `JSESSIONID` de `webas` no contexto |
| A tela do módulo pode atravessar sozinha (Lacuna A)      | Atravessa sozinha em ~15 s, sempre para o 500 em `bemVindo.jsf`                                             |
| O login legado pode exigir segundo fator (Lacuna B)      | Não exerce: no sucesso a sessão atravessa direto; no beco rejeita antes de pedir qualquer coisa             |

### Conclusão

A travessia é **viável e depende da empresa**. Para a empresa que tem acesso, a
cadeia completa é: módulo e-AGEAT → "Acessar Sistema" → boas-vindas
(`bemVindo.jsf`, título "e-Processo") → menu "Autorregularização" → "SIAT" →
sistema de destino SIATWeb em `webas.sefaz.pi.gov.br`, **sem segunda
autenticação** e sem nenhum clique no destino. Para empresas sem acesso, o beco
sem saída "Usuário não identificado" é o desfecho documentado e legítimo.

**Decisões do usuário registradas:** (1) os estados de erro observados "podem
acontecer" e devem ser documentados — estão, nesta spike e nos artefatos;
(2) o usuário autorizou encerrar a execução anterior e tentar novamente para
obter o caso de sucesso — o sucesso foi obtido na empresa [2].

### Lacunas remanescentes

- **Empresa da automação (resolvida):** a spec havia fixado "primeira disponível",
  mas a primeira ([0]) falha e a empresa [2] é a do sucesso. O usuário decidiu,
  na investigação, fixar a empresa de sucesso por inscrição em vez da primeira
  disponível. Essa decisão foi **invertida**: a empresa passou a ser configurável
  por `E2E_COMPANY_INSCRIPTION`, e o valor real saiu do código versionado por ser
  identificador fiscal de empresa real. A escolha continua explícita na
  configuração, que é o que o download por empresa exige. Ver ADR 0007.
- **Empresas [3] e [4]:** não testadas (a inspeção parou no primeiro sucesso).
- **Estabilidade do legado:** o 500 em `bemVindo.jsf` (travessia automática e
  navegação direta) indica um componente instável do lado do servidor; sem
  ele, a travessia automática da tela do módulo nunca é um caminho útil.
- **A travessia só nomeia duas chegadas.** O classificador da tela de boas-vindas
  reconhece a tela de sessão perdida pelo texto e, para qualquer outra chegada,
  levanta `LegacyTraversalError` com o texto da tela. Não há regra para a **recusa
  de certificado** (`/painel-aplicacoes/certificado-erro`), que o portal pode
  devolver depois do cruzamento a partir do módulo e que a tela de login já sabe
  nomear: uma travessia interrompida por recusa sai no relatório como travessia
  incompleta, e não como a recusa que foi. **Pendente, não corrigido.** A falha de
  travessia observada na primeira execução do ciclo não preservou o texto da tela,
  então a classificação dessa chegada específica **não foi conferida** — o que está
  descrito aqui é a lacuna estrutural do classificador, observada no código, e não
  uma medição da tela que respondeu.

### Arquivos desta investigação

Ficaram em `sandbox/`, ignorado pelo Git e destinado a descarte:

| Arquivo                                                     | Função                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `inspect-ageat-traversal.ts`                                | Inspeção principal: tela de login, painel, diálogo, módulo, entrada no legado                                   |
| `probe-legacy-chain.ts`                                     | Cadeia clique + navegações diretas, com mapa de cookies por salto                                               |
| `probe-legacy-login-page.ts` / `probe-legacy-login-hops.ts` | Leitura do `login.jsf` e das cadeias de redirecionamento                                                        |
| `probe-other-companies.ts`                                  | Rodada autorizada: percorre as 5 empresas e captura o caso de sucesso                                           |
| `probe-welcome-menu-structure.ts`                           | Medição do gatilho do menu (dropdown toggle)                                                                    |
| `probe-welcome-menu.ts`                                     | 2º e 3º cliques autorizados e captura do destino (leitura)                                                      |
| `inspect-ageat-traversal-output/`                           | Artefatos: corpos, estados JSON, HTML, `legacy-hops.json`, `other-companies.json`, `welcome-*`, `destination-*` |

---

## Spike 06 — Tela "Consultar/Exportar NF-e" do SIATWeb

**Data:** 2026-09-29, verificada em 2026-09-30
**Alvo:** sistema de destino SIATWeb em `https://webas.sefaz.pi.gov.br`
**Status:** **concluída — a tela inteira está medida e o clique autorizado
funcionou.** As fases A, A2, B e C foram concluídas. O clique em "Agendar
exportação" **criou uma exportação**, confirmada numa visita seguinte pelo horário
de criação (ver [7](#7-o-clique-autorizado-e-o-que-ele-produziu)). A tela **não dá
nenhum retorno**: nenhuma mensagem, nenhum diálogo, nenhuma linha na página que
pressionou o botão. Nada foi baixado.

### Objetivo

Medir, antes de implementar, como se chega à tela "Consultar/Exportar NF-e" e como
ela se comporta: a estrutura do menu que leva até ela, o aviso inicial, o grupo
de papéis do contribuinte, o controle de inscrição, os campos de data de emissão,
o botão de agendamento e a tabela de exportações agendadas.

A medição existe porque três pontos do fluxo não podem ser presumidos: o nome
"NF-e" também é substring de "Consultar/Exportar NF-e" e de "Consultar/Exportar
NF-e Detalhada"; não se sabe se o clique no item do menu abre outra aba; e não se
sabe se agendar uma exportação acrescenta uma linha na tabela ou reaproveita uma
linha existente.

### Como a investigação foi feita

Scripts descartáveis em `sandbox/` (ignorados pelo Git), com Chromium headless e
o certificado A1 do ambiente local, reusing a travessia já medida no spike 05. Os
artefatos ficaram em `sandbox/inspect-nfe-export-output/`.

Nenhuma inscrição, razão social ou CNPJ foi gravada em nenhum artefato nem neste
documento. Os valores aparecem apenas como **forma**: quantidade, comprimento,
quantidade de dígitos, se são dígitos puros. A forma é o que os localizadores
precisam saber; o valor é identificador fiscal real.

### 1. O menu do sistema de destino

O menu é um menu **Wijmo** (ComponentOne) renderizado dentro de um formulário
**PrimeFaces** (`formMenuSiatWebId`). Nenhum item tem `id` próprio nem nome
acessível próprio: todos são `a[href="javascript:void(0)"]` que submetem o
formulário JSF por `onclick`, cada um carregando um identificador de componente:

| Item do menu                      | Parâmetro JSF no `onclick` |
| --------------------------------- | -------------------------- |
| Consultar/Exportar NF-e           | `RL_NFEU001`               |
| Consultar/Exportar NF-e Detalhada | `RL_NFEU002`               |
| Visão Integral_DESATIVADO         | `RL_IPVU020`               |

#### Estrutura medida

| Nível                     | Elemento                                                  | Itens |
| ------------------------- | --------------------------------------------------------- | ----- |
| raiz                      | `ul#formMenuSiatWebId:menuSiatWebId_menu`                 | 2     |
| "Autoatendimento"         | `li` com a classe de pai, contendo `a` + `ul` filho       | —     |
| "NF-e"                    | `li` com a classe de pai, dentro de uma `ul` com 15 itens | —     |
| "Consultar/Exportar NF-e" | `li` folha, dentro de uma `ul` com 2 itens                | —     |

A `ul` de 2 itens que contém a folha abriga **"Consultar/Exportar NF-e
Detalhada"** ao lado de **"Consultar/Exportar NF-e"** — são irmãos, o que é
exatamente a colisão que um localizador por substring não resolve.

O rótulo de cada item vive em `<span class="wijmo-wijmenu-text"><span
class="wijmo-wijmenu-text">…</span></span>`; os itens de grupo acrescentam uma
`span` de seta (`ui-icon-triangle-1-e`).

#### Como os grupos abrem

Medido por grupo, com hover tentado antes de click:

| Grupo             | Abre com  |
| ----------------- | --------- |
| "Autoatendimento" | **hover** |
| "NF-e"            | **hover** |

As `ul` filhas começam com `display: none` e só são renderizadas no hover do pai.

#### Como o item é endereçado

A decisão de localizador foi tomada por medição, comparando candidatos na tela
real:

| Candidato                                                         | Resolve | Visível             |
| ----------------------------------------------------------------- | ------- | ------------------- |
| `getByRole('menuitem', { name: 'Autoatendimento', exact: true })` | 1       | sim                 |
| `getByText('Autoatendimento', { exact: true })`                   | 1       | sim                 |
| `getByText('NF-e', { exact: true })`                              | 1       | não (grupo fechado) |
| `getByText('Consultar/Exportar NF-e', { exact: true })`           | 1       | não (grupo fechado) |
| `getByText('Consultar/Exportar NF-e')` (substring)                | **2**   | não                 |
| `a:text-is("NF-e")`                                               | **0**   | —                   |
| `a:text-is("Consultar/Exportar NF-e")`                            | **0**   | —                   |
| `a[onclick*="RL_NFEU001"]`                                        | 1       | não                 |

Duas conclusões opostas e ambas medidas:

- **O casamento exato resolve a colisão.** Sem `exact`, "Consultar/Exportar NF-e"
  casa dois elementos (a folha e a folha "Detalhada"); com `exact`, casa um.
- **`text-is` no `a` não resolve nada** (0 elementos), porque o `a` do item
  contém a seta de submenu e o wrapper duplicado de `wijmo-wijmenu-text`.

**O localizador é semântico** — `getByText(<rótulo>, { exact: true })`, o mesmo
texto que a pessoa lê na tela. Nenhum seletor de markup é necessário para
endereçar os itens, e portanto nenhuma justificativa de fragilidade precisa ser
carregada junto de um seletor.

Ressalva honesta: `exact` **não garante unicidade em todo o menu**. O mesmo
critério sobre "Consultar Utilização de Crédito" resolveu **3** elementos. A
unicidade foi verificada item a item para os dois alvos deste fluxo, e é por isso
que o localizador pode ser revalidado com um teste quando o menu mudar.

### 2. Abertura da tela

| Pergunta                | Resposta medida                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| Abre outra aba?         | **Não.** Nenhum evento `page`; a navegação ocorre na mesma aba     |
| Qual a URL antes?       | `/siatweb/faces/index.xhtml?faces-redirect=true`                   |
| Qual a URL depois?      | `/siatweb/faces/index.xhtml` (o `?faces-redirect=true` desaparece) |
| Houve navegação de URL? | Sim, mas a **rota é a mesma**: é um postback JSF que troca a view  |

**Consequência para o laço:** como a rota não muda, o histórico do navegador não
guarda uma entrada distinta para a tela de exportação. Um `goBack` não é um
caminho confiável para voltar ao menu, o que confirma a decisão da spec de
**re-navegar pelo menu a cada inscrição**, em vez de voltar.

**Consequência para a medição:** como é um postback, os controles da tela **não
existem no instante do clique** — eles aparecem logo depois. Uma leitura de DOM
tirada naquele momento encontra uma tela vazia, e conclui, com razão aparente,
que a tela não renderizou o que devia. Foi exatamente o que aconteceu na
primeira verificação real do ticket 02: duas execuções acusaram controles
ausentes numa página que o snapshot mostrava completa. **Nesta tela, nada se
conclui de uma leitura tirada no momento do postback** — vale tanto para a
chegada quanto para a releitura depois de agendar.

### 3. O aviso inicial

Medido na chegada, antes de dispensá-lo:

| Candidato                                               | Resolve |
| ------------------------------------------------------- | ------- |
| `getByRole('button', { name: 'Entendi', exact: true })` | **1**   |
| `getByText('Entendi', { exact: true })`                 | 1       |
| "Entendido" / "OK" / "Fechar"                           | 0 cada  |

Existe **um único** controle com o nome acessível "Entendi", e ele é um `button`:
o localizador semântico `getByRole('button', { name: 'Entendi' })` basta, sem
markup.

**A dispensa é confirmada pela ausência do controle, e não por pausa** — com um
detalhe que só aparece medindo: o botão **continua no DOM** depois que o diálogo
fecha. O que muda é que o diálogo fica oculto, e `getByRole` só enxerga o que está
na árvore de acessibilidade, então o localizador passa a resolver zero elementos.
Portanto a asserção correta é `toBeHidden()`, e `toBeAttached()` nunca passaria.

O aviso é um diálogo PrimeFaces **"Comunicado Importante"**, com um _overlay_
visível por baixo. Ele registra que os arquivos ficam disponíveis por 60 dias a
partir da data de processamento — o que importa para a fase de download, mais
adiante, e que a spec não mencionava.

#### O aviso não é só da chegada: ele volta a cada visita

Isto foi medido depois, na primeira execução do ciclo completo, e o nome da seção
acima era enganoso por omissão.

**Medido: o aviso é servido em toda visita à tela**, inclusive na que um
`reload()` da própria tela faz, e não só na primeira abertura. Consequência
medida: com o aviso aberto, **o menu não pode ser usado** — a revisitagem por
`reload()` seguida da caminhada do menu **não passa do primeiro grupo** e a
revisita inteira falha ali.

Ou seja: dispensar o aviso **depois** da caminhada do menu não basta. Num ciclo que
revisita a tela entre as inscrições, a dispensa tem de vir **antes** da caminhada,
e a chamada é idempotente — com o aviso ausente, `isVisible()` é falso e não há o
que clicar, o que a torna segura também na primeira visita, em que a travessia
deixou o menu na tela e não há aviso nenhum.

### 4. O que a tela mostra na chegada — e por que a spec estava errada

**A tela não abre no formulário de exportação.** Ela abre no formulário de
**consulta por chave da NF-e**, e os campos de inscrição e de data só existem
**depois** que o papel do contribuinte é escolhido. Isso não é detalhe: sem essa
etapa, os campos que o fluxo precisa simplesmente não existem na página.

Medido na chegada:

| Elemento                  | Valor medido                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Grupo "Tipos de Consulta" | 3 rádios: "Pesquisar SOMENTE pela Chave da NFE", "Contribuinte como Emitente", "Contribuinte como Destinatário" |
| Grupo "Dados da Consulta" | contém o campo da chave e o botão `Exportar`                                                                    |
| Campo de texto            | `Chave NFE (DANFE):`                                                                                            |
| Botão da consulta         | **`Exportar`**                                                                                                  |
| Ações da tabela           | `Info`, `Download`, `Excluir` por linha já agendada                                                             |
| Marcadores de obrigatório | **nenhum**                                                                                                      |

O botão da chegada é **`Exportar`**, e não `Agendar exportação`. São ações
diferentes, em formulários diferentes: `Exportar` pertence ao formulário de
consulta por chave, e **não deve ser acionado** — é a exportação de uma NF-e
avulsa, que nada do fluxo pede. `Agendar exportação` só passa a existir depois
que o papel de destinatário está escolhido. Uma implementação que procure o
botão de agendamento logo na chegada não o encontra, e uma que procure `Exportar`
por engano dispara uma exportação avulsa.

`Exportar` é também o **marcador de chegada** de escolha: é o elemento que
desaparece quando o papel é escolhido, então a presença dele prova o estado de
chegada e não o formulário de exportação.

O campo da chave tem rótulo visível mas **não** tem `<label for>`, então
`getByLabel` não o resolve. O que o envolve é o grupo de papel `"Dados da
Consulta"`, e é por ele que o campo é endereçado.

Escolhido **"Contribuinte como Destinatário"**, o conjunto de rótulos visíveis
muda para:

```
Pesquisar SOMENTE pela Chave da NFE | Contribuinte como Emitente | Contribuinte como Destinatário
Todas | Entrada | Saída
Ativas | Canceladas | Inutilizadas | Denegadas | Todas
```

Ou seja: aparecem **dois grupos de rádio que a spec nunca mencionou** —
**"Tipo de nota"** (Todas / Entrada / Saída) e **"Status da Nota"** (Ativas /
Canceladas / Inutilizadas / Denegadas / Todas) — e é o segundo que decide quais
notas o arquivo exportado traz.

**Medido:** a tela chega marcada com **Tipo = Todas** e **Status = Ativas** — os
próprios padrões dela, e não uma escolha da automação. Cada opção tem um valor que o
portal posta, e os dois grupos vivem em tabelas com `id` escrito à mão
(`tipoDeNota` e `statusNota`), ao contrário do `j_idt…`:

| Grupo             | Opção marcada na chegada | Opções, com o valor postado                                                    |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `Tipo de nota:`   | **Todas** (`0`)          | Todas `0` · Entrada `1` · Saída `2`                                            |
| `Status da Nota:` | Ativas (`1`)             | Ativas `1` · Canceladas `0` · Inutilizadas `3` · Denegadas `4` · **Todas `2`** |

**Marcar um desses rádios não dispara nada** — medido no formulário que o portal
devolveu: nenhum dos dois grupos tem `onchange`, `onclick`, `f:ajax` nem
`javax.faces.behavior.event`, ao contrário do `select` de inscrição, que posta em
`valueChange` e re-renderiza o formulário inteiro
([seção 8](#8-a-seleção-da-inscrição-re-renderiza-o-formulário-inteiro)).
Consequências: a marcação é ação de cliente, não há resposta para esperar, e ela não
pode esvaziar o período.

**Autorizado por quem conduz a automação:** no campo **Status da Nota** o fluxo deve
marcar **Todas** — e o **Tipo de nota** também, pelas duas razões de uma vez: é o que
foi pedido, e é a mesma latitude que a herança do padrão traria de surpresa. O
conteúdo do arquivo exportado **passa a ser mais largo**: além das notas ativas,
passam a entrar canceladas, inutilizadas e denegadas. Medido no fio: as cinco
requisições de agendamento inspecionáveis saíram com `tipoDeNota=0` e `statusNota=1`
— as escolhas herdadas dos padrões, porque até aqui o fluxo só conferia. A
implementação passa a **dizer** as duas escolhas e a conferi-las contra o pedido que
saiu, no mesmo trecho que já confere o período.

### 5. O formulário de destinatário

O formulário é montado como **linhas**, em que o rótulo que a pessoa lê fica em
uma célula e o controle na seguinte:

| Rótulo visível            | Controla                   | `id` do servidor                          |
| ------------------------- | -------------------------- | ----------------------------------------- |
| `Inscrição:`              | `select` com **82 opções** | `j_idt39` (contador gerado, **instável**) |
| `Razão Social:`           | `input` somente-leitura    | `j_idt54` (contador gerado)               |
| `Tipo de nota:`           | rádios (3 opções)          | `tipoDeNota` (escrito à mão, **estável**) |
| `Status da Nota:`         | rádios (5 opções)          | `statusNota` (escrito à mão, **estável**) |
| `Número da Nota`          | `input` opcional           | `numeroNota`                              |
| `Data de Emissão Inicial` | `input` com datepicker     | `dataInicial_input`                       |
| `Data de Emissão Final`   | `input` com datepicker     | `dataFinal_input`                         |
| —                         | botão                      | `Agendar exportação`                      |

#### Como os campos são endereçados

**Nenhum** dos campos de texto do formulário tem `label[for]`, `aria-label` nem
`placeholder` — medido. Só os rótulos dos **rádios** são `<label for>`. Portanto
`getByLabel` não funciona para as datas nem para a inscrição, e a única
nomenclatura que sobrevive é o texto do rótulo mais a relação com a linha.

Há uma armadilha medida aqui: **os campos não estão todos sob o mesmo
contêiner.** A inscrição fica numa tabela interna **sem `id`** dentro de
`span#altExterno`, enquanto Razão Social, Número da Nota e as datas ficam em
`table#formularioPanel` dentro de `span#panel-dados`. Um localizador que assumisse
um contêiner único cobriria metade do formulário e, pior, **pularia a inscrição em
silêncio** — que foi exatamente o defeito encontrado na primeira tentativa de
escrever o fluxo.

A relação usada é a mais simples que é comum às duas:

```
tr  filtrado por  getByText(<rótulo>, { exact: true })   →   select | input
```

com a **unicidade do rótulo verificada no uso**. Isso não é redundância: o mesmo
critério que resolve a folha do menu resolve aqui a folha e a folha "Detalhada",
e `exact` sozinho não garante unicidade.

Os textos de rótulo são usados **com a pontuação que a tela mostra**, porque
`exact` é o que impede "Data de Emissão Inicial" de casar também com os campos
homônimos do diálogo de Info (que fica oculto, mas no DOM, e escreve os rótulos
com dois-pontos).

#### A inscrição é apresentada sem pontuação

O diálogo de seleção de contribuidor mostra a inscrição **pontuada**
(`nn.nnn.nnn-n`). O `select` de inscrição mostra **dígitos puros**. Duas estratégias
de casamento foram medidas e **ambas estão erradas**:

| Estratégia                              | Resultado medido                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| comparar só os dígitos da linha inteira | ambíguo: a linha também traz um CNPJ, e o casamento pode ser satisfeito pelo CNPJ, escolhendo a empresa errada |
| extrair tokens com `\d+`                | **nunca casa**: a pontuação parte o número em quatro pedaços                                                   |

O casamento correto é sobre o valor **como a tela o mostra no `select`**, feito em
código para que a inscrição não entre no _call log_ de nenhuma falha.

#### A seleção **não** tem consequência visível

Esperado antes de medir: escolher a inscrição preencheria o campo somente-leitura
**"Razão Social:"**, o que daria um sinal observável de que a seleção pegou.

**Medido: não preenche.** Escolher a inscrição não escreve nada em "Razão Social:".
Portanto **não existe** sinal observável além do valor do próprio `select` — e
esse valor já vem preenchido com um _default_ quando a tela abre, o que é
justamente o pior tipo de prova: ele é satisfeito por uma seleção que não
aconteceu. Ver [7](#7-o-clique-autorizado-e-o-que-ele-produziu): o agendamento
confirmou que a tela leu o valor do `select` no momento do envio, sem precisar de
nenhum evento de mudança.

> **Correção, 2026-10-01.** A conclusão acima está certa apenas até a metade, e a
> metade errada levou o fluxo pelo caminho errado: medir que "Razão Social" não
> preenche é medir que **não há sinal no formulário**, não que a seleção seja
> inerte. A seleção **tem** consequência, e ela é medida em
> [8](#8-a-seleção-da-inscrição-re-renderiza-o-formulário-inteiro): dispara um postback que substitui o
> painel inteiro. É por isso que as datas precisam ser relidas com tolerância.

#### As datas não têm contraparte oculta

Medido: **não existe** campo oculto para `dataInicial`/`dataFinal` — nenhum
`name` correspondente no DOM. O que foi digitado é o que é submetido, o que
simplifica o preenchimento: não há estado de widget para sincronizar. Ainda assim
o valor é relido antes do clique, porque uma máscara que reescrevesse o que foi
digitado precisa aparecer **antes** de submeter, e não depois.

### 6. A tabela de exportações agendadas

| Coluna             | Observação medida                                                  |
| ------------------ | ------------------------------------------------------------------ |
| ID                 | identificador numérico da exportação                               |
| Situação           | valores vistos: `Aguardando`, `Processado`                         |
| Data de criação    | `dd/mm/aaaa hh:mm:ss`                                              |
| CNPJ               | o cabeçalho traz um filtro de coluna embutido                      |
| IE                 | idem — a inscrição do contribuinte, **com máscara**: `NNNNNNNNN-D` |
| Data processamento | `dd/mm/aaaa hh:mm:ss`, cerca de 1 min depois                       |
| Ações              | `Info`, `Download`, `Excluir` por linha                            |

**A máscara da coluna IE foi encontrada pelo ciclo, e ela quebra a prova.** A célula
não traz a inscrição como uma sequência corrida de dígitos: ela separa o dígito
verificador com um hífen (`NNNNNNNNN-D`; os dígitos são dado fiscal de uma empresa
real e não são reproduzidos aqui). A contagem de linhas, que comparava a
inscrição com cada sequência de dígitos da célula, contou **zero** linhas para uma
exportação que o ciclo **tinha acabado de agendar** — e a prova acusou um agendamento
que existia, com a linha na tela, `Processado` e com botão de `Download`. A leitura
agora remove a pontuação antes de comparar, e só ela: uma célula com dois números
continua casando por um deles, e uma inscrição não pode ser confundida com outra que
começa com os mesmos dígitos.

Dois pontos que a spec não previa:

- A tabela é **paginada** (`First Prev 1 Next Last`), o que importa para a
  verificação de "uma linha foi acrescentada": a contagem tem que ser da tabela
  certa. Medido, contar `table tbody tr` na página inteira devolve um número que
  **inclui a barra de cabeçalho e a paginação** e portanto mente sobre acréscimo
  de linhas. A contagem correta é a da tabela cujo cabeçalho tem `Situação`.
  O paginador é configurado pelo próprio portal com `rowsPerPage: 15`, e a
  inscrição medida tinha `totalRecords: 3` — ou seja, numa única página, e a
  contagem lida pelo fluxo era a contagem total da inscrição. Ver
  [Pendência](#pendência) para o que passa a valer quando a inscrição passa das 15
  linhas.
- Existe um diálogo **"Confirmar exclusão agendamento"** (Sim/Não) no DOM. Ele
  nunca é clicado, e a automação não deve procurar por "Excluir" em lugar nenhum.
- A tabela **só é atualizada por uma nova visita à tela**: ver
  [7](#a-tabela-só-lista-depois-de-uma-nova-visita). Uma linha recién-criada já
  aparece como `Processado`, o que impede observar o estado inicial — o que uma
  execução real do ciclo **desmentiu**: linhas recém-criadas apareceram como
  `Aguardando` (ver [Pendência](#pendência)).

### 7. O clique autorizado, e o que ele produziu

O clique foi disparado **uma vez**, com período **01/01/2026 a 31/01/2026**, e
só depois de o formulário ser conferido. O estado conferido imediatamente antes do
clique:

| Verificação                                 | Resultado medido               |
| ------------------------------------------- | ------------------------------ |
| Inscrição no `select` é a escolhida         | sim — 9 dígitos, sem pontuação |
| Data de Emissão Inicial relida              | `01/01/2026`                   |
| Data de Emissão Final relida                | `31/01/2026`                   |
| Campos editáveis preenchidos além das datas | **nenhum**                     |
| "Tipo de nota" marcada                      | `Todas`                        |
| "Status da Nota" marcada                    | `Ativas`                       |
| Botão desabilitado                          | não — foi clicado sem forçar   |

Essa tabela é a leitura da execução desta investigação, em que o fluxo **só
conferia** os dois grupos. A implementação passa a marcar `Todas` nos dois
([seção 4](#4-o-que-a-tela-mostra-na-chegada--e-por-que-a-spec-estava-errada)) e a
conferir o valor no pedido que saiu, de modo que a linha de Status da Nota acima
descreve o estado **daquela** execução e não o do fluxo implementado.

Resultado, medido **na própria página, logo depois** do clique:

| O que se procurava          | O que aconteceu na hora                             |
| --------------------------- | --------------------------------------------------- |
| Uma linha nova na tabela    | **não**: a tabela continuou com 1 linha, a de 22/09 |
| Uma mensagem de confirmação | **nenhuma**: o componente de mensagens está vazio   |
| Um diálogo de confirmação   | **nenhum** overlay visível                          |
| Um download disparado       | **nenhum**                                          |
| O formulário limpo          | **não**: as datas continuam preenchidas             |

Desse quadro nasceu a conclusão errada de que **o clique não produziu efeito
observável nenhum**, e de que a submissão tinha sido recusada em silêncio. Ela
estava errada porque **a tabela não é atualizada pela página que agenda**.

#### A tabela só lista depois de uma nova visita

A informação é do usuário do sistema, e a medição confirma: **para o item aparecer,
a página precisa ser reatualizada ou acessada de novo.** O `Agendar exportação`
responde sem recarregar, e a nova linha só entra na listagem na próxima carga da
tela.

Uma visita somente-leitura à mesma tela, sem nenhum clique, mostra o resultado:

| Medido na visita seguinte         | Valor                                       |
| --------------------------------- | ------------------------------------------- |
| Linhas na tabela                  | **2** — eram 1 antes do clique              |
| Linha mais recente                | criada em **29/09/2026 13:55:03**           |
| Horário do clique                 | **29/09/2026, 13:55** (execução `r14`)      |
| Situação                          | `Processado`                                |
| Data de processamento             | 29/09/2026 13:56:01 — **um minuto** depois  |
| A linha é da inscrição escolhida? | **sim** — comparação feita dentro da página |

Portanto **o clique funcionou**: a exportação foi criada, processada em cerca de um
minuto, e é da inscrição que o formulário tinha selecionada. As duas hipóteses que
a versão anterior levantava — a seleção nunca ter sido processada, ou a submissão
ter sido recusada — estão **descartadas**: a exportação existe.

O que resta, e é a restrição mais importante do fluxo, é que **a tela não confirma
nada**: nem mensagem, nem diálogo, nem alteração visível na página que age. A única
prova de sucesso é a linha, e ela só existe depois de uma nova visita. Um fluxo que
checar o resultado na mesma página vai concluir, com correção, que nada foi
agendado.

#### O post-requisito correto

Agendar só pode ser confirmado assim:

1. clicar em "Agendar exportação";
2. **recarregar a tela e refazer o caminho do menu** (o postback é da mesma rota,
   então não há histórico a usar, e `goBack` não resolve);
3. descartar o aviso, escolher o papel de destinatário de novo;
4. ler a tabela de exportações agendadas e procurar a linha da inscrição.

O post-requisito é a **presença da linha**, não o valor da `Situação`: em menos de
um minuto a exportação passou a `Processado`, então uma linha recém-criada já não é
observada no estado inicial. Ver [6](#6-a-tabela-de-exportações-agendadas) para a
forma de endereçar a tabela.

#### O formulário volta ao estado inicial na visita seguinte

Medido na mesma visita somente-leitura:

| Campo                     | Na chegada       |
| ------------------------- | ---------------- |
| `Data de Emissão Inicial` | vazia            |
| `Data de Emissão Final`   | vazia            |
| `Inscrição:`              | opção 0, a mesma |
| Opções de inscrição       | 82               |

Ou seja: cada passagem do laço por inscrições começa com o formulário limpo, e o
fluxo **não precisa** apagar o que foi digitado na passagem anterior — mas também
**não pode** reaproveitar o que ficou. Preencher tudo a cada iteração é o
comportamento correto.

#### Um erro de medição encontrado e corrigido

A primeira versão da espera por "a linha da exportação" procurava a inscrição em
`table tbody tr` da página inteira, e reportou `situacao: "UNKNOWN"` — um sucesso
falso. A linha que casou foi **a própria linha do formulário**, cujo `select`
carrega a inscrição escolhida. A espera agora é restrita à tabela cujo cabeçalho
tem `Situação`, que é a tabela de exportações agendadas.

Vale registrar porque o defeito era silencioso: ele produzia um artefato que
parecia confirmar o agendamento. Sem a contagem de linhas antes e depois, e sem a
captura do texto da tabela, a fase C teria sido dada como bem-sucedida — e teria
sido bem-sucedida **por acidente**, num sistema onde a falha real é silenciosa.

#### Efeito em produção

**Uma exportação foi agendada** — a autorizada, para o período 01/01/2026 a
31/01/2026, para a inscrição escolhida pela sondagem — e ela já está `Processado`.
Nada foi baixado. A autorização de um clique foi consumida por ela, e a medição
depois disso foi feita sem tocar em nada: as visitas de verificação são somente
leitura.

### 8. A seleção da inscrição re-renderiza o formulário inteiro

A seção [5](#5-o-formulário-de-destinatário)afirmava que a seleção não tem
consequência observável. Ela tem, e a consequência é um pós-retorno.

**Medido, pela rede, na seleção da inscrição:**

| O que                                                      | Medido                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| Requisição disparada pelo `onchange` da inscrição          | `PrimeFaces.ajax.AjaxRequest`                               |
| Rota dessa requisição                                      | a da própria tela de exportação (`ExportarNFE.xhtml`)       |
| Efeito da resposta                                         | re-renderiza o painel inteiro do formulário de destinatário |
| Campos `dataInicial_input` / `dataFinal_input` na resposta | **vazios**                                                  |

**Os dois pós-retornos da tela são distinguíveis pela rota**, e essa é a forma de
saber qual deles uma requisição é: o do **papel de destinatário** vai para a rota da
tela inicial do sistema (`index.xhtml`), e o da **inscrição** vai para a rota da tela
de exportação (`ExportarNFE.xhtml`). São os dois `AjaxRequest` do PrimeFaces, com o
mesmo formato, e só a rota os separa.

#### A ordem dos eventos, e por que o período sumia

Ordem medida no trace da primeira execução real do agendamento:

| Momento        | Evento                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| `11:06:05.384` | POST da seleção da inscrição (52 ms de resposta)                             |
| `11:06:05.404` | o fluxo escreve as duas datas — **dentro do painel que vai ser substituído** |
| `11:06:05.436` | a resposta chega e re-renderiza o painel, com os campos vazios               |

A leitura seguinte encontra **`"|"`** — os dois campos vazios — e a conferência do
período, que esperava o valor escrito, só falharia depois de esgotar a espera
inteira. É a razão de a primeira versão do ciclo não conseguir agendar uma única
inscrição: ela preenchia o formulário que o pós-retorno ia substituir.

#### A tolerância, e por que ela distingue dois casos

Escrever o período de novo quando a leitura vem vazia é o comportamento correto, e
a espera de confirmação continua sendo a mesma — a tolerância **não acrescenta um
segundo prazo**. O que precisa ser distinguido são **duas** leituras erradas, que
antes eram indistinguíveis:

| Leitura                   | O que é                                                                                   | O que o fluxo faz                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **vazia** (`"\|"`)        | o painel foi servido de novo pelo pós-retorno da seleção                                  | escreve o período de novo, **uma vez**, e continua esperando                                                |
| **outro valor não vazio** | o campo reescreveu o que recebeu do próprio _parser_ do _datepicker_, ou o portal recusou | **falha imediata**, sem esperar: um período diferente do configurado é uma exportação que ninguém autorizou |

O segundo caso é o que a asserção web-first já existia para pegar, e por isso ela não
pode ser diluída em retentativa: esperar não muda a resposta, só adia o relatório.

**Medido na primeira execução do ciclo completo:** a tolerância foi exercida nas
**quatro** inscrições — quatro cliques em "Agendar exportação" e doze escritas nos
campos de data, três por inscrição (duas iniciais e uma de reposição).

#### O período que saía vazio, medido em sete execuções

A janela não é dedução: ela produziu requisições reais sem período. O que a segue é a
comparação do corpo das requisições que o botão dispara, pelo campo
`dataInicial_input` de cada POST de agendamento:

| Execução do ciclo           | Cliques em "Agendar exportação" | Requisições com o período | Requisições com o período **vazio** |
| --------------------------- | ------------------------------- | ------------------------- | ----------------------------------- |
| 2ª                          | 4                               | 2                         | **2**                               |
| 3ª                          | 1                               | 1                         | 0                                   |
| 4ª (com o desfecho nomeado) | 2                               | 1                         | **1**                               |
| **5ª, já com a correção**   | 4                               | **4**                     | **0**                               |
| **6ª, já com a correção**   | 4                               | **4**                     | **0**                               |
| 7ª                          | 1                               | 1                         | 0                                   |
| 8ª                          | 4                               | **4**                     | **0**                               |

Ou seja: **treze agendamentos depois da correção, treze com o período** — quatro na
5ª, quatro na 6ª, um na 7ª e quatro na 8ª, e nenhum período vazio.

E a ordem dos eventos por inscrição na 2ª execução, em milissegundos monotônicos do
trace — a mesma escala para as ações do fluxo e para as requisições da rede:

| Inscrição | Seleção | POST do pós-retorno | Escritas        | 1ª leitura | Reposição | Clique | `dataInicial_input` no POST |
| --------- | ------- | ------------------- | --------------- | ---------- | --------- | ------ | --------------------------- |
| 1ª        | 26734   | 26745               | 26768 / 26791   | 26829      | **sim**   | 26982  | `01/01/2026`                |
| 2ª        | 195813  | 195824              | 195839 / 195857 | 195875     | **não**   | 195891 | **`''`**                    |
| 3ª        | 204152  | 204162              | 204176 / 204195 | 204219     | **não**   | 204226 | **`''`**                    |
| 4ª        | 210460  | 210471              | 210485 / 210506 | 210532     | **sim**   | 210697 | `01/01/2026`                |

A regra que a tabela revela: quando o re-render chegava **antes** da primeira leitura,
a leitura vinha vazia, a reposição escrevia o período de novo e o clique saía com ele.
Quando chegava **depois** da leitura e **antes** do clique, a conferência passava com o
valor escrito — e a janela de **7 ms a 16 ms** entre a leitura e o clique era
exatamente por onde o re-render entrava, esvaziando os campos entre as duas ações.

**Efeito em produção:** duas requisições de exportação registradas sem período algum,
uma delas na 4ª execução do ciclo — a primeira inscrição daquela execução.

#### O que fecha a janela

Duas mudanças, e a segunda é o que impede a primeira de voltar a falhar em silêncio:

1. **A seleção da inscrição espera o pós-retorno que ela dispara**, e a espera é pelo
   **corpo** da resposta, não pelos cabeçalhos: quem substitui o formulário é a
   resposta sendo lida e aplicada, e o período é escrito depois disso. A janela
   restante — entre a conferência e o clique — passa a não ter nenhum re-render
   pendente atrás dela.
2. **O clique é conferido no fio.** O período que a requisição realmente carregou é lido
   do corpo do POST e comparado com o período configurado; a divergência vira o erro
   nomeado `ExportRequestWithoutPeriodError`. Isso não desfaz a requisição — a
   exportação já está registrada no sistema de destino, e a linha precisa ser descartada
   lá —, mas impede que uma exportação sem período seja um resultado silencioso.

Como os dois POSTs da tela são indistinguíveis pela rota, a distinção usa o que a
medição encontrou em cada um deles:

| Requisição                               | Marca medida no corpo                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| pós-retorno da seleção da inscrição      | `javax.faces.behavior.event=valueChange`, e re-renderiza só `consultaNFeForm`  |
| requisição do botão "Agendar exportação" | nenhum `behavior.event`, e re-renderiza `… consultaNFeForm lista-agendamentos` |

A tolerância da conferência permanece — ela cobre a reescrita do próprio _datepicker_ —
mas deixa de ser a única coisa entre a escrita do período e o clique.

**O ritmo, medido depois da correção** (6ª execução, milissegundos monotônicos do
trace), porque "rápido demais" era a outra hipótese para o período ausente:

| Medida                                              | Antes            | Depois              |
| --------------------------------------------------- | ---------------- | ------------------- |
| Intervalo entre o pós-retorno da seleção e o clique | **7 ms a 16 ms** | **164 ms a 227 ms** |
| Intervalo entre um agendamento e o seguinte         | 6 s a 7 s        | **5,6 s a 6,3 s**   |

Ou seja: o intervalo entre um pedido e o seguinte **não** mudou, e os quatro pedidos
foram aceitos — o que refuta a hipótese de que o ritmo entre agenciamentos fosse a
causa. O que mudou foi a espera entre a seleção e o clique, que deixou de ser uma
corrida e passou a incluir o pós-retorno inteiro.

### 9. O portal pode responder com a própria tela de erro

Medido em **quatro execuções do ciclo completo**, e em pontos diferentes do ciclo — o
que torna a falha **intermitente**, e não uma etapa que sempre quebra:

| Execução | Momento em que a tela de erro apareceu | `exceptionNumber` |
| -------- | -------------------------------------- | ----------------- |
| 2ª       | depois da **quarta** agendação         | 869               |
| 3ª       | depois da **primeira** agendação       | 110               |
| 4ª       | na **segunda** visita de item          | —                 |
| 7ª       | na **segunda** visita de item          | —                 |

Na 4ª execução o desfecho foi o **nome** da falha, e a execução terminou em **44,5 s**:
a tela de erro foi reconhecida **2 s** depois do `reload`, sem esperar o menu, e o
relatório mostrou `PortalInternalErrorScreenError` — contra os mais de 8 minutos que a
3ª execução consumiu esperando por um menu que nunca apareceria. A tabela de
intermitência ganhou um terceiro ponto porque ele é o que confirma a leitura: a tela
pode aparecer no primeiro item, no último ou no meio. A 7ª execução repetiu o ponto
da 4ª (segunda visita) e morreu em **36,1 s**, já depois de um agendamento aceito.

E há execuções em que a tela **não** aparece: a 5ª, a 6ª e a 8ª enviaram os quatro
agendamentos cada, e nenhuma delas encontrou `erro.xhtml` em nenhuma visita. A recusa,
portanto, não é uma por execução — pode ser uma por item, e pode não vir de forma
nenhuma.

Em todas, o `reload()` da visita seguinte voltou na tela de erro do próprio portal,
`views/comum/erro.xhtml`:

| O que foi medido           | Medido                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rota da resposta           | `siatweb/faces/views/comum/erro.xhtml`                                                                                                           |
| Mensagem mostrada à pessoa | "Ocorreu um erro interno e sua operação foi cancelada. Reinicie a operação e tente novamente."                                                   |
| Causa declarada            | `java.sql.SQLSyntaxErrorException: ORA-01924` — atribuição `RL_NFEU001` "não foi concedida ou não existe"                                        |
| Onde o erro foi levantado  | `javax.faces.event.MethodExpressionActionListener.processAction` — isto é, no processamento de uma **ação**, e não na renderização de uma página |

Ou seja: a falha está **no lado do portal** — uma sequência de banco que não existe
ou não está concedida ao usuário da aplicação — e ela é levantada no processamento
de uma ação, ou seja, quando o portal trata o pedido e não quando desenha a tela.
Nem o momento em que aparece nem o número da exceção variam de forma que ajude a
prever: o portal responde ao pedido com a tela de erro ora na primeira agendação,
ora na última.

#### A recusa tem um sinal — e o fluxo não o lê

Em duas execuções, **um** item de quatro teve a requisição de agendamento aceita e
**não** virou linha, e nenhuma delas falhou na tela seguinte:

| Execução | Item       | Requisição | Resposta | Linha criada     | Tela de erro na visita seguinte |
| -------- | ---------- | ---------- | -------- | ---------------- | ------------------------------- |
| 5ª       | 2º         | 10:42:56   | 200      | **nenhuma**      | **não**                         |
| 5ª       | 1º, 3º, 4º | —          | 200      | +1 s, +1 s, +0 s | não                             |
| 8ª       | 1º         | 11:14:05   | 200      | **nenhuma**      | **não**                         |
| 8ª       | 2º, 3º, 4º | —          | 200      | +0 s cada        | não                             |

O pedido saiu com o período configurado (conferido no fio, pela correção da
[seção 8](#8-a-seleção-da-inscrição-re-renderiza-o-formulário-inteiro)), o portal
respondeu **200**, a visita seguinte recarregou uma tela saudável — e a tabela não
tinha a linha.

**O portal não recusa em silêncio: ele responde, e é a resposta do próprio clique que
fala.** Medido no único trace que sobreviveu às execuções — a rodada da suíte
completa de 1º de outubro, interrompida por um desligamento da máquina —, uma das
cinco requisições de agendamento trouxe na **própria resposta**:

> Já existe um agendamento com os parâmetros passados. Tente com novos ou busque o
> ID: 9341318

o texto em `span.ui-messages-error-summary`, dentro de
`div#messages > div.ui-messages-error > ul > li`, na página `ExportarNFE.xhtml`, e
seguido do **identificador da linha que já existia** (o número não é reproduzido
aqui: é o identificador de um agendamento real). Ou seja: a recusa por repetição é
comunicada no momento em que acontece, na resposta que o fluxo **já espera** por
outro motivo — a que confere o período.

O que o fluxo **não** faz é lê-la: ele recarrega para o item seguinte e a resposta
vai embora com a visita. Daí a forma como a falha se apresenta:

| Forma                | O que o portal mostra                           | Quem a pega                                 |
| -------------------- | ----------------------------------------------- | ------------------------------------------- |
| tela de erro         | rota `erro.xhtml` na visita seguinte            | `PortalInternalErrorScreenError`, na visita |
| recusa por repetição | mensagem de erro na resposta do clique recusado | **ninguém**, por enquanto                   |
| por inferência       | a linha da tabela não cresce                    | a variação da contagem, na visita final     |

**Proposto e não decidido:** nomear essa recusa na hora, com um erro tipado por item,
lendo a área de mensagens da resposta que o clique já espera — sem requisição a mais e
sem espera a mais. Enquanto isso não for decidido, a prova das linhas continua sendo a
única que alcança a recusa por repetição, e ela só existe ao fim do ciclo: uma recusa
assim é descoberta tarde e nomeada pelo item. Isso é irreduzível sem uma segunda
leitura da tabela depois de cada agendamento, o que significaria uma segunda visita à
tela por item, e a visita é o custo mais caro do ciclo.

Na 8ª execução a prova funcionou como projetada e nomeou o item certo: _"The scheduled
exports table has 1 rows for the inscription at position 1 … and 2 were required"_ —
a contagem lida antes do clique era 1, e a contagem lida depois do ciclo ainda era 1.
Ou seja, a falha **não** é um item qualquer nem um tempo esgotado: é a inscrição
cuja linha não cresceu, e a mensagem diz isso.

**A recusa é o agendamento repetido, e isso é regra do portal.** Quem conduz a
automação confirmou a regra que o portal aplica: **não se pode agendar de novo a
exportação de uma inscrição para um mesmo período que já esteja agendado.** As duas
recusas por repetição batem com ela — em ambas o item recusado era o único que já
tinha linha
para o mesmo período (a 2ª inscrição, com a linha da 4ª execução; a 1ª, com a linha da
7ª). E a recusa é exatamente o comportamento correto: não há por que exportar duas
vezes o mesmo período.

Uma medição não se explica por essa regra, e fica registrada como está: a 1ª inscrição
**se registrou duas vezes** para o mesmo período — 10:42:51 na 5ª execução e 11:10:33
na 7ª — e a leitura da 5ª mostrava duas linhas dela ao mesmo tempo (a de 22/09 e a de
10:42:51). A conciliação possível é a remoção de linhas de que fala o parágrafo
seguinte: se a linha de 10:42:51 já não existia às 11:10, o agendamento da 7ª execução
estava liberado. **Não medido** é se foi isso — e é a mesma pergunta que a remoção
de linhas levanta, então as duas observações se respondem juntas.

**Consequência para quem roda o ciclo mais de uma vez:** repetir o ciclo com o mesmo
período **não** é um defeito da automação, e a falha que ele produz é a correta. O
relatório diz _"The scheduled exports table has 1 rows for the inscription at position
1 … and 2 were required"_, que é a leitura honesta: o portal não repetiu o
agendamento e a prova viu isso.

**Observação em aberto, e ela afeta a prova:** entre a visita final da 5ª execução
(11:01) e a da 8ª (11:14) a tabela **perdeu linhas** — as de 22/09, 10:23:25, 10:42:51,
10:43:03 e 10:43:08 desapareceram, e sobraram quatro. O portal remove agendamentos
antigos por um critério que não é observável daqui (data, situação ou retenção). A
prova compara a contagem antes do clique com a contagem ao fim do ciclo, então uma
**remoção** não a faz passar por engano — ela a faz reprovar por engano, se a linha
nova for removida antes da leitura final. Ver [Pendência](#pendência).

#### A tela de erro não é uma tela do fluxo

Conferido no snapshot da página (248 capturas do trace da 3ª execução): a tela de
erro **não tem menu e não tem formulário** — zero nós de menu, zero controles de
exportação. Um fluxo que seguisse em frente relatar um controle inexistente
("esperando `Autoatendimento`") em vez de a um portal que recusou, e gastaria os
60 s do limite esperando por ele.

Pior: logo depois de mostrar o erro, o portal redireciona para `index.xhtml` e essa
carga levou **488 s** na 3ª execução — as ações do fluxo ficaram sem ação possível
esse tempo todo (o `hover` do menu só voltou a ser possível ao fim da carga), e a
visita queimou mais de 8 minutos antes de falhar. Um tempo de espera calibrado para
uma tela saudável não é o tempo de espera de uma tela de erro.

**Como o ciclo trata:** a visita reconhece a rota logo depois do `reload` e falha com
erro nomeado (`PortalInternalErrorScreenError`), **sem retentativa** — a falha é do
portal, e retentativa aqui seria um segundo pedido para a mesma empresa. O ciclo
continua a lista inteira, e cada item que esbarra nisso aparece no relatório pelo
seu nome, em vez de um controle que nunca apareceu.

#### O que a tela de erro deixa sem resposta

A tela de erro diz que a operação foi cancelada, mas **não diz se o pedido de
exportação foi registrado**: quem responde a isso é a variação da contagem de linhas
da visita final — a prova que o ciclo já faz.

E essa prova fica **fora de alcance** justamente quando o portal recusa: a visita
final também começa com um `reload`, e é nele que a tela de erro aparece. Ou seja,
um ciclo que esbarra com o `ORA-01924` termina sem conseguir dizer se o agendamento
entrou. Isso é uma lacuna conhecida do desenho, não um defeito da implementação, e
ela não tem correção barata: sair da tela de erro exige clicar no "Clique aqui!" da
própria tela, o que é uma nova travessia do sistema legado — e o ciclo é uma
travessia por execução, por decisão registrada na
[ADR 0008](decisoes.md#adr-0008--ciclo-de-agendamento-um-teste-uma-sessão-lista-inteira-série-sem-retentativa).

O que o ciclo garante nesse caso é o **nome** da falha e a lista dos itens que
chegaram a ser agendados antes dela.

#### Uma execução morreu por causa externa, e o trace diz qual

Três execuções terminaram com `Target page, context or browser has been closed` — a
3ª, aos 622 s, a 6ª, aos 97,5 s e a 9ª, aos 456,5 s. O trace das três tem **um** evento
e nenhum outro: `BrowserContext.pageClosed`, **sem** `crash` e sem `BrowserContext.close`
da automação. Essa assinatura é de um fechamento **de fora** do processo de teste — a
janela do navegador headed foi fechada por alguém — e não de uma falha do portal nem
de um defeito da automação; a pessoa que conduziu a execução confirmou o fechamento
manual, nas duas vezes em que a janela estava headed.

Importa porque a 6ª execução tinha **já** enviado os quatro pedidos com o período
(é uma das linhas da tabela da [seção 8](#o-período-que-saía-vazio-medido-em-sete-execuções)),
e morreu na leitura da contagem da visita final. A correção do período está verificada
nessa execução; o que faltou foi só a prova das linhas.

A 9ª execução é a única que mede as escolhas fiscais **no fio**, e é a medida que a
[seção 4](#4-o-que-a-tela-mostra-na-chegada--e-por-que-a-spec-estava-errada) esperava: o
pedido de agendamento saiu com **`statusNota=2`** — `Todas` — onde todas as execuções
anteriores saíam com `statusNota=1`, o `Ativas` herdado do padrão da tela. O item 1
passou inteiro, com as duas marcações e as duas releituras que o passo novo faz. O que a
execução **não** fez foi o resto da lista: ela morreu no 2º item, e a prova das linhas
nunca rodou.

O relatório daquela execução nomeou `page.reload: Target page, context or browser has
been closed` na visita final, e essa mensagem é **consequência**, não causa: a página
continuava viva e servindo requisições até os 58,1 s, e a espera que o fechamento
interrompia já durava 403 s. A espera em si está medida na seção seguinte.

#### Uma espera sem limite declarado, e o que ela custa

O caminho do menu até a tela de exportação declara limite para a **chegada** da tela
(`NF_EXPORT_SCREEN_TIMEOUT_MS`) e **nenhum** para as três ações que a precedem: dois
`hover()` e um `click()`. Nenhuma configuração do projeto define `actionTimeout`, e no
Playwright o padrão de `actionTimeout` é `0` — sem limite. Essas três ações terminam
quando o elemento fica acionável, e o único teto que sobra é o prazo do teste.

Medido duas vezes, e as duas sem uma requisição que explicasse:

| Execução | Onde a espera ficou                                                                        | Tempo dentro dela |
| -------- | ------------------------------------------------------------------------------------------ | ----------------- |
| 3ª       | `hover` do menu, com `index.xhtml` ainda carregando — os 488 s de carga já medidos         | > 8 min           |
| 9ª       | `hover` do menu, na segunda visita de item, com a última requisição da execução aos 58,1 s | 403 s             |

**Por que isso é um defeito da automação e não um comportamento do portal:** a
propriedade que o prazo do teste afirma — _um teste que esgota o tempo esgotou a espera
em que estava, e por isso consegue relatar a tela que respondeu_ — vale para as esperas
com limite declarado e é **falsa** para esta. Na 9ª execução o prazo chegou dentro do
`hover`, e o relatório não nomeou o menu: mostrou o fechamento da janela, que é o que
interrompeu a espera por fora. Quem lê o relatório recebe "o navegador foi fechado" para
uma espera de 403 s que precisava de limite — e a pista que aponta para o defeito some.

**Implementado.** `MENU_WALK_TIMEOUT_MS` = 15 s, declarado junto dos outros em
`e2e/support/timeouts.ts` e aplicado aos três atos do caminho — os dois `hover` e o
`click`. Somado às cadeias que o teste percorre (travessia, extra do agendamento, uma
inscrição, visita de fechamento), para que o prazo derivado continue sendo a soma do
que o teste de fato pode esperar. A espera vira uma falha que nomeia o passo em vez de
uma espera que consome o prazo inteiro.

**E a segunda espera sem teto que a mesma revisão achou:** `selectInscription()` esperava
o pós-retorno da escolha da inscrição sem limite — a espera que o defeito do período
corrigido introduziu, e que ficou sem teto junto. Virou
`INSCRIPTION_RERENDER_TIMEOUT_MS` = 60 s, o mesmo relógio do outro pós-retono do
formulário, porque é o mesmo tipo de espera: o formulário inteiro volta na resposta.
Nenhuma das duas medidas precisou de portal para ser corrigida — as duas já estavam
medidas acima.

**O que continua sem prova:** existe um teste que garante que toda espera _das cadeias_
usa um limite declarado, e nenhum que garanta o contrário — que toda espera **do código**
usa um limite declarado. Uma espera sem teto é invisível para a lista de limites: ela não
aparece em nenhuma cadeia, então nenhuma aritmética a acusa, e a suíte fica verde. Por
isso as duas acima só apareceram por medição de execução, uma delas porque a pessoa que
assistia fechou a janela e a outra porque a tela levou oito minutos. Fechar isso exigiria
uma verificação sobre o código — procurar `hover`, `click` e `waitForResponse` sem
`timeout` —, que é uma fonte nova de teste e por isso não foi escrita sem decisão.

### Desvios em relação à spec

| Suposição da spec                              | Realidade medida                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| O clique no item do menu pode abrir outra aba  | Não abre: mesma aba, postback JSF na mesma rota                                   |
| "NF-e" é substring de outros itens do menu     | **Confirmado**: 2 elementos por substring, 1 com `exact`                          |
| É preciso endereçar o menu por markup          | **Não**: `getByText(..., { exact: true })` resolve 1, sem markup                  |
| Voltar ao menu com `goBack` seria viável       | **Não**: a rota não muda, o histórico não distingue a tela                        |
| A tela já abre no formulário de exportação     | **Não**: abre na consulta por chave; o formulário só existe após escolher o papel |
| O botão se chama "Agendar Exportação"          | **Não**: o nome acessível é **`Agendar exportação`**, com `e` minúscula           |
| O botão de agendamento já está na chegada      | **Não**: na consulta por chave o botão é **`Exportar`**, outra ação               |
| O formulário tem inscrição e datas             | Sim, **depois** do papel de destinatário, e com **dois grupos de rádio** a mais   |
| A inscrição aparece pontuada como no diálogo   | **Não**: no `select` a inscrição aparece em dígitos puros                         |
| Os campos têm rótulo associável (`getByLabel`) | **Não**: só os rádios; o resto exige a relação com a linha                        |
| Os campos dividem um contêiner                 | **Não**: a inscrição e as datas estão em tabelas diferentes                       |
| Agendar acrescenta uma linha na tabela         | Sim, mas **só numa visita seguinte** — a página que agenda não se atualiza        |
| Escolher a inscrição preenche "Razão Social:"  | **Não**: nenhum campo é preenchido como consequência da seleção                   |
| A tela confirma o agendamento com mensagem     | **Não**: nenhum componente de mensagem recebe texto, antes ou depois do clique    |
| Dá para reaproveitar o formulário preenchido   | **Não**: cada visita nova abre com datas vazias e a inscrição 0                   |

### Obstáculo: a travessia pelo e-AGEAT é instável

A travessia pelo módulo legado falha de forma intermitente **do lado do portal**.
Os "becos sem saída" observados, todos eles já conhecidos do spike 05:

| Estado observado                            | Onde cai                       |
| ------------------------------------------- | ------------------------------ |
| `HTTP 500` na tela de boas-vindas do legado | `bemVindo.jsf`                 |
| "Usuário não identificado"                  | `usuarioNaoLogado.jsf`         |
| Recusa do login remoto da tela de destino   | `siatweb/servlet/login-remoto` |

Em **10 execuções**, 4 chegaram inteiro à tela de exportação e 6 falharam na
travessia. Isso não é defeito da automação: **o teste já existente do projeto
falha no mesmo passo**, com os mesmos estados. É o portal.

A consequência prática é o custo de cada medição: uma travessia bem-sucedida
gasta parte do orçamento de sessões, e uma execução precisa repetir a travessia
até passar para coletar todas as medições de uma vez.

#### O limite de sessões do destino

Em uma das execuções a tela de destino devolveu a causa explícita:

> Detalhes do erro - Falha ao efetuar o login remoto para o usuário: `<id>`.
> Erro: `java.sql.SQLException: ORA-…: limite de SESSIONS_PER_USER simultâneo
excedido`

Ou seja: **o banco do SIATWeb limita quantas sessões um usuário pode ter
simultâneas**, e execuções repetidas acumularam sessões no servidor até atingir o
limite. Os "becos sem saída" são Symptoms desse limite e de sua instabilidade, e
não telas diferentes.

#### Efeito sobre o desenho da automação

- A automação deve **tratar o limite de sessão como um estado de erro
  documentado**, do mesmo modo que já trata "Usuário não identificado": erro
  nomeado, sem tentativa automática de contorno.
- Rodar a suíte inteira significa **um login por teste**, e cada login ocupa uma
  sessão no servidor. Com 3 specs e travessias completas, a suíte pode esgotar o
  limite sozinha.
- O **laço por inscrições é vantajoso neste ponto**: ele reusa uma única sessão,
  em vez de abrir uma por inscrição. A decisão da spec de re-navegar o menu sem
  nova autenticação é a que minimiza o consumo de sessões.

### Pendência

A fase C está resolvida. Restam três perguntas que **não bloqueiam** a
implementação; uma quarta, respondida por medição, está marcada como tal; uma quinta
apareceu na 9ª execução — e essa era um defeito da **automação**, não uma pergunta
sobre o portal, corrigido depois; e uma sexta é a lacuna que a correção expôs.

- **Em que `Situação` uma linha começa — respondida.** A 5ª e a 8ª execuções
  mediaram: as linhas recém-criadas aparecem como **`Aguardando`**, e é assim que a
  visita final as lê, segundos depois da criação; `Processado` é o que as mais
  antigas mostram. Isso confirma a consequência prática que este texto já propunha:
  o fluxo afirma a **presença** da linha e nunca um valor de `Situação` — inclusive
  porque `Aguardando` é o estado de quem acabou de ser criado, não um sinal de
  falha.
- **Quais `Situação` são falha.** Só `Aguardando` e `Processado` foram vistos.
  Sem a lista completa, o fluxo aceita como sucesso qualquer linha que exista,
  inclusive uma que a tela tenha criado para registrar uma recusa.
- **Por que a tabela perde linhas.** Medido: entre 11:01 e 11:14 cinco linhas
  desapareceram da tabela — as de 22/09, 10:23:25, 10:42:51, 10:43:03 e 10:43:08 —
  e sobraram quatro, a mais antiga com 4 minutos. O portal remove agendamentos por
  um critério que não é observável de fora (data, situação ou retenção). **Por que
  isso importa:** a prova compara a contagem lida antes do clique com a contagem da
  visita final; uma remoção **não** a faz passar por engano, mas a faz **reprovar**
  por engano se a linha nova for removida antes da leitura final. A mesma remoção é a
  conciliação possível para a 1ª inscrição ter se registrado duas vezes — ver
  [a recusa por repetição](#a-recusa-tem-um-sinal--e-o-fluxo-não-o-lê).
- **A contagem de linhas vale para a página visível.** O paginador do portal traz
  15 linhas por página, e a inscrição medida tinha 3 registros — uma página só, e a
  contagem lida era a contagem total. Numa inscrição com mais de 15 agendamentos, a
  contagem lida deixa de ser o total: se a tabela ordena da linha mais nova para a
  mais antiga, um acréscimo aparece na primeira página e a prova continua valendo;
  se ordena da mais antiga para a mais nova, a linha nova cai na segunda página, a
  contagem não cresce e a prova falha **por engano** depois de esperar o limite
  inteiro. O modo de falha é uma falha falsa, nunca uma prova falsa — o que é
  aceitável, mas precisa ser dito. **Não medido:** qual das duas ordens o portal
  usa.
- **O caminho do menu não tinha limite — medido duas vezes, corrigido.** As três ações
  que antecedem a chegada da tela de exportação (`hover`, `hover`, `click`) esperavam
  sem teto, porque a configuração não declara `actionTimeout` e o padrão do Playwright é
  `0`. A 3ª execução ficou mais de 8 minutos dentro de um `hover` e a 9ª ficou 403 s em
  outro, com o prazo do teste chegando lá dentro — o que torna falsa a propriedade que
  esse prazo afirma. Ver
  [Uma espera sem limite declarado](#uma-espera-sem-limite-declarado-e-o-que-ela-custa).
  **Corrigido:** `MENU_WALK_TIMEOUT_MS` = 15 s nos três atos, declarado no módulo dos
  limites e somado às cadeias que o teste percorre. Na mesma revisão, a espera pelo
  pós-retorno da escolha da inscrição ganhou `INSCRIPTION_RERENDER_TIMEOUT_MS` = 60 s —
  ela já era usada e ainda não tinha teto.
- **Nada garante que uma espera do código tenha limite.** O teste que existe garante o
  outro sentido — toda espera das cadeias tem limite declarado —, e uma espera sem teto
  é invisível para as cadeias. As duas encontradas acima só apareceram por medição de
  execução. Ver
  [Uma espera sem limite declarado](#uma-espera-sem-limite-declarado-e-o-que-ela-custa).

Uma restrição que **não** é pendência, e que a implementação já deve obedecer: a
comparação da linha com a inscrição tem de ser feita **dentro da página**, e
apenas o resultado pode sair dela. Os dois valores são identificadores fiscais.

### Conclusão

O caminho até a tela é **semântico e estável**: dois hovers e um clique, cada item
endereçado pelo texto exato que a pessoa lê. Não há seletor de markup a
justificar, e a colisão de nomes que motivou a preocupação da spec está medida e
resolvida pelo casamento exato.

O formulário inteiro está medido, e **a spec estava errada em nove pontos que
teriam custado uma implementação**: a tela não abre nele; o botão de agendar se
chama "Agendar exportação"; **na chegada o botão é outro, `Exportar`**, uma
exportação avulsa que nada do fluxo pede; há dois grupos de rádio que decidem o
conteúdo do arquivo; a inscrição aparece sem pontuação, ao contrário do diálogo de
contribunte; os campos não dividem um contêiner; nenhum deles tem rótulo
associável; agendar não dá retorno visível; e a confirmação exige uma nova visita
à tela.

O clique autorizado **funcionou** — e só apareceria como fracasso para quem
confiasse na página que agendou. O fluxo precisa tratar "agendar" como uma ação
sem confirmação e verificar o resultado **depois** de recarregar, num percurso
que passa de novo por dois hovers, um clique, o aviso e o papel de
destinatário. Esse é o ponto mais caro do fluxo, e é o que a spec ainda descreve
como opcional.

### Arquivos desta investigação

Ficaram em `sandbox/`, ignorado pelo Git e destinado a descarte:

| Arquivo                      | Função                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe-nfe-export-screen.ts` | Medição do menu, dos localizadores, da navegação, do aviso, do formulário e da tabela; sondagem do clique autorizado. O clique só acontece com `E2E_PROBE_SCHEDULE=1` — sem essa variável a execução percorre o fluxo inteiro e só **lê**                                       |
| `inspect-nfe-export-output/` | Artefatos: `menu-items.json`, `locator-candidates.json`, `group-open-behaviour.json`, `screen-arrival.json`, `notice-controls.json`, `destination-role-form.json`, `form-structure.json`, `inscription-option-shapes.json`, `scheduled-exports.json`, `arrival-form-state.json` |

O `E2E_PROBE_SCHEDULE=1` existe por um motivo concreto: o único passo da sondagem
que grava em produção é o clique, e a verificação posterior **não** precisa dele.
Uma execução padrão não escreve nada.

---

## Spike 07 — Formulário do papel de emitente na tela "Consultar/Exportar NF-e"

**Data:** 2026-10-08
**Alvo:** `https://webas.sefaz.pi.gov.br/siatweb/faces/index.xhtml`
**Status:** concluída. O formulário que a tela serve depois que
`Contribuinte como Emitente` é escolhido está medido por inteiro, e **nenhuma
agendação aconteceu**.

### Objetivo

A [spike 06](#spike-06--tela-consultarexportar-nf-e-do-siatweb) mediu o formulário
do papel de **destinatário**, e o que ela escreveu vale para o formulário do
destinatário: os ids de servidor, os contêineres, os grupos de rádio com os
valores que posta, e o pós-retorno que a seleção da inscrição dispara. Nada disso
é conhecido para o formulário do papel de **emitente** — as notas que a empresa
emitiu, em vez das que recebeu.

Esta ronda mede esse formulário **antes** que qualquer código o enderece. A motivação
é concreta e é a mesma das duas defeções que este repositório já pagou: a contagem
que devolveu zero linhas para uma agendação recém-feita (a máscara da coluna `IE`)
e o período que saiu vazio nas requisições reais (o painel trocado embaixo da
digitação). Nenhum dos dois era visível na tela — ambos só apareceram quando
alguém mediu.

### Como a investigação foi feita

Um probe descartável em `sandbox/`, fora do versionamento, percorrendo o caminho já
medido e escolhendo o papel pelo nome acessível. O contrato de privacidade está
escrito no cabeçalho do arquivo e é este:

- **nenhuma inscrição, razão social ou CNPJ é registrada.** Os valores são
  descritos pela forma — comprimento, se são só dígitos, se contêm pontuação — e
  nunca pelo valor. O texto de cada tela não é gravado **nem mascarado**: o corpo
  da tela traz a razão social do contribuinte da sessão, e um nome não tem dígito
  que se possa esconder.
- **nenhuma imagem é tirada**, porque uma imagem não tem como ter um nome tirado
  dela.
- **não existe código de agendamento no probe.** Não há preenchimento de período,
  não há submissão de formulário e não há clique em `Agendar exportação`: a
  ausência é a garantia, e não uma configuração que alguém possa virar. O botão é
  apenas **olhado**.

O que a ronda fez de interativo, e nada além disso: navegação por menus, dispensa
do aviso, marcação do rádio do papel, abertura da lista de inscrições (Escape para
fechar) e uma seleção de inscrição — um `valueChange` de JSF, que altera a visão de
um formulário e não cria registro algum.

A leitura foi feita em **três execuções** do mesmo probe, todas de leitura: a
primeira trouxe a estrutura, a segunda acrescentou a leitura das células da linha
de cada grupo, e a terceira a cadeia de linhas inteira e a que `<form>` da página
carrega cada controle. Cada execução conferiu ao fim que a tabela de agendamentos
tinha as mesmas 15 linhas, nenhuma criada naquele dia e a lista de downloads vazia
— o portal saiu de cada ronda como entrou. Os artefatos de antes de cada acréscimo
foram copiados para fora do repositório, e a comparação entre a primeira e a
terceira execução mostrou diferença **apenas** nos campos acrescentados.

### 1. O caminho continua sendo o mesmo

Medido e idêntico ao da spike 06, em cada etapa: travessia por certificado para a
origem `webas.sefaz.pi.gov.br`, menu `Autoatendimento` aberto por **hover**, grupo
`NF-e` aberto por **hover**, folha `Consultar/Exportar NF-e` com `count: 1`, na
mesma aba, e o aviso inicial dispensado pelo botão **`Entendi`**. Nada aqui mudou
desde 2026-09-29.

### 2. A tela continua chegando em outro formulário

Medido: a tela abre no formulário de **consulta por chave da NF-e**, com os rótulos
`Pesquisar SOMENTE pela Chave da NFE`, `Contribuinte como Emitente`,
`Contribuinte como Destinatário` e `Chave NFE (DANFE):`, sob os títulos `Tipos de
Consulta` e `Dados da Consulta`, e o botão **`Exportar`**. Os campos de inscrição e
de data não existem nesse estado — são revelados pela escolha do papel, exatamente
como na spike 06.

O marcador de chegada continua sendo `Exportar`: ele **desaparece** quando o papel é
escolhido, e `Agendar exportação` o substitui.

### 3. O papel de emitente

O grupo dos três papéis tem `name` escrito à mão **`buscaComoId`**, e as três opções
têm `<label for>` explícito — ou seja, o papel é endereçável por localizador
semântico, com casamento exato pelo nome que a pessoa lê:

| Opção                               | Valor postado |
| ----------------------------------- | ------------- |
| Pesquisar SOMENTE pela Chave da NFE | `0`           |
| **Contribuinte como Emitente**      | **`1`**       |
| Contribuinte como Destinatário      | `2`           |

O atributo não traz prefixo de contêiner JSF: os `name` lidos **sem qualquer
normalização** no mesmo formulário — `numeroNota`, `dataInicial_input`,
`dataFinal_input`, `j_idt55` — são nome puro, sem dois-pontos. Isso importa porque
o nome do atributo é o nome que a requisição leva, e um prefixo a mais seria um
campo que a automação não encontra e portanto não compara.

A linha dos três papéis, medida célula a célula, tem **uma célula por opção e
nenhuma célula de rótulo de grupo** — o papel não tem linha rotulada, e é por
através do próprio atributo que o grupo é identificado.

Marcado o emitente, a tela passa a servir o formulário de exportação — e os rótulos
que surgem são os de radio, porque os rótulos de texto da tela são `<td>`, não
`<label>`:

```
Pesquisar SOMENTE pela Chave da NFE | Contribuinte como Emitente | Contribuinte como Destinatário
Todas | Entrada | Saída
Ativas | Canceladas | Inutilizadas | Denegadas | Todas
```

### 4. O formulário do emitente

O formulário é montado em **linhas**, com o rótulo numa célula e o controle na
seguinte — o mesmo desenho do do destinatário:

| Rótulo visível            | Controla                   | `id` do servidor                            | Contêiner medido                                        |
| ------------------------- | -------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `Inscrição:`              | `select` com **82 opções** | `j_idt40` (contador gerado, **instável**)   | `td` → `tr` → `tbody` → `table` → **`span#altExterno`** |
| `Razão Social:`           | `input` somente-leitura    | `j_idt55` (contador gerado)                 | → **`table#formularioPanel`** → **`span#panel-dados`**  |
| `Tipo de nota:`           | rádios (3 opções)          | `tipoDeNota` (escrito à mão, **estável**)   | idem                                                    |
| `Status da Nota:`         | rádios (5 opções)          | `statusNota` (escrito à mão, **estável**)   | idem                                                    |
| `Número da Nota`          | `input` opcional           | `numeroNota`                                | idem                                                    |
| `Data de Emissão Inicial` | `input` com datepicker     | `dataInicial_input` (em `span#dataInicial`) | idem                                                    |
| `Data de Emissão Final`   | `input` com datepicker     | `dataFinal_input` (em `span#dataFinal`)     | idem                                                    |
| —                         | botão                      | `Agendar exportação` (contador gerado)      | —                                                       |

Medido, e igual ao do destinatário em cada ponto:

- **Os contadores andaram.** Esta ronda serviu `j_idt40` e `j_idt55` onde a spike 06,
  em 2026-09-29, serviu `j_idt39` e `j_idt54`. É a prova observada de que o contador
  gerado é função da página e não do papel — e é por isso que ele nunca é usado.
- **Só os rádios têm `<label for>`.** Nenhum campo de texto resolve por
  `label[for]`, `aria-label` ou `placeholder`. O que identifica o campo é o texto da
  linha, e o `id` escrito à mão quando existe.
- **Não há campo oculto para as datas** — `hiddenNames` veio **vazio**, nenhum `name`
  correspondente no DOM, como medido para o destinatário em
  [spike 06 §5](#5-o-formulário-de-destinatário).
- **Não há marcador de obrigatório** na tela: `requiredMarkers` veio **vazio**.
- O campo `Razão Social:` chega somente-leitura, preenchido pelo servidor.

**A cadeia de linhas de cada grupo, medida célula a célula** — e é a única forma de
achar o rótulo, porque ele não está na linha em que os rádios estão:

| Grupo         | Linha interna — a dos rádios                                                                            | Linha intermediária                              | Linha externa — a do rótulo                  |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `tipoDeNota`  | `Todas` · `Entrada` · `Saída` (uma célula por opção)                                                    | `Todas Entrada Saída`                            | **`Tipo de nota:`** · `Todas Entrada Saída`  |
| `statusNota`  | `Ativas` · `Canceladas` · `Inutilizadas` · `Denegadas` · `Todas`                                        | `Ativas Canceladas Inutilizadas Denegadas Todas` | **`Status da Nota:`** · idem, na mesma ordem |
| `buscaComoId` | `Pesquisar SOMENTE pela Chave da NFE` · `Contribuinte como Emitente` · `Contribuinte como Destinatário` | —                                                | **não tem** — só existe a linha interna      |

Duas consequências, e as duas sustentam localizador que ainda não existe:

- **O rótulo está na linha externa, e nenhuma linha da cadeia o repete.** Um filtro
  por texto exato resolve, portanto, em **uma** linha só — e essa linha contém os
  rádios como descendentes, que é o que permite escopar a marcação pelo grupo inteiro
  sem que `Todas`, opção dos dois, diga a qual dos dois se estava olhando.
- **A linha interna não serviria.** Ela carrega só as opções, então uma leitura que
  parasse nela registraria os valores e perderia justamente o que distingue os
  grupos — é o erro que esta medição existiu para não cometer.

**O `<form>` do documento, medido por pertencimento.** A página tem sete
`<form>`; o botão submete o que o contém, então o que está fora dele jamais sai na
requisição. Os três grupos de rádio, os dois campos de data e o próprio
`Agendar exportação` estão **todos em `consultaNFeForm`**, e nenhum outro
formulário da página carrega um só deles:

| `<form>`              | Grupo de papéis | `tipoDeNota` | `statusNota` | Datas   | `Agendar exportação` |
| --------------------- | --------------- | ------------ | ------------ | ------- | -------------------- |
| `formMenuSiatWebId`   | não             | não          | não          | não     | não                  |
| `j_idt21`             | não             | não          | não          | não     | não                  |
| **`consultaNFeForm`** | **sim**         | **sim**      | **sim**      | **sim** | **sim**              |
| `j_idt96`             | não             | não          | não          | não     | não                  |
| `j_idt107`            | não             | não          | não          | não     | não                  |
| `j_idt117`            | não             | não          | não          | não     | não                  |

Como é o próprio botão que submete esse formulário, o pedido de agendamento carrega
os três grupos de rádio, as datas e o número da nota. É uma propriedade **do
marcado, medida** — e não o aperto de um botão, que esta ronda não deu.

### 5. Os grupos de rádio, com o valor que cada opção posta

Medido em `form-structure.json`, lendo o atributo `value` de cada rádio em vez de
submeter o formulário — porque é o único jeito de saber o payload sem mandar um:

| Grupo        | Opção marcada na chegada | Opções, com o valor postado                                                    |
| ------------ | ------------------------ | ------------------------------------------------------------------------------ |
| `tipoDeNota` | **Todas** (`0`)          | Todas `0` · Entrada `1` · Saída `2`                                            |
| `statusNota` | Ativas (`1`)             | Ativas `1` · Canceladas `0` · Inutilizadas `3` · Denegadas `4` · **Todas `2`** |

Os dois grupos trazem **as mesmas opções com os mesmos valores postados** do
formulário do destinatário. As duas coisas que importam para o fluxo:

1. **Este formulário traz o grupo de tipo de nota.** Ele não é exclusivo de um
   papel, e portanto entra nas escolhas deste fluxo — marcado como **Todas**, por
   autorização expressa de quem responde pela emissão, do mesmo modo que o de
   status. O conteúdo do arquivo passa a ser o conjunto inteiro de notas do
   período, e não só as ativas.
2. **Os valores não se repetem dentro de um grupo** (`0,1,2` em um; `1,0,3,4,2` no
   outro), o que é o que torna uma comparação contra o valor postado possível sem
   ambiguidade. Repare que `Todas` vale `0` num grupo e `2` no outro: o valor não é
   transferível entre grupos, e é por isso que cada escolha é declarada com o
   valor do **seu** grupo.

Toda opção de rádio tem `<label for>` explícito, o que justifica o casamento por
nome acessível. O grupo dos papéis (`buscaComoId`) chegou com o emitente já
marcado, porque foi a marcação desta ronda — os outros dois chegaram como a tela
abre.

### 6. A inscrição e o pós-retorno

Medido: o `select` de inscrição tem **82 opções**, e a tela **chega com a opção 0
selecionada** — cujo valor tem 9 dígitos, ou seja, é uma inscrição de verdade e não
um marcador de posição. O comportamento é idêntico ao medido para o destinatário
(`arrival-form-state.json` das duas rondas é o mesmo): os dois campos de data
chegam vazios.

Escolher uma inscrição **dispara um pós-retorno**, medido pela própria requisição
que sai:

| O que foi medido                     | Medido                                       |
| ------------------------------------ | -------------------------------------------- |
| Requisição                           | `POST` com `javax.faces` no corpo            |
| `javax.faces.behavior.event`         | **`valueChange`**                            |
| `javax.faces.partial.render`         | **`consultaNFeForm`** — o formulário inteiro |
| Conjunto de controles antes e depois | **idêntico** (`controlsChanged: false`)      |
| Conjunto de rótulos antes e depois   | **idêntico** (`labelsChanged: false`)        |

Duas consequências, e a primeira delas é a que já custou dinheiro:

- **O período é escrito depois da seleção da inscrição, e nunca antes.** O alvo do
  re-render é o formulário inteiro, então qualquer período escrito antes da escolha
  é substituído embaixo da digitação. É a mesma regra medida para o destinatário em
  [spike 06 §8](#8-a-seleção-da-inscrição-re-renderiza-o-formulário-inteiro), e
  agora está confirmada para este formulário também.
- **A troca não é detectável pela estrutura.** Os controles e os rótulos de antes e
  de depois são o mesmo conjunto, então comparar ids não prova nada. O que prova é
  o alvo declarado na requisição — `consultaNFeForm` —, e é por isso que a medição
  registra o corpo da requisição e não só o DOM.

Marcar um rádio, ao contrário, **não dispara nada**: nenhum dos grupos tem
`onchange`, `onclick` nem `f:ajax`. A marcação é ação de cliente e não pode esvaziar
o período.

### 7. O botão de agendamento

Medido **sem pressioná-lo**. O controle é um `<button>` com contador gerado
(`j_idt74`), e ele é alcançável por localizador semântico:

| Localizador                                                        | Resolve? |
| ------------------------------------------------------------------ | -------- |
| `getByRole('button', { name: 'Agendar exportação', exact: true })` | **sim**  |
| `getByRole('button', { name: 'Agendar exportação' })`              | sim      |
| `getByText('Agendar exportação', { exact: true })`                 | sim      |

Os botões visíveis na tela são `Pagina Inicial`, **`Agendar exportação`**, `Info`,
`Download` e `Excluir` — o mesmo conjunto do destinatário. O casamento exato é o
que a automação usa, e o nome acessível é exatamente `Agendar exportação`.

### 8. A tabela de exportações agendadas

A tabela é a mesma, `div#lista-agendamentos`, com os mesmos cabeçalhos que a spike 06
registrou: `ID · Situação · Data de criação · CNPJ · IE · Data processamento ·
Ações`.

**Não há coluna de papel.** A lista é uma só para os dois papéis e a linha não é
atribuível a quem a criou — é a limitação que torna a prova por variação de contagem
necessária e imperfeita ao mesmo tempo, e ela está escrita aqui e não só no código.

Nesta ronda a tabela tinha **15 linhas**, todas `Processado`, nenhuma criada no dia
da medição (`createdToday: false`), e a lista de downloads do probe ficou **vazia**.

### 9. Divergências em relação ao formulário do destinatário

Item a item, entre a medição de 2026-09-29 (destinatário) e a de 2026-10-08
(emitente):

| Item                                           | Destinatário (2026-09-29)                                                  | Emitente (2026-10-08)             | Divergência                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Papel a marcar                                 | valor `2`                                                                  | valor **`1`**                     | **sim — é a única real**                                                              |
| Linhas, ids, contêineres do formulário         | `altExterno` / `formularioPanel` / `panel-dados`                           | idênticos                         | não                                                                                   |
| Rótulo da linha de cada grupo de escolha       | `Tipo de nota:` / `Status da Nota:` (na linha externa)                     | idênticos, **medido pela cadeia** | não                                                                                   |
| `<form>` que carrega grupos, datas e botão     | não medido                                                                 | `consultaNFeForm`, os seis juntos | — (a spike 06 não mediu pertencimento)                                                |
| Opções do `select` de inscrição                | 82                                                                         | 82                                | não                                                                                   |
| Valor inicial do `select`                      | opção 0, 9 dígitos                                                         | opção 0, 9 dígitos                | não                                                                                   |
| Grupo `tipoDeNota` e seus valores              | Todas `0` · Entrada `1` · Saída `2`                                        | idênticos                         | não                                                                                   |
| Grupo `statusNota` e seus valores              | Ativas `1` · Canceladas `0` · Inutilizadas `3` · Denegadas `4` · Todas `2` | idênticos                         | não                                                                                   |
| Pós-retorno da inscrição                       | `valueChange` → `consultaNFeForm`                                          | `valueChange` → `consultaNFeForm` | não                                                                                   |
| Campo oculto para as datas                     | nenhum                                                                     | nenhum                            | não                                                                                   |
| Marcadores de obrigatório                      | nenhum                                                                     | nenhum                            | não                                                                                   |
| `<label for>` só nos rádios                    | sim                                                                        | sim                               | não                                                                                   |
| Botão `Agendar exportação` por papel semântico | sim                                                                        | sim                               | não                                                                                   |
| Contadores `j_idt…`                            | `j_idt39` / `j_idt54`                                                      | `j_idt40` / `j_idt55`             | **sim — mas não é do papel**: o contador é gerado por página e por isso nunca é usado |
| Tabela `lista-agendamentos`                    | sem coluna de papel                                                        | sem coluna de papel               | não                                                                                   |

**A única diferença que é do papel é o valor do rádio do papel.** Todo o resto —
estrutura, ids escritos à mão, valores postados, pós-retorno, contêineres, botão —
é o mesmo formulário servido sob outro papel. É o que sustenta a escolha de compor
a nova tela em cima da já existente em vez de duplicá-la.

### 10. O que a ronda não fez

- **Nenhuma agendação.** O código de agendamento não existe no probe, então não é
  uma configuração que esteja desligada: não há caminho.
- **Nenhuma imagem.**
- **Nenhum download.** A lista de downloads ficou vazia.
- **Nada foi excluído, arquivado, impresso ou submetido.** Os controles de ações da
  tabela (`Info`, `Download`, `Excluir`) foram apenas listados.
- **Nenhum registro anterior foi reescrito.** Esta spike é um capítulo novo; a spike
  06 continua sendo o retrato de 2026-09-29.
- **Nenhum dado fiscal entrou em nenhum documento.** Nesta ronda nem o texto das
  telas foi gravado.

### Arquivos desta investigação

Ficaram em `sandbox/`, ignorado pelo Git e destinado a descarte:

| Arquivo                             | Função                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `probe-nfe-export-issuer-screen.ts` | Medição do papel de emitente, do formulário, dos grupos de rádio, do pós-retorno e do botão. **Não contém código de agendamento**, nem imagem                                                                            |
| `inspect-nfe-export-issuer-output/` | Artefatos: `group-open-behaviour.json`, `notice-controls.json`, `issuer-role-form.json`, `form-structure.json`, `arrival-form-state.json`, `inscription-postback.json`, `schedule-button.json`, `scheduled-exports.json` |

O probe não tem porta de escrita nenhuma: sem `E2E_PROBE_SCHEDULE`, sem
`E2E_PROBE_SCREENSHOTS`, sem clique de agendamento. Uma execução padrão lê e sai.

---

## Spike 08 — Tela e formulário da NFC-e em "Consultar/Exportar NFC-e"

**Data:** 2026-10-09
**Alvo:** `https://webas.sefaz.pi.gov.br/siatweb/faces/index.xhtml`
**Status:** concluída. A tela da NFC-e está medida por inteiro, e **nenhuma
agendação aconteceu**.

### Objetivo

As [spikes 06](#spike-06--tela-consultarexportar-nf-e-do-siatweb) e
[07](#spike-07--formulário-do-papel-de-emitente-na-tela-consultarexportar-nf-e)
mediram o ramo **NF-e** do menu. O ramo **NFC-e** abre outra tela, servida pelo mesmo
sistema, e nada dela era conhecido: nem os grupos de rádio, nem os valores que as
opções postam, nem o rótulo da inscrição, nem a tabela de agendamentos. Esta ronda
mede essa tela **antes** que um fluxo a endereçasse.

O que a medição existia para responder, e respondeu de forma diferente da NF-e: a
tela da NFC-e **chega no formulário do emitente**, não no formulário de consulta por
chave; o grupo de status tem só **três** opções; e o rótulo da inscrição é
**`Inscrição::`**, com dois pontos.

### Como a investigação foi feita

Um probe descartável em `sandbox/probe-nfce-export-issuer-screen.ts`, fora do
versionamento, percorrendo o caminho do menu já medido. O contrato de privacidade é o
das outras rondas e está no cabeçalho do arquivo:

- **nenhuma inscrição, razão social ou CNPJ é registrada** — os valores são descritos
  pela forma (comprimento, se são só dígitos, se contêm pontuação), nunca pelo valor;
- **nenhuma imagem é tirada**;
- **não existe código de agendamento no probe** — não há preenchimento de período,
  submissão de formulário nem clique em `Agendar exportação`. O botão é apenas
  **olhado**.

O que a ronda fez de interativo: navegação por menus, dispensa do aviso, abertura da
lista de inscrições e o que a tela já serve na chegada. A tabela de agendamentos tinha
as mesmas **15 linhas**, nenhuma criada naquele dia e a lista de downloads vazia
(`downloads.json` = `[]`) — o portal saiu da ronda como entrou.

### 1. O caminho

Medido: `Autoatendimento` e `NFC-e` abrem por **hover** (`group-open-behaviour.json`), e
a folha é **`Consultar/Exportar NFC-e`**, na mesma aba, com URL de chegada
`/siatweb/faces/index.xhtml` (`screen-arrival.json`, título _SIAT - Sistema Integrado
de Administração Tributária_).

O casamento tem de ser **exato**: medido em `locator-candidates.json`,
`getByText('NFC-e', { exact: true })` casa **um** elemento, enquanto o casamento por
substring casa **dois** — `NFC-e` é substring de outro item do mesmo menu. É o mesmo
motivo pelo qual a folha `Consultar/Exportar NF-e` é casada por texto exato.

### 2. A tela chega no formulário do emitente

Medido (`03-nfce-export-screen.state.json`, `form-structure.json`): ao contrário da
tela de NF-e, a tela da NFC-e **não** passa pelo estado de consulta por chave. Ela
chega diretamente no formulário de exportação, e o grupo de papéis
(`buscaComoId`) chega com **`Contribuinte como Emitente` já marcado** (`1`).

Consequências medidas:

- **O papel não tem linha rotulada**, como na NF-e: os dois rádios ficam numa linha
  interna, sem célula de rótulo de grupo.
- **Há dois papéis, e não três**: **não existe** o papel `Pesquisar SOMENTE pela
Chave da NFE` na NFC-e. A guarda de escolhas conhecidas tem, por isso, dois nomes de
  papel, e não três.
- Não há estado intermediário em que o formulário ainda não exista: os controles do
  formulário estão servidos já na chegada. O marcador de chegada é o próprio conjunto
  de controles do formulário, mais a linha `Status da NFC-e:`.

### 3. O aviso

Medido (`notice-controls.json`): dos quatro candidatos, só **`Entendi`** existe, e
existe como **botão** (`Entendido`, `OK` e `Fechar` medem zero). É o controle que
dispensa o aviso modal que a tela abre (`03` tem `Entendi` entre os botões; `04`, sem
ele, é a mesma tela sem o aviso).

### 4. Os grupos de rádio, com o valor que cada opção posta

Medido em `form-structure.json`, lendo o atributo `value` de cada rádio:

| Grupo (linha)      | `name` / campo | Opções, com o valor postado                                             | Chega marcado   |
| ------------------ | -------------- | ----------------------------------------------------------------------- | --------------- |
| — (papel)          | `buscaComoId`  | `Contribuinte como Emitente` `1` · `Contribuinte como Destinatário` `2` | **Emitente**    |
| `Tipo de nota:`    | `tipoDeNota`   | `Entrada` `0` · `Saída` `1`                                             | **Saída** (`1`) |
| `Status da NFC-e:` | `statusNota`   | `Ativas` `1` · `Canceladas` `0` · `Todas` `2`                           | Ativas (`1`)    |

Três fatos que sustentam o fluxo:

1. **Não há postback ao marcar.** Nenhum dos grupos carrega `onchange`, comportamento
   AJAX ou marcador de mudança de valor. Marcar é ação de cliente, sem requisição a
   esperar — o mesmo que os formulários de NF-e, medido de novo aqui em vez de
   assumido.
2. **`Todas` só existe no grupo de status**, e não nos dois grupos como nos formulários
   de NF-e. É por isso que o teste unitário deste fluxo **não** repete a asserção de
   que dois grupos compartilham uma opção: aqui eles não compartilham.
3. **toda opção de rádio tem `<label for>` explícito**, então os três grupos são
   endereçáveis por nome acessível com casamento exato. Os valores não se repetem
   dentro de um grupo, o que torna possível comparar a escolha contra o corpo do
   pedido.

O grupo de status da NFC-e é **menor** que o de NF-e: não tem `Inutilizadas` nem
`Denegadas`, e a opção `Todas` vale `2`, onde no de NF-e valia `2` para status e `0`
para tipo. O valor **não é transferível entre telas**, e é a razão de a tabela ser
declarada de novo.

### 5. O formulário

Medido por `form-structure.json`; o `<form>` que carrega tudo é **`consultarNFCeForm`**
(os grupos, as datas e o botão de agendamento moram todos nele):

| Rótulo visível            | Controla                   | `id` do servidor                            | Contêiner medido                                        |
| ------------------------- | -------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `Inscrição::`             | `select` com **82 opções** | `j_idt39` (contador gerado, **instável**)   | `td` → `tr` → `tbody` → `table` → **`span#altExterno`** |
| `Tipo de nota:`           | rádios (2 opções)          | `tipoDeNota` (escrito à mão, **estável**)   | → **`table#formularioPanel`** → **`span#panel-dados`**  |
| `Status da NFC-e:`        | rádios (3 opções)          | `statusNota` (escrito à mão, **estável**)   | idem                                                    |
| `Número da Nota`          | `input` opcional           | `numeroNota`                                | idem                                                    |
| `Data de Emissão Inicial` | `input` com datepicker     | `dataInicial_input` (em `span#dataInicial`) | idem                                                    |
| `Data de Emissão Final`   | `input` com datepicker     | `dataFinal_input` (em `span#dataFinal`)     | idem                                                    |
| —                         | botão                      | **`Agendar exportação`** (`button#j_idt62`) | —                                                       |

Medições que sustentam os localizadores:

- **O rótulo da inscrição é `Inscrição::`, com dois pontos** — diferente do
  `Inscrição:` do formulário de NF-e. É o texto da célula (`td.w-150`) da linha, e é
  ele que separa os contêineres onde a inscrição vive (`#altExterno`, numa tabela sem
  id) dos demais campos (`#formularioPanel` em `#panel-dados`).
- **Nenhum campo tem `label[for]`, `aria-label` ou `placeholder`** — só os rádios, que
  têm `<label for>`. Por isso a inscrição e as datas são endereçadas pelo texto da
  linha e pelo `id` escrito à mão.
- **Não há marcador de obrigatório**: `requiredMarkers` veio **vazio**.
- **`Agendar exportação` é o único botão de agendamento** (`button#j_idt62`), e o nome
  acessível casa por `role=button`, exato e frouxo, como o da NF-e. `Pagina Inicial`,
  `Info`, `Download` e `Excluir` também existem na tela; nenhum deles é acionado.

### 6. A inscrição e o pós-retorno

Medido (`inscription-postback.json`, `arrival-form-state.json`): o `select` de
inscrição tem **82 opções** e a tela **chega nele no placeholder** — a primeira opção
está selecionada e os dois campos de data chegam vazios. Selecionar uma inscrição
dispara um `valueChange` de JSF:

| O que foi medido             | Medido                             |
| ---------------------------- | ---------------------------------- |
| Requisição                   | `POST` com `javax.faces` no corpo  |
| `javax.faces.behavior.event` | **`valueChange`**                  |
| `javax.faces.partial.render` | **`consultarNFCeForm`**            |
| Controles mudaram            | **não** (`controlsChanged: false`) |

A seleção re-renderiza o formulário e não troca os controles: é por isso que as
escolhas de nota são marcadas **depois** dela, para ficarem na versão do formulário
que é submetida.

### 7. A tabela de agendamentos e o botão

Medido (`scheduled-exports.json`, `screen-tables.json`, `schedule-button.json`):

- A tabela é `div.ui-datatable#lista-agendamentos-nfce` — uma tabela **própria**, com
  id distinto da de NF-e (`lista-agendamentos`).
- Colunas: `ID`, `Situação`, `Data de criação`, `Data processamento`, `CNPJ`, `IE`,
  `Ações`. Havia **15 linhas**, com `Situação` em `Processado sem notas` ou
  `Processado`, **nenhuma criada naquele dia**.
- Cada linha carrega os botões `Info`, `Download` e `Excluir` (por exemplo
  `lista-agendamentos-nfce:<linha>:j_idt78`, `j_idt80`, `j_idt82`). **Nenhum foi
  acionado**, e o fluxo não aciona nenhum deles.
- O botão de agendamento é `Agendar exportação` (`button#j_idt62`), medido como
  alcançável por `role=button` com casamento exato.
- **O request que esse botão faz não foi medido, e a recusa é deliberada.** O probe
  não tem porta de agendamento (§Artefatos): pressionar `Agendar exportação` registra
  um export real. A mesma recusa vale para a spike 06, na tela de NF-e — o corpo
  desse request **não está medido em nenhuma tela desta suíte**, e é a única lacuna
  de medição que a implementação herda. O filtro do request de registro usa a
  leitura que está validada em produção na NF-e, `javax.faces.partial.render`
  contendo o id da tabela (`lista-agendamentos-nfce` aqui), aplicada por analogia ao
  botão desta tela. A primeira execução autorizada do ciclo é que a valida neste
  ramo, e uma divergência falha **depois** do clique, com o export já registrado — o
  trace do Playwright guarda o corpo do request que saiu, que é o que revela a
  divergência.

#### O pedido medido em produção, sem precisar deduzir nada

A lacuna acima fecha de um jeito que não precisou do clique para ser conhecida: **a
lista de atualização do botão está na própria marcação**. O `onclick` renderizado
traz

`update:'j_idt62 consultarNFCeForm lista-agendamentos-nfce'`

— o id da tabela que o clique re-renderiza é, portanto, **medido no DOM** e não
inferido por analogia. O predicado `isExportRegistrationRequest` passa a ler a tela
em vez da NF-e. E o corpo que saiu em produção confirmou: `javax.faces.partial.render`
veio como `j_idt62 consultarNFCeForm lista-agendamentos-nfce`, com o mesmo `source` e
`process` do botão, e a resposta foi **200**. O corpo continua não sendo lido pela
automação, mas deixou de ser deduzido: agora é medido.

O `oncomplete` do botão chama `agendamentosNFCeTable.filter()`. A tabela é filtrável
— as colunas `CNPJ` e `IE` trazem campos `Selecione...` —, e a prova de linhas lê o
DOM **depois** desse filtro.

#### A recusa por sobreposição existe na NFC-e, e o status HTTP não a distingue

Com um agendamento já existente para a mesma inscrição e o mesmo período, o clique
responde **200** e a tela traz, em vermelho, no topo do formulário:

> "Já existe um agendamento com os parâmetros passados. Tente com novos ou busque o ID"

A contagem da prova fica **1 linha antes e 1 linha depois** e o ciclo falha com
`MissingScheduledExportError`, que é a leitura honesta e não um defeito. O ponto que
esta medição fecha é que **200 não significa aceito**: o pedido aceito e o recusado
vêm com o mesmo status, e só a variação da contagem distingue um do outro.

A recusa tem sinal na tela e o fluxo não o lê — a mesma limitação medida no ciclo de
NF-e (spike 06, "A recusa tem um sinal — e o fluxo não o lê"). Ela não pode ser
ligada a um período específico pela tabela: as colunas são `ID`, `Situação`,
`Data de criação`, `Data processamento`, `CNPJ`, `IE` e `Ações`, e **nenhuma delas
traz o período agendado**.

#### Três execuções autorizadas, uma inscrição e um pedido em cada

| Execução | Desfecho                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1ª       | Pedido registrado: a linha apareceu na tabela e passou a `Processado`. A visita de fechamento caiu na tela de erro interna do portal, e a prova das linhas não rodou |
| 2ª       | Recusada por sobreposição, com a mensagem acima; a prova leu 1 linha antes e 1 depois                                                                                |
| 3ª       | Depois de a linha da 1ª ser excluída, **o ciclo passou inteiro**: pedido aceito e a contagem cresceu                                                                 |

A 1ª confirma, neste ramo, o que a spike 06 media na NF-e: a tela de erro é
**intermitente**. O mecanismo ficou legível na rede: o `reload` da primeira visita é
**GET**, e o da visita de fechamento é **POST** — `page.reload()` reenvia o pedido
original do documento, que a ação do menu carregou por POST. É nessa re-execução da
ação de menu que o portal levanta

`ORA-01924: a atribuição 'RL_NFCU002' não foi concedida ou não existe`

`RL_NFCU002` é o papel deste ramo, equivalente ao `RL_NFEU001` da NF-e. A tabela de
papéis medida na spike 06 lista só os itens do ramo NF-e; o do ramo NFC-e não estava
em nenhum documento desta suíte até aqui.

### Artefatos

Ficaram em `sandbox/`, ignorado pelo Git e destinado a descarte:

| Arquivo                              | Função                                                                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe-nfce-export-issuer-screen.ts` | Medição do caminho da NFC-e, do formulário, dos grupos de rádio, do pós-retorno e do botão. **Não contém código de agendamento**, nem imagem                                                                                                                         |
| `inspect-nfce-export-issuer-output/` | Artefatos: `group-open-behaviour.json`, `locator-candidates.json`, `notice-controls.json`, `form-structure.json`, `arrival-form-state.json`, `inscription-postback.json`, `schedule-button.json`, `scheduled-exports.json`, `downloads.json`, e os estados `01`–`07` |

O probe não tem porta de escrita nenhuma: sem `E2E_PROBE_SCHEDULE`, sem
`E2E_PROBE_SCREENSHOTS`, sem clique de agendamento. Uma execução padrão lê e sai.
