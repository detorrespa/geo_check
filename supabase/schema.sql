-- ============================================================
-- GEO Check · Nektiu
-- Esquema, RLS y funciones de acceso.
--
-- Ejecutar completo en: Supabase → SQL Editor → New query.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Convive con las tablas del Scan en el mismo proyecto; todo lo de aquí
-- lleva el prefijo geo_.
-- ============================================================

-- ── Configuración operativa ─────────────────────────────────
-- El interruptor de apagado vive aquí y no en una variable de entorno: se
-- apaga desde SQL en cinco segundos, sin desplegar nada.
create table if not exists public.geo_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.geo_config (key, value) values
  ('enabled',                  'true'::jsonb),
  ('cache_days',               '30'::jsonb),
  ('max_checks_per_ip_per_day', '3'::jsonb)
on conflict (key) do nothing;

-- ── Checks ──────────────────────────────────────────────────
create table if not exists public.geo_checks (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'failed')),

  brand_name              text not null,
  brand_domain            text not null default '',
  -- Clave de la caché de 30 días: minúsculas, sin protocolo y sin www.
  brand_domain_normalized text not null default '',
  sector                  text not null,
  competitors             text[] not null default '{}',

  -- Las 22 preguntas, calculadas al crear el check. La barra de progreso las
  -- enseña antes de que exista ninguna respuesta.
  questions   jsonb not null default '[]'::jsonb,
  engines     text[] not null default '{}',
  warnings    text[] not null default '{}',

  -- total_calls se conoce al crear el check (preguntas × motores). El
  -- progreso NO se guarda en una columna: se cuenta sobre las respuestas, que
  -- es la única fuente que no puede desincronizarse si el worker reintenta.
  total_calls integer not null default 0,

  -- Numerador y denominador por separado, no solo el porcentaje: la cifra se
  -- enseña como "1 de cada 22" y el denominador varía si un motor falla.
  mentions_explicit  integer,
  answers_explicit   integer,
  mentions_discovery integer,
  answers_discovery  integer,
  freq_explicit      numeric(5, 4),
  freq_discovery     numeric(5, 4),

  ip_hash text,
  utm     jsonb not null default '{}'::jsonb,
  error   text
);

-- Búsqueda de la caché: último check terminado de un dominio.
create index if not exists geo_checks_domain_idx
  on public.geo_checks (brand_domain_normalized, created_at desc)
  where status = 'done';

create index if not exists geo_checks_created_idx
  on public.geo_checks (created_at desc);

-- ── Respuestas ──────────────────────────────────────────────
create table if not exists public.geo_check_responses (
  id         bigint generated always as identity primary key,
  check_id   uuid not null references public.geo_checks (id) on delete cascade,
  created_at timestamptz not null default now(),

  question text not null,
  block    text not null check (block in ('explicit', 'discovery')),
  engine   text not null,
  model    text,
  response text,

  -- Distingue "el motor no contestó" de "contestó y no te menciona". Sin este
  -- campo, un fallo se contaría como ausencia de marca y hundiría la cifra.
  has_answer            boolean not null default false,
  brand_mentioned       boolean not null default false,
  brand_rank            integer,
  competitors_mentioned text[] not null default '{}',
  sources               text[] not null default '{}',
  latency_ms            integer,
  error                 text
);

create index if not exists geo_check_responses_check_idx
  on public.geo_check_responses (check_id, id);

-- Si el worker reintenta, la respuesta se sobrescribe en vez de duplicarse.
create unique index if not exists geo_check_responses_unique_idx
  on public.geo_check_responses (check_id, question, engine);

-- ── Leads ───────────────────────────────────────────────────
create table if not exists public.geo_leads (
  id         uuid primary key default gen_random_uuid(),
  check_id   uuid not null references public.geo_checks (id) on delete cascade,
  created_at timestamptz not null default now(),

  email    text not null,
  company  text,
  job_role text,

  -- El consentimiento se guarda con su texto literal: dentro de dos años hay
  -- que poder demostrar QUÉ aceptó esta persona, no solo que aceptó algo.
  consent      boolean not null default false check (consent),
  consent_at   timestamptz not null default now(),
  consent_text text not null,

  unsubscribed_at timestamptz,
  utm             jsonb not null default '{}'::jsonb
);

