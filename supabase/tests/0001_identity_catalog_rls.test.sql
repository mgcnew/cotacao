-- tests/0001_identity_catalog_rls.test.sql
-- Testes pgTAP básicos para isolamento da camada atual.
--
-- Observação:
-- Estes testes validam presença estrutural de RLS/policies/funções.
-- Testes completos de usuários simulados serão adicionados junto da
-- migration de provisionamento de empresa e helpers de teste.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_schema('private', 'schema private deve existir');

select has_function(
  'private',
  'is_company_member',
  array['uuid'],
  'is_company_member(uuid) deve existir'
);

select has_function(
  'private',
  'has_permission',
  array['uuid', 'text'],
  'has_permission(uuid,text) deve existir'
);

select has_table('public', 'companies', 'companies deve existir');
select has_table('public', 'company_members', 'company_members deve existir');
select has_table('public', 'roles', 'roles deve existir');
select has_table('public', 'permissions', 'permissions deve existir');
select has_table('public', 'products', 'products deve existir');
select has_table('public', 'categories', 'categories deve existir');
select has_table('public', 'units', 'units deve existir');

select policies_are(
  'public',
  'companies',
  array['companies_select_member'],
  'companies possui somente policy de leitura por membership nesta etapa'
);

select policies_are(
  'public',
  'profiles',
  array['profiles_select_self', 'profiles_update_self'],
  'profiles deve ser isolado ao próprio usuário'
);

select policies_are(
  'public',
  'products',
  array['products_insert_create', 'products_select_member', 'products_update_update'],
  'products deve possuir policies esperadas'
);

select policies_are(
  'public',
  'categories',
  array['categories_insert_create', 'categories_select_member', 'categories_update_update'],
  'categories deve possuir policies esperadas'
);

select policies_are(
  'public',
  'units',
  array['units_insert_manage', 'units_select_member', 'units_update_manage'],
  'units deve possuir policies esperadas'
);

select policies_are(
  'public',
  'roles',
  array['roles_insert_manage', 'roles_select_member', 'roles_update_manage'],
  'roles deve possuir policies esperadas'
);

select policies_are(
  'public',
  'company_members',
  array[
    'company_members_insert_manage',
    'company_members_select_same_company',
    'company_members_update_manage'
  ],
  'company_members deve possuir policies esperadas'
);

select policies_are(
  'public',
  'role_permissions',
  array[
    'role_permissions_delete_manage',
    'role_permissions_insert_manage',
    'role_permissions_select_member'
  ],
  'role_permissions deve possuir policies esperadas'
);

select policies_are(
  'public',
  'member_permission_overrides',
  array[
    'member_permission_overrides_delete_manage',
    'member_permission_overrides_insert_manage',
    'member_permission_overrides_select_member',
    'member_permission_overrides_update_manage'
  ],
  'overrides deve possuir policies esperadas'
);

select policies_are(
  'public',
  'product_attribute_values',
  array[
    'product_attribute_values_delete_manage',
    'product_attribute_values_insert_manage',
    'product_attribute_values_select_member',
    'product_attribute_values_update_manage'
  ],
  'product_attribute_values deve possuir policies esperadas'
);

select * from finish();

rollback;
