begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  parent_id uuid,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, parent_id)
    references public.categories(company_id, id) on delete restrict
);

create index categories_company_id_idx on public.categories(company_id);
create index categories_parent_id_idx on public.categories(parent_id);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create table public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  symbol text not null,
  kind text not null default 'other'
    check (kind in ('mass','count','package','volume','length','area','other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);

create index units_company_id_idx on public.units(company_id);

create trigger units_set_updated_at
before update on public.units
for each row execute function private.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category_id uuid not null,
  name text not null,
  description text,
  photo_path text,
  purpose text not null default 'resale'
    check (purpose in ('resale','internal','production','packaging','other')),
  purchase_unit_id uuid not null,
  pricing_unit_id uuid not null,
  comparison_unit_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete restrict,
  foreign key (company_id, purchase_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, pricing_unit_id)
    references public.units(company_id, id) on delete restrict,
  foreign key (company_id, comparison_unit_id)
    references public.units(company_id, id) on delete restrict
);

create index products_company_id_idx on public.products(company_id);
create index products_category_id_idx on public.products(category_id);
create index products_company_name_idx on public.products(company_id, name);
create index products_purchase_unit_idx on public.products(purchase_unit_id);
create index products_pricing_unit_idx on public.products(pricing_unit_id);

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create table public.product_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category_id uuid,
  product_id uuid,
  name text not null,
  key text not null,
  data_type text not null
    check (data_type in ('text','numeric','boolean')),
  unit_id uuid,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check (num_nonnulls(category_id, product_id) = 1),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, category_id)
    references public.categories(company_id, id) on delete cascade,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade,
  foreign key (company_id, unit_id)
    references public.units(company_id, id) on delete restrict
);

create unique index product_attribute_definitions_category_key_uidx
on public.product_attribute_definitions(company_id, category_id, key)
where category_id is not null;

create unique index product_attribute_definitions_product_key_uidx
on public.product_attribute_definitions(company_id, product_id, key)
where product_id is not null;

create index product_attribute_definitions_category_idx
on public.product_attribute_definitions(category_id);

create index product_attribute_definitions_product_idx
on public.product_attribute_definitions(product_id);

create trigger product_attribute_definitions_set_updated_at
before update on public.product_attribute_definitions
for each row execute function private.set_updated_at();

create table public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  attribute_definition_id uuid not null,
  value_text text,
  value_numeric numeric(18,6),
  value_boolean boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, attribute_definition_id),
  check (num_nonnulls(value_text, value_numeric, value_boolean) = 1),
  foreign key (company_id)
    references public.companies(id) on delete restrict,
  foreign key (company_id, product_id)
    references public.products(company_id, id) on delete cascade,
  foreign key (company_id, attribute_definition_id)
    references public.product_attribute_definitions(company_id, id) on delete cascade
);

create index product_attribute_values_company_id_idx
on public.product_attribute_values(company_id);

create index product_attribute_values_product_idx
on public.product_attribute_values(product_id);

create index product_attribute_values_definition_idx
on public.product_attribute_values(attribute_definition_id);

create trigger product_attribute_values_set_updated_at
before update on public.product_attribute_values
for each row execute function private.set_updated_at();

alter table public.categories enable row level security;
alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.product_attribute_definitions enable row level security;
alter table public.product_attribute_values enable row level security;

commit;