-- Un lead por check: el formulario se rellena una vez y no hay doble muro.
create unique index if not exists geo_leads_check_idx
  on public.geo_leads (check_id);

create index if not exists geo_leads_email_idx
  on public.geo_leads (lower(email));

-- ── Límite por IP ───────────────────────────────────────────
-- ip_hash es SHA-256 de la IP con una sal de servidor. Nunca la IP en claro:
-- una IP es un dato personal y aquí no se necesita, solo contar.
create table if not exists public.geo_rate_limit (
  ip_hash text not null,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (ip_hash, day)
);

-- ============================================================
-- RLS: nadie entra por la puerta principal
--
-- Ninguna tabla tiene políticas para anon. El navegador no lee tablas: lee
-- funciones que reciben el id del check. Así no existe la consulta "dame
-- todos los checks", que expondría las marcas y los dominios de tus leads.
-- Las escrituras las hace el worker con la service_role, que se salta el RLS.
-- ============================================================
alter table public.geo_config          enable row level security;
alter table public.geo_checks          enable row level security;
alter table public.geo_check_responses enable row level security;
alter table public.geo_leads           enable row level security;
alter table public.geo_rate_limit      enable row level security;

revoke all on table public.geo_config          from anon, authenticated;
revoke all on table public.geo_checks          from anon, authenticated;
revoke all on table public.geo_check_responses from anon, authenticated;
revoke all on table public.geo_leads           from anon, authenticated;
revoke all on table public.geo_rate_limit      from anon, authenticated;

-- ============================================================
-- Funciones internas (solo service_role)
-- ============================================================

create or replace function public.geo_config_value(p_key text, p_default jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.geo_config where key = p_key), p_default);
$$;

create or replace function public.geo_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.geo_config_value('enabled', 'true'::jsonb) #>> '{}')::boolean, true);
$$;

-- Último check terminado del mismo dominio dentro de la ventana de caché.
-- Si otra persona de la misma empresa lo pide, se le sirve este sin gastar.
create or replace function public.geo_find_cached(p_domain text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.geo_checks
   where brand_domain_normalized = p_domain
     and p_domain <> ''
     and status = 'done'
     and created_at > now() - make_interval(
           days => (public.geo_config_value('cache_days', '30'::jsonb) #>> '{}')::int)
   order by created_at desc
   limit 1;
$$;

-- Suma uno y dice si esa IP puede seguir. Atómico: dos peticiones a la vez no
-- se pisan.
create or replace function public.geo_touch_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := (public.geo_config_value('max_checks_per_ip_per_day', '3'::jsonb) #>> '{}')::int;
  v_count int;
begin
  if p_ip_hash is null or p_ip_hash = '' then
    return true;
  end if;

  -- El alias es obligatorio: dentro de ON CONFLICT DO UPDATE la tabla se
  -- referencia por su nombre o alias, nunca cualificada con el esquema.
  insert into public.geo_rate_limit as rl (ip_hash, day, count)
       values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, day)
    do update set count = rl.count + 1
    returning rl.count into v_count;

  return v_count <= v_limit;
end;
$$;

-- ============================================================
-- Funciones públicas (anon)
-- ============================================================

-- Lo que ve cualquiera que tenga el id: progreso y las dos cifras. Ni el
-- texto de las respuestas ni los competidores. Eso es el informe, y el
-- informe se cambia por el correo.
create or replace function public.geo_get_check(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',        c.id,
    'status',    c.status,
    'brand',     c.brand_name,
    'sector',    c.sector,
    'questions', c.questions,
    'done',      (select count(*) from public.geo_check_responses r where r.check_id = c.id),
    'total',     c.total_calls,
    'explicit',  jsonb_build_object(
                   'mentions',  c.mentions_explicit,
                   'answers',   c.answers_explicit,
                   'frequency', c.freq_explicit),
    'discovery', jsonb_build_object(
                   'mentions',  c.mentions_discovery,
                   'answers',   c.answers_discovery,
                   'frequency', c.freq_discovery),
    'hasLead',   exists (select 1 from public.geo_leads l where l.check_id = c.id),
    'error',     c.error,
    -- Para la barra: qué preguntas han terminado ya y si salió la marca.
    'progress',  coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'question',  r.question,
                            'block',     r.block,
                            'engine',    r.engine,
                            'answered',  r.has_answer,
                            'mentioned', r.brand_mentioned)
                          order by r.id)
                     from public.geo_check_responses r
                    where r.check_id = c.id), '[]'::jsonb)
  )
  from public.geo_checks c
  where c.id = p_id;
