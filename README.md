# nfe-nfce

Automação em Playwright Test para o SIATWeb da SEFAZ-PI.

O objetivo final do projeto é **baixar arquivos do portal e nada mais**. O
download ainda não foi implementado: a entrega atual cobre o acesso automatizado
e o agendamento das exportações, que são a pré-condição dele.

## Documentação

| Documento                                                      | Para quê                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **[`docs/fluxo.md`](docs/fluxo.md)**                           | O fluxo fase a fase — do login por certificado ao agendamento — e **por que** ele é feito assim. Comece por aqui. |
| **[`docs/referencia-tecnica.md`](docs/referencia-tecnica.md)** | Consulta: contratos, funções de sequência, seletores, erros, prazos e variáveis de ambiente.                      |
| [`docs/glossary.md`](docs/glossary.md)                         | Vocabulário das telas, dos controles e dos conceitos.                                                             |
| [`AGENTS.md`](AGENTS.md)                                       | As regras do projeto.                                                                                             |
| **[`docs/decisoes.md`](docs/decisoes.md)**                     | As doze decisões técnicas, com o contexto e as consequências de cada uma.                                         |
| **[`docs/spikes.md`](docs/spikes.md)**                         | As cinco rondas de medição contra o portal, de onde saem as justificativas.                                       |

## Pré-requisitos

- Node.js 22 ou superior
- pnpm 12.6.0
- Navegadores do Playwright instalados: `pnpm exec playwright install`

## Configuração

Copie o arquivo de exemplo e preencha as chaves. O arquivo `.env` é ignorado
pelo Git e nunca deve ser versionado.

```bash
cp .env.example .env
```

| Variável                                                        | Obrigatória | Conteúdo                                                                         |
| --------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `E2E_BASE_URL`                                                  | sim         | Endereço do portal sob teste, sem valor padrão                                   |
| `E2E_CERT_SSO_ORIGIN`                                           | sim         | Origem do host de SSO de certificado, **a única** para a qual o A1 é apresentado |
| `E2E_CERT_PATH`                                                 | sim         | Caminho absoluto do arquivo A1 (`.pfx` ou `.p12`), fora do repositório           |
| `E2E_CERT_PASSWORD`                                             | sim         | Senha do certificado A1                                                          |
| `E2E_SIATWEB_SYSTEM_ORIGIN`                                     | sim         | Origem do sistema de destino, servido por outra origem                           |
| `E2E_COMPANY_INSCRIPTION`                                       | sim         | Inscrição estadual da empresa que a sessão representa                            |
| `E2E_NFE_EXPORT_INSCRIPTIONS`                                   | sim         | Inscrições a agendar, separadas por vírgula, na ordem em que devem ser agendadas |
| `E2E_NFE_EXPORT_EMISSION_START` / `E2E_NFE_EXPORT_EMISSION_END` | sim         | Período de emissão, em `dd/mm/yyyy`                                              |
| `E2E_USER` / `E2E_PASSWORD`                                     | não         | Apenas para o formulário de CPF/CNPJ, que esta automação não usa                 |
| `E2E_DOWNLOAD_DIR`                                              | não         | Diretório de downloads, para a fase de download                                  |

