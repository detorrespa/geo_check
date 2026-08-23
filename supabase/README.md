# Despliegue de la fase 2

Proyecto: `orrevxnmrxskswgtfnmr` · el mismo que usará el Scan, con tablas
prefijadas `geo_`.

> **Antes de nada, comprueba la región** en Project Settings → General. Tiene
> que ser europea. Vas a guardar correos y cargos de leads reales, y la región
> no se puede cambiar después: si sale `us-east-1`, hay que borrar y recrear el
> proyecto. Ahora cuesta dos minutos porque está vacío.

## 1 · Esquema

`supabase/schema.sql` completo en **SQL Editor → New query**. Es idempotente,
así que se puede volver a ejecutar sin romper nada.

## 2 · Secretos de las funciones

```bash
supabase login
supabase link --project-ref orrevxnmrxskswgtfnmr
```

```bash
supabase secrets set OPENAI_API_KEY=... GOOGLE_API_KEY=... GOOGLE_MODEL=gemini-3.6-flash RATE_LIMIT_SALT=... ALLOWED_ORIGINS=https://geo.nektiu.com
```

`RATE_LIMIT_SALT` tiene que ser una cadena larga y aleatoria, y **no puede
cambiar**: al cambiarla, los contadores del día en curso dejan de coincidir y
todo el mundo recupera su cupo.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase; no se
declaran.

## 3 · Funciones

```bash
supabase functions deploy create-check run-check save-lead
```

## 4 · Comprobación

```bash
curl -X POST "https://orrevxnmrxskswgtfnmr.supabase.co/functions/v1/create-check" -H "apikey: <publishable>" -H "content-type: application/json" -d '{"brand":"Freshly Cosmetics","sector":"belleza","domain":"freshlycosmetics.es","competitors":["Sesderma","Isdin"]}'
```

Devuelve un `id` al instante. El progreso se consulta con la RPC pública:

```bash
curl -X POST "https://orrevxnmrxskswgtfnmr.supabase.co/rest/v1/rpc/geo_get_check" -H "apikey: <publishable>" -H "content-type: application/json" -d '{"p_id":"<id>"}'
```

## Cómo está montado

```
create-check   valida · interruptor · caché 30 días · límite IP · guarda · arranca el worker
run-check      22 preguntas × 2 motores, pool de 6, escribe cada respuesta al llegar
save-lead      el muro; guardar el lead es lo que desbloquea geo_get_report
```

El navegador **no lee tablas**. Ninguna tabla tiene políticas para `anon`, así
que no existe la consulta «dame todos los checks» — que expondría las marcas y
los dominios de tus leads. Solo hay dos funciones públicas:

| Función | Devuelve |
|---|---|
| `geo_get_check(uuid)` | Progreso y las dos cifras. Nada más |
| `geo_get_report(uuid)` | El informe completo, **o `null` si aún no hay lead** |

El muro está en la base de datos, no en el JavaScript: en el navegador
cualquiera lo salta con la consola abierta.

## Interruptor de apagado

```sql
update public.geo_config set value = 'false'::jsonb, updated_at = now() where key = 'enabled';
```

Sin desplegar y sin reiniciar nada. Los otros dos parámetros van igual:
`cache_days` y `max_checks_per_ip_per_day`.

## Mantenimiento

Los proyectos gratuitos de Supabase **se pausan tras una semana sin
actividad**. Un imán de captación puede pasar diez días sin visitas y el
siguiente visitante se encuentra el proyecto dormido. Un cron diario de
Cloudflare que llame a `geo_get_check` con un uuid cualquiera lo evita, y de
paso conviene purgar los textos guardados:

```sql
select public.geo_prune_responses(90);
```

Cada check ocupa unos 60 KB de respuestas. Con los 500 MB del plan gratuito
caben del orden de 8.000; las métricas ya están en columnas propias, así que
el texto solo hace falta mientras se genera el informe.

## Sin verificar

Nada de esto se ha ejecutado: en la máquina donde se escribió no hay CLI de
Supabase, ni Deno, ni Postgres. El SQL y las funciones están sin probar contra
un servidor real.

El punto más frágil es que las funciones importan la librería con rutas
relativas fuera de `supabase/functions` (`../../../src/lib/…`). Debería
funcionar, porque el CLI empaqueta el grafo de importaciones completo, pero si
el despliegue se queja de no encontrar los módulos la salida es copiar
`src/lib` dentro de `supabase/functions/_shared/lib`.
