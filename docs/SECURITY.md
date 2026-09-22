# Segurança Sifistk

- Convites são armazenados somente como hash.
- Sessões usam tokens aleatórios armazenados como hash.
- Senhas usam scrypt com salt aleatório.
- Cookies de sessão são HttpOnly e SameSite=Lax.
- APIs retornam JSON sem cache.
- O servidor aplica CSP e nosniff nos arquivos estáticos.
- Caminhos estáticos são normalizados e bloqueiam traversal.
- Administração exige sessão com papel SUPER_ADMIN.
- Bootstrap administrativo exige uma chave de ambiente e só funciona quando ainda não existe SUPER_ADMIN.
- Chaves de serviços externos nunca devem chegar ao navegador.

## Regra de produção

Antes de divulgar o endereço:

1. ativar HTTPS;
2. configurar armazenamento persistente;
3. configurar limites de requisição/rate limit;
4. configurar logs e auditoria;
5. configurar backup;
6. configurar domínio;
7. remover qualquer dado de teste;
8. testar login, convite, logout e recuperação;
9. revisar secrets do provedor.

O código atual é a base de desenvolvimento e não deve ser considerado uma auditoria de segurança de produção.