A tabela completa, com **quando** cada variável é exigida, está na
[referência técnica](docs/referencia-tecnica.md#8-variáveis-de-ambiente).

`E2E_BASE_URL` é lida ao carregar a configuração, então sem ela a suíte nem inicia
e a falha nomeia a variável. `E2E_SIATWEB_SYSTEM_ORIGIN` é lida só quando a
travessia chega ao destino, então sem ela a suíte corre e falha nessa fase — o
login, que vem antes, funciona. `E2E_COMPANY_INSCRIPTION` **é exigida mas não é lida
por nenhum código** — a divergência está registrada nas
[pendências](docs/fluxo.md#7-pendências).

## Comandos

| Comando                                | O que faz                                            |
| -------------------------------------- | ---------------------------------------------------- |
| `pnpm test`                            | Executa a suíte em Chromium headless, em série       |
| `pnpm test:scheduling`                 | Executa só o ciclo de agendamento das exportações    |
| `pnpm test:scheduling:issuer`          | Executa só o ciclo de agendamento **do emitente**    |
| `pnpm test:scheduling:nfce`            | Executa só o ciclo de agendamento **da NFC-e**       |
| `pnpm test:scheduling:nfce:all-status` | Executa só o ciclo **NFC-e com Status em Todas**     |
| `pnpm test:unit`                       | Executa a suíte unitária, sem navegador e sem portal |
| `pnpm test:headed`                     | Executa com navegador visível, para depurar o portal |
| `pnpm test:ui`                         | Abre o modo de depuração interativo do Playwright    |
| `pnpm test:report`                     | Abre o último relatório HTML                         |
| `pnpm typecheck`                       | Verificação de tipos, em modo estrito                |
| `pnpm lint` / `pnpm lint:fix`          | Lint, incluindo as regras específicas do Playwright  |
| `pnpm format` / `pnpm format:check`    | Formatação com Prettier                              |

`pnpm test:scheduling` roda apenas o arquivo de teste do agendamento, e não pelo
nome do teste, para que renomear o teste não quebre o comando. Opções atravessam:
`pnpm test:scheduling --headed` abre o navegador visível.

### A rodada padrão agenda quatro pedidos, não dezesseis

Há **quatro** ciclos de agendamento, um por arquivo de teste: o de destinatário
(notas recebidas de NF-e), o de emitente (notas emitidas de NF-e), o da NFC-e com
Status em `Canceladas` e o da NFC-e com Status em `Todas`. Os quatro agenda quatro
pedidos reais sobre as mesmas empresas e o mesmo período — as variáveis são as
mesmas, e não existe nenhuma variável NFC-e nem nenhuma variável de Status.

**Os dois ciclos da NFC-e são a mesma tela, a mesma lista e o mesmo período, com
outro Status** — um posta `statusNota` `0`, outro posta `2`. Se os dois rodarem
para o mesmo período, são **duas exportações por inscrição**; se o portal julgar a
repetição de agendamento só pelo período, o segundo vem recusado no primeiro item
com "Já existe um agendamento com os parâmetros passados". Não foi medido qual
dos dois casos vale, e a pergunta está registrada na
[ADR 0012](docs/decisoes.md#adr-0012--fluxo-nfce-todas-um-quarto-ciclo-mesma-tela-escolhas-como-parâmetro-e-prova-por-iteração).

`pnpm test`, `pnpm test:headed` e `pnpm test:ui` passam `--grep-invert @on-demand`,
que remove os três ciclos sob demanda. Cada comando de ciclo roda **só** o seu
arquivo: `pnpm test:scheduling:issuer`, `pnpm test:scheduling:nfce` e
`pnpm test:scheduling:nfce:all-status`. A marca `@on-demand` está escrita no
título de cada teste, literalmente.

**O furo dessa escolha, e ele é real:** a inversão vive nos comandos do
`package.json`, não na configuração. Quem invocar o executor sem passar pelo
comando — `npx playwright test`, a extensão do VS Code, qualquer comando sem
`--grep-invert` — agenda **todos os ciclos**, dezesseis pedidos reais em produção
em vez de quatro. Nenhum teste é pulado nesse caso; é a execução que passa a fazer
mais do que se pediu.

## Avisos

**A suíte roda contra produção e registra pedidos de exportação reais, para
empresas reais.** As decisões que fecham isso — série, zero retentativa,
ausência de qualquer ação com efeito fiscal — estão explicadas em
[`docs/fluxo.md`](docs/fluxo.md#4-os-invariantes-da-suíte) e gravadas na
configuração, com a medição ao lado.

**O arquivo A1 é local e nunca é versionado.** `*.pfx`, `*.p12`, `*.pem` e
`*.key` estão no `.gitignore`, e o caminho vem de `E2E_CERT_PATH`. Se esta pasta
for compartilhada, movida para outro repositório ou arquivada, mova o A1 para
fora dela e dê a ele um nome neutro antes: **o nome do arquivo pode carregar dado
pessoal.**
