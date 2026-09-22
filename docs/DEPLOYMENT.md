# Sifistk — publicação

## Regra do projeto

O repositório contém o código-fonte. O site de produção deve ser publicado por um serviço que execute o backend Node.js. GitHub Pages é estático e não substitui o servidor de autenticação.

## Acesso controlado

A aplicação foi preparada para exigir convite por padrão:

- `SIFISTK_INVITE_REQUIRED=true`
- convites são de uso único;
- convites expiram;
- o token bruto não é salvo no banco;
- contas são criadas no backend;
- o frontend não contém segredos.

## Produção

1. Criar uma hospedagem Node.js.
2. Configurar as variáveis de ambiente a partir de `.env.example`.
3. Usar armazenamento persistente para `SIFISTK_STORE_PATH`.
4. Configurar HTTPS.
5. Configurar domínio oficial.
6. Só depois divulgar o link de produção.
7. Nunca colocar chaves Asaas, Resend, IA ou administração no frontend.

## GitHub

O repositório pode continuar público durante o desenvolvimento para facilitar revisão. Antes da publicação final, a visibilidade pode ser alterada para privada. No GitHub Free, mudar um repositório público para privado despublica automaticamente um GitHub Pages existente; por isso o site de produção não deve depender de GitHub Pages.

## Lovable

A pasta `web/` contém a entrada web e a interface inicial. O backend está separado em `backend/`. Essa separação facilita importar/reorganizar a interface posteriormente sem colocar segredos no cliente.
