# Sifistk Agent Architecture — v9

## Objetivo

A extensão deixou de ser um painel de comandos. O contrato principal agora é:

usuário → conversa → intenção → plano operacional → ferramentas permitidas → evidências → verificação → entrega

A UI expõe a conversa, o progresso e os resultados. As capacidades ficam atrás de um registro de ferramentas.

## Camadas

1. Agent UI (extension/agent.*): conversa, estado da tarefa, ferramentas usadas e confirmação de ações sensíveis.
2. Service Worker (extension/background.js): único executor das ferramentas de navegador, allowlist de ferramentas e acesso às APIs autorizadas. Nunca executa código arbitrário produzido pelo modelo.
3. Tool registry (extension/agent-tools.js): nome, finalidade, risco e permissão opcional.
4. Backend (backend/server.mjs): autenticação, sessão da extensão, endpoint do agente, registro de execuções e chamada server-side à API da IA.
5. Modelo: recebe instruções e schemas, escolhe ferramentas por intenção, recebe resultados reais e continua a tarefa.
6. Serviços externos: pesquisa web e futuros provedores de arquivos, código, CI, projetos e conectores.

## 230 capacidades

As 230 capacidades solicitadas são tratadas como capacidades de produto, não como 230 controles visuais.

| Família | Capacidades |
|---|---:|
| Pesquisa e navegação | 20 |
| Análise de sites | 20 |
| Criação e reconstrução | 20 |
| Código | 20 |
| Projetos | 20 |
| Arquivos | 20 |
| Debug e qualidade | 20 |
| Automação | 20 |
| IA e raciocínio operacional | 20 |
| Conversa | 20 |
| Segurança e controle | 20 |
| Experiência e inteligência do produto | 10 |
| Total | 230 |

Cada capacidade será ligada a uma ferramenta, um grupo de ferramentas ou uma habilidade do modelo. Uma capacidade só deve ser marcada como concluída quando houver implementação, integração, teste e evidência de execução.

## O que já é real nesta reconstrução

- conversa em Side Panel;
- envio de intenção natural;
- contexto da página atual;
- análise de página;
- captura de contexto;
- inspeção por seleção;
- recursos públicos;
- links;
- screenshot;
- abas, quando a permissão opcional é concedida;
- abertura de URL;
- geração/download de artefato textual;
- diagnóstico;
- tool calling server-side;
- web search hospedado, quando configurado;
- confirmação para operações de escrita;
- autenticação;
- logs de execução sem armazenar o conteúdo integral da conversa no backend;
- API key somente no backend.

## O que ainda NÃO deve ser declarado como concluído

A arquitetura está pronta para crescer, mas estas capacidades ainda exigem módulos reais antes de serem consideradas prontas:

- edição arbitrária de projetos locais;
- leitura arbitrária do filesystem do computador;
- execução de shell;
- execução de testes em um workspace real;
- criação de projetos completos;
- CI/CD;
- processamento avançado de PDFs/documentos;
- visão/análise de imagens enviada pelo usuário;
- streaming completo de texto e tool calls;
- retomada durável de jobs após reinício;
- pesquisa multiagente;
- integração com GitHub/Drive/etc. sem conectores autorizados;
- auditoria profissional de segurança;
- automação irrestrita do navegador.

Essas lacunas são intencionais: não existe implementação falsa para preencher a interface.

## Segurança

- Manifest V3.
- Sem código remoto.
- Sem eval/execução arbitrária.
- Ferramentas são allowlisted.
- activeTab é preferido para acesso temporário à página.
- Permissões amplas permanecem opcionais.
- A chave da IA fica no backend.
- O token de autenticação da extensão é mantido em storage.session, não no armazenamento persistente.
- Operações de escrita têm confirmação no cliente.
- O backend valida autenticação antes de aceitar uma execução do agente.

## Pesquisa profunda

A API da IA é usada server-side com function calling e web search. A arquitetura usa function calling para ferramentas próprias e web search para pesquisa atual.

## Critério de conclusão

Uma capacidade não é considerada pronta por existir no schema. O release gate deve exigir:

implementada → integrada → executada → resultado verificado → erro testado → permissão testada → logs revisados → CI verde
