# Migrations 0001–0003

Arquivos:
- 0001_base_infrastructure.sql
- 0002_identity_and_access.sql
- 0003_catalog.sql

Principais decisões já aplicadas:
- schema privado para funções internas;
- `profiles.id` ligado a `auth.users.id`;
- criação automática de profile;
- usuários podem participar de várias empresas;
- papel + overrides de permissão;
- FKs compostas para impedir cruzamento entre tenants;
- produtos com unidade de compra, precificação e comparação;
- atributos adicionais por categoria ou produto;
- RLS já habilitado, mas as policies serão adicionadas em migration própria;
- valores críticos usam `numeric`, não `float`.

Fluxo local recomendado:

```bash
supabase start
supabase db reset
```

Para aplicar somente migrations pendentes:

```bash
supabase migration up
```

Ainda não considerar o banco pronto para uso pelo frontend antes das migrations de RLS/policies.

## Etapa 0004–0005 — Segurança

Novos arquivos:

- `0004_security_rls_identity_catalog.sql`
  - `private.is_company_member(uuid)`
  - `private.current_company_member_id(uuid)`
  - `private.has_permission(uuid,text)`
  - grants para `authenticated`
  - revogação operacional de `anon`
  - policies RLS para Identity/Access e Catalog

- `0005_seed_permissions.sql`
  - catálogo idempotente de permissões da V1

- `tests/0001_identity_catalog_rls.test.sql`
  - smoke tests pgTAP de funções, tabelas e policies

### Importante

Esta etapa cobre apenas as tabelas existentes até `0003_catalog.sql`.
Cada nova migration de domínio (fornecedores, rodadas, pedidos etc.) deverá
habilitar RLS imediatamente e receber policies antes de ser consumida pelo frontend.

### Execução local

```bash
supabase db reset
supabase test db
```

Se a versão local do CLI usar outra forma de executar testes, consulte:

```bash
supabase test --help
```

## Etapa 0009–0012 — Núcleo final da V1

- `0009_purchase_allocations.sql`
  - alocação de compra
  - validação de resposta/fornecedor/item/rodada

- `0010_orders.sql`
  - pedidos
  - revisões imutáveis
  - itens por revisão
  - divergências pré-entrega

- `0011_receiving.sql`
  - recebimentos
  - quantidades logística e financeira
  - preço praticado
  - divergências comerciais

- `0012_public_access_communication_events.sql`
  - tokens públicos com hash
  - logs de comunicação
  - notificações
  - domain events
  - audit logs

A criação/alteração de estados críticos continuará sendo feita por RPCs/ações
transacionais, e não por UPDATEs livres no frontend.
