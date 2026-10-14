# AGENTS.md

## Objetivo do projeto

- Automatizar um fluxo que será descrito pelo usuário, utilizando Playwright.
- A implementação deve ser orientada pelo fluxo informado pelo usuário.
- Antes de implementar, confirmar os passos, pré-condições, dados necessários e resultado esperado do fluxo; não presumir informações não fornecidas.
- O objetivo final da aplicação é baixar os arquivos do fluxo, e nada mais: nenhuma outra ação deve ser executada além do download.
- Não enviar, submeter, finalizar, imprimir, confirmar, arquivar, excluir ou alterar dados fora do indispensável para o download, sem aprovação explícita do usuário.
- O fluxo só é considerado concluído quando o download for realizado com sucesso e o arquivo baixado for verificado.

## Boas práticas de desenvolvimento

- Compreender a estrutura, as convenções e o código existente antes de fazer alterações.
- Fazer a menor alteração necessária para atender ao objetivo, sem introduzir mudanças não relacionadas.
- Manter funções e módulos pequenos, com nomes claros, responsabilidades únicas e pouca duplicação.
- Aplicar DRY (_Don't Repeat Yourself_): não duplicar lógica, conhecimento ou configuração; cada comportamento deve ter uma única fonte de verdade, extraída em função, módulo ou constante reutilizável quando reaproveitada em mais de um lugar.
- Aplicar KISS (_Keep It Simple, Stupid_): preferir a solução mais simples que atenda ao requisito atual; evitar complexidade antecipada, generalização prematura e camadas desnecessárias que ainda não são exigidas pelo problema concreto.
- Tratar erros explicitamente, preservar o contexto necessário para diagnóstico e evitar esconder falhas.
- Usar variáveis de ambiente e arquivos de configuração para URLs, credenciais e demais valores sensíveis; nunca versionar segredos.
- Manter as dependências justificadas, compatíveis e coerentes com o restante do projeto.
- Fixar versões exatas de todas as dependências, sem usar faixas (`^`, `~`, `>`, `x`) nem tags como `latest` ou `*`; instalar e atualizar sempre pelo gerenciador de pacotes para manter o lockfile consistente e versionado.
- Criar ou atualizar testes automatizados para validar os comportamentos alterados, incluindo casos de erro e situações-limite relevantes.
- Executar as verificações disponíveis — formatação, lint, verificação de tipos e testes — e informar claramente qualquer verificação que não possa ser executada.
- Documentar decisões, pré-requisitos, comandos de execução e premissas relevantes para a automação.
- Preservar alterações existentes do usuário e evitar artefatos, credenciais, dados de teste e arquivos temporários no repositório.

## Boas práticas de TypeScript

- Escrever todo o código, nomes de arquivos, identificadores e comentários em inglês.
- Nomenclatura:
  - Variáveis e funções em `camelCase`; classes, interfaces, tipos, enums e componentes em `PascalCase`.
  - Constantes de módulo e valores imutáveis compartilhados em `UPPER_SNAKE_CASE`.
  - Nomes de arquivos em `kebab-case`, exceto componentes, que seguem `PascalCase`, conforme a convenção já adotada no projeto.
  - Nomes devem ser descritivos e sem abreviações obscuras: `totalInvoiceAmount`, não `tIA`.
  - Funções começam com verbo (`calculateTotal`, `parseInvoiceXml`); booleanos usam prefixo `is`, `has`, `can` ou `should`.
  - Membros privados usam o modificador `private` ou `#`, mantendo o estado interno inacessível externamente.
- Evitar magic numbers e magic strings: extrair para constantes nomeadas, próximas ao uso ou em um módulo de constantes, incluindo a unidade no nome (`timeoutMs`, `valueInCents`).
- Manter funções curtas, com responsabilidade única, poucas linhas, retornos antecipados e baixo aninhamento; agrupar parâmetros em objeto quando houver mais de três.
- Tipagem explícita: evitar `any` (preferir `unknown` com narrowing), declarar o tipo de retorno em funções exportadas e preferir `type`/`interface` bem definidos.
- As classes básicas de páginas devem implementar interfaces que declarem seu contrato público (`class LoginPage implements LoginPageContract`), em vez de herdar de classes concretas; os consumidores devem depender da interface e não da implementação (depender de abstrações, e não de detalhes). Compartilhamentos entre páginas são modelados com interfaces estendendo interfaces (`interface X extends Y`), nunca com herança de classe.
- Modelar estados com unions discriminadas e propriedades opcionais somente quando fizer sentido, em vez de muitos campos independentes.
- Preferir `const`, objetos imutáveis e retorno de novas estruturas a mutação de parâmetros ou de estado compartilhado.
- Erros: lançar classes de erro específicas, com mensagens claras em inglês, preservando a causa original com `cause`; não usar exceções para controle de fluxo comum, não silenciar erros e sempre registrar o contexto necessário para diagnóstico.
- Em código assíncrono, tratar ou propagar as rejeições de forma explícita, sem promises flutuantes.
- Comentários explicam o porquê, nunca o óbvio, e devem ser mantidos atualizados; usar JSDoc nas APIs públicas exportadas.

## Boas práticas com Playwright

- Usar o Playwright Test e a configuração já existente no projeto; não introduzir uma ferramenta concorrente sem necessidade.
- Escrever os testes a partir do comportamento percebido pelo usuário, validando o resultado do fluxo e não detalhes internos da implementação.
- Preferir localizadores semânticos e acessíveis, como `getByRole`, `getByLabel`, `getByPlaceholder` e `getByText`; usar `data-testid` somente quando não houver alternativa estável.
- Evitar seletores frágeis baseados em estrutura do DOM, classes, CSS ou XPath, salvo quando forem realmente necessários.
- Nunca escrever marcação (HTML, CSS ou JavaScript) de forma literal dentro de um localizador: extrair para uma constante nomeada, reunida em um objeto `as const` declarado no page object que a usa, de modo que o markup da tela tenha uma única fonte de verdade e fique visível de relance.
- Quando um seletor de markup for mesmo necessário, registrar ao lado dele, com base em medição ou inspeção, por que nenhum localizador semântico o substitui — por exemplo, quando ele desambigua dois controles de mesmo nome acessível, algo que o casamento por substring não conseguiria separar. A extração para constante não reduz a fragilidade do seletor; o que a reduz é essa justificativa medida.
- Para um conjunto fechado de literais, preferir objeto `as const` a `enum`: `enum` é construção de runtime e só compensa quando existe um `switch` que exige exaustividade.
- Nunca usar `waitForTimeout`, sleeps ou esperas baseadas apenas em tempo; aguardar estados observáveis da página e usar asserções web-first do Playwright.
- Verificar o estado real da aplicação após cada ação relevante, incluindo carregamento, habilitação, resposta de API ou persistência, quando aplicável.
- Manter os testes independentes, usando nova página ou novo contexto quando necessário, e limpar corretamente o estado criado via fixtures, setup e teardown.
- Criar fixtures reutilizáveis de configuração e preparação de dados, sem esconder os passos essenciais do fluxo.
- Usar `baseURL` e variáveis de ambiente para configuração; não codificar credenciais, tokens ou dados sensíveis no código.
- Habilitar traces, capturas de tela e vídeos, pelo menos para depuração e falhas, configurando o armazenamento de forma segura e fora do versionamento.
- Executar localmente e em modo headed quando for necessário depurar; validar também nos navegadores e dispositivos relevantes antes de considerar o fluxo concluído.
- Configurar reintentos principalmente na CI e não usá-los para esconder testes instáveis; corrigir a causa da intermitência.
- Limpar os dados criados por cada execução e evitar que um teste dependa do estado deixado por outro.
- Não declarar a automação como concluída antes de executar os testes relevantes e conferir o resultado, incluindo o relatório de falhas.

## Dados sensíveis e privacidade

- Nunca escrever, copiar, colar ou codificar dados sensíveis no código, em testes, fixtures, exemplos, comentários, nomes de arquivos ou mensagens de erro e log.
- Considerar sensíveis, entre outros: credenciais, senhas, tokens, cookies, chaves de API, certificados, CPFs, CNPJs, documentos pessoais, endereços, telefones, e-mails, dados fiscais e financeiros, dados de clientes e arquivos baixados em ambiente real.
- Nunca enviar dados sensíveis a serviços externos, telemetria, logs remotos, issues, pull requests, commits, chats ou qualquer terceiro; em caso de necessidade real, pedir aprovação explícita do usuário e informar exatamente o que será enviado e para onde.
- Preferir dados sintéticos, fictícios ou claramente de exemplo em qualquer código, teste ou documentação versionada.
- Ler credenciais e dados sensíveis exclusivamente de variáveis de ambiente, arquivos de configuração ignorados pelo Git ou gerenciadores de segredos; nunca usá-las como valor padrão no código.
- Ao reportar erros e falhas, registrar apenas o contexto mínimo necessário ao diagnóstico, sem expor credenciais, dados pessoais ou conteúdo de documentos fiscais.
- Garantir que artefatos de execução (traces, screenshots, vídeos, downloads, logs, relatórios) fiquem fora do versionamento e sejam armazenados de forma segura, com cuidado redobrado por poderem conter dados reais.
- Antes de concluir qualquer tarefa, revisar o diff e confirmar que nenhum dado sensível foi introduzido, enviado ou versionado; se houver dúvida, perguntar ao usuário em vez de assumir.
- Nunca versionar segredos, arquivos `.env`, credenciais de ambiente e dados reais de teste; manter `.gitignore` atualizado e limpar arquivos sensíveis do histórico do repositório quando necessário.

## Consultar o usuário antes de alterar

- Sempre consultar e aguardar aprovação explícita do usuário antes de adicionar, atualizar, remover ou trocar versões de qualquer dependência.
- Sempre consultar e aguardar aprovação explícita antes de alterar, remover, renomear, mover, desabilitar, marcar como pendente (`test.skip`, `test.fixme`) ou enfraquecer qualquer teste existente, incluindo a remoção de asserções.
- Nesses casos, descrever o que será mudado e por quê, e aguardar a confirmação antes de executar.
- Se a alteração for indispensável para o objetivo do fluxo, explicar o impacto e pedir aprovação, em vez de decidir por conta própria.
- Se o usuário não responder, não prosseguir com a alteração pendente e registrar a questão como lacuna aberta.

## Fechamento de lacunas

- Antes de considerar qualquer tarefa concluída, revisar o plano-item a item e fechar todas as lacunas: pontos pendentes, decisões não tomadas, premissas não confirmadas, partes não implementadas e verificações não executadas.
- Não deixar TODOs, comentários do tipo "ajustar depois" ou etapas implícitas sem responsável; resolver ou registrar explicitamente como pendência com justificativa.
- Se alguma verificação ou item não puder ser concluído, informar claramente ao usuário o que ficou de fora e por quê, em vez de declarar a tarefa como pronta.
- Ao final, revisar o diff e confirmar que não há arquivos temporários, artefatos de execução, credenciais ou dados de teste versionados.
