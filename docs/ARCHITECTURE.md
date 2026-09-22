# Arquitetura Sifistk

## Objetivo

Separar claramente cliente, servidor e administração para que o site possa ser divulgado por convite sem expor segredos.

### Camadas

1. **Web** — HTML/CSS/JS, sem chaves secretas.
2. **Backend** — autenticação, convites, sessões, pagamentos, verificação e integrações.
3. **Admin** — operações privilegiadas somente no servidor.
4. **Extensão** — cliente instalado no navegador, autenticado por sessão/pareamento.
5. **IA principal** — recurso de produto, sempre mediado pelo backend.
6. **IA de revisão** — canal separado, com credencial exclusiva no servidor; nunca embutir a chave na extensão ou no frontend.

## Privacidade de acesso

O endereço pode ser divulgado somente por você, mas a segurança não depende de esconder a URL. O backend exige convite para novos cadastros e o convite é de uso único e expirável.

## Produção

O GitHub é o repositório de código. O backend precisa de uma hospedagem que execute Node.js e de armazenamento persistente. O domínio público deve apontar para a hospedagem do servidor.

## Segredos

Nunca versionar:

- senhas;
- cookies;
- tokens de convite;
- chaves Asaas;
- chaves Resend;
- chaves de IA;
- dados reais de usuários.

Use secrets/env vars no provedor de deploy.