$$;

-- El informe completo. Devuelve null mientras no haya lead: el muro se aplica
-- en la base de datos, no en el JavaScript del navegador, donde cualquiera lo
-- salta con la consola abierta.
create or replace function public.geo_get_report(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.geo_leads l where l.check_id = p_id) then null
    else jsonb_build_object(
      'id',          c.id,
      'brand',       c.brand_name,
      'domain',      c.brand_domain,
      'sector',      c.sector,
      'competitors', to_jsonb(c.competitors),
      'createdAt',   c.created_at,
      'explicit',    jsonb_build_object(
                       'mentions',  c.mentions_explicit,
                       'answers',   c.answers_explicit,
                       'frequency', c.freq_explicit),
      'discovery',   jsonb_build_object(
                       'mentions',  c.mentions_discovery,
                       'answers',   c.answers_discovery,
                       'frequency', c.freq_discovery),
      'responses',   coalesce((
                       select jsonb_agg(jsonb_build_object(
                                'question',    r.question,
                                'block',       r.block,
                                'engine',      r.engine,
                                'model',       r.model,
                                'answered',    r.has_answer,
                                'mentioned',   r.brand_mentioned,
                                'rank',        r.brand_rank,
                                'competitors', to_jsonb(r.competitors_mentioned),
                                'sources',     to_jsonb(r.sources))
                              order by r.id)
                         from public.geo_check_responses r
                        where r.check_id = c.id), '[]'::jsonb)
    )
  end
  from public.geo_checks c
  where c.id = p_id;
$$;

-- ── Permisos de ejecución ───────────────────────────────────
-- Por defecto Postgres concede EXECUTE a public en cada función nueva, así
-- que hay que quitarlo explícitamente: si no, anon podría llamar a
-- geo_touch_rate_limit y agotarle el cupo a otro.
revoke all on function public.geo_config_value(text, jsonb)  from public, anon, authenticated;
revoke all on function public.geo_is_enabled()               from public, anon, authenticated;
revoke all on function public.geo_find_cached(text)          from public, anon, authenticated;
revoke all on function public.geo_touch_rate_limit(text)     from public, anon, authenticated;
revoke all on function public.geo_get_check(uuid)            from public, anon, authenticated;
revoke all on function public.geo_get_report(uuid)           from public, anon, authenticated;

grant execute on function public.geo_get_check(uuid)  to anon, authenticated;
grant execute on function public.geo_get_report(uuid) to anon, authenticated;

-- REVOKE ... FROM public quita también el permiso que service_role heredaba,
-- así que hay que devolvérselo: sin esto las Edge Functions no pueden ni
-- consultar el interruptor y todo devuelve error de permisos.
grant execute on function public.geo_config_value(text, jsonb) to service_role;
grant execute on function public.geo_is_enabled()              to service_role;
grant execute on function public.geo_find_cached(text)         to service_role;
grant execute on function public.geo_touch_rate_limit(text)    to service_role;
grant execute on function public.geo_get_check(uuid)           to service_role;
grant execute on function public.geo_get_report(uuid)          to service_role;

-- ============================================================
-- Purga de cuerpos de respuesta
--
-- Cada check guarda 44 respuestas completas: unos 60 KB. Con el plan
-- gratuito de Supabase (500 MB) eso son del orden de 8.000 checks. El texto
-- solo hace falta mientras se genera el informe; las métricas ya están
-- calculadas en columnas propias.
--
-- Programar con pg_cron, o llamarla desde el cron que mantiene vivo el
-- proyecto:  select public.geo_prune_responses(90);
-- ============================================================
create or replace function public.geo_prune_responses(p_days int default 90)
returns integer
language sql
security definer
set search_path = public
as $$
  with purged as (
    update public.geo_check_responses r
       set response = null
      from public.geo_checks c
     where r.check_id = c.id
       and r.response is not null
       and c.created_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*)::int from purged;
$$;

revoke all on function public.geo_prune_responses(int) from public, anon, authenticated;
grant execute on function public.geo_prune_responses(int) to service_role;
