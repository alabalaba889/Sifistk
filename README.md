# Sifistk

Projeto oficial da Sifistk: site, autenticação, acesso por convite, backend e futura integração com extensão, verificação, pagamentos e IA.

## Fluxo de acesso

**divulgação → pessoa comenta ou chama no privado → você envia um convite → cadastro/login → área Sifistk.**

O endereço pode até ser descoberto, mas o cadastro novo continua protegido pelo backend. Convites são de uso único e expiram.

## Estrutura

- `web/` — interface web.
- `backend/` — servidor Node.js e APIs.
- `extension/` — integração da extensão.
- `admin/` — administração.
- `docs/` — arquitetura, publicação e segurança.
- `tests/` — testes.

## Desenvolvimento

```bash
npm test
npm start
```

Não abra arquivos HTML diretamente para testar APIs. Execute o servidor Node.

## Produção

GitHub é o centro do código. O site de produção deve usar uma hospedagem Node.js para executar o backend e um armazenamento persistente. GitHub Pages é somente estático e não substitui autenticação, convites ou APIs.

O repositório está público enquanto o desenvolvimento está sendo feito para permitir acesso ao código. Antes da etapa final, você pode torná-lo privado. No GitHub Free, a mudança de público para privado despublica um GitHub Pages existente, então a publicação final deve estar separada do repositório.

## Segurança

Nunca coloque senhas, tokens ou chaves de API em commits. Use variáveis de ambiente/secrets do provedor.

Consulte `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` e `docs/SECURITY.md`.
