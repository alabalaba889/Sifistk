# Sifistk — publicação

## Regra do projeto

O repositório contém o código-fonte. O site de produção deve ser publicado por um serviço que execute o backend Node.js. GitHub Pages e visualizadores de arquivos são estáticos e não substituem o servidor de autenticação.

## Desenvolvimento local

Para usar o site no mesmo computador:

```bash
npm install
npm start
```

Abra `http://localhost:8787/`. Não abra `web/index.html` diretamente e não use um endereço de `/archiveviewer/` para testar login, cadastro ou APIs.

Para abrir o site a partir de outro dispositivo na mesma rede, o backend precisa escutar a rede e o endereço público precisa apontar para o IP acessível do computador:

```text
HOST=0.0.0.0
SIFISTK_PUBLIC_ORIGIN=http://192.168.1.50:8787
PORT=8787
```

Substitua `192.168.1.50` pelo IP real do computador. Com `HOST=0.0.0.0`, o backend consegue responder na LAN; quando `SIFISTK_PUBLIC_ORIGIN` não é informado, o backend também usa o `Host` válido da requisição para formar URLs de convite.

## Extensão

A extensão usa `http://localhost:8787` por padrão. Para um servidor em outro endereço, informe a origem no campo **Servidor** do login. A extensão solicita somente a permissão de host necessária para aquela origem antes de tentar autenticar.

Os dois erros que motivaram esta revisão foram tratados:

- acesso da extensão à API sem permissão de host;
- falhas de rede aparecendo somente como `Failed to fetch`.

A extensão também verifica a saúde do servidor antes de enviar as credenciais.

## Acesso controlado

A aplicação foi preparada para exigir convite por padrão:

- `SIFISTK_INVITE_REQUIRED=true`;
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
