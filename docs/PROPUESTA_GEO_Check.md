# Propuesta técnica · GEO Check (v2)

Basada en el `BRIEF_GEO_Check.md`, en el código de `geo_monitor`
(https://github.com/detorrespa/geo_monitor) y en las decisiones tomadas el 2026-08-23.

**Precios de API y planes: verificar los vigentes antes de cerrar presupuesto.** Las
cifras de este documento son órdenes de magnitud para decidir, no una cotización.

---

## 0. Decisiones cerradas

| Punto | Decisión |
|---|---|
| Motores | OpenAI + Google AI Overview |
| Sectores | Los 10 de la sección 4 |
| Informe | HTML en pantalla + correo HTML + **PDF adjunto** |
| Remitente | `clientes@nektiu.com` |
| Base del Scan | `ESIC/IA/PSOIA/ai4value-diagnostico` (aún sin construir) |
| Mercado | España, castellano |
| Repositorio | `geo_check/` (repo Git vacío ya creado). `geo_monitor` no se toca |

Pendiente: alojamiento (sección 3) y URL de agenda (sección 8).

---

## 1. Conclusión primero

**GEO Check no es un despliegue de GEO Monitor.** GEO Monitor es Python + Gradio +
LangGraph + Ollama (`gemma3:27b` local) + Qdrant + Langfuse + Docker. Nada de eso
corre en un despliegue serverless, ni responde en dos minutos desde un móvil, ni
cuesta céntimos.

Se reutiliza la **lógica de medición** —unas 60 líneas muy bien pensadas— portada a
JavaScript. El resto se descarta, y lo descartado es justo lo que diferencia al
Diagnóstico GEO: la separación técnica coincide con la comercial.

### Se porta

| Origen | Qué es | Por qué |
|---|---|---|
| `agents/metrics.py:9` `brand_name_in_response` | Match literal de marca (substring + dos tokens) | Es **la métrica del Check**. Determinista, sin LLM, sin coste |
| `agents/metrics.py:23` `strip_leading_prompt_echo` | Quita el eco del prompt antes de contar | Sin esto la marca "aparece" solo porque el modelo repite la pregunta. Es el fallo que invalidaría la cifra |
| `agents/metrics.py:45` `brand_in_model_answer` | Composición de las dos anteriores | La función que se llama en producción |
| `agents/prompt_generator.py:14` `filter_discovery_prompts` | Discovery limpio = el texto no contiene la marca | Garantiza que la segunda cifra mide lo que dice medir |
| `infrastructure/real_llm_clients.py` | Clientes con retry, timeout y respuesta normalizada | Patrón probado: `{engine, model, response, sources, latency_ms, error}` |

### Se descarta

Ollama y `gemma3:27b` (exige GPU siempre encendida) · `simulator.py` (el Check llama
a APIs reales, esa es su credibilidad) · `geo_scorer.py` y los 10 principios (fuera
de alcance) · `extractor.py` (hace una llamada LLM por respuesta y **su resultado se
sobrescribe** con el match literal en `extractor.py:56`: duplicaría el coste para
nada) · `evaluator/` · Qdrant, Langfuse, guardrails LLM, Docker · generación de
prompts con LLM (el brief ya decide plantillas).

---

## 2. Stack — alineado con el Scan, no con lo que yo habría elegido

He mirado `ai4value-diagnostico`. Su stack es:

```
Vite (vanilla JS, sin framework) + CSS propio con tokens
Funciones serverless en /api  ·  Supabase (auth + RLS + schema.sql idempotente)
Chart.js  ·  Vercel
```

**El GEO Check usa exactamente ese stack.** No Next.js, no React, no Tailwind. Las
razones pesan más que mi preferencia: las dos aplicaciones son hermanas y las
mantiene la misma persona; `src/styles/tokens.css` (navy `#1a3c5e`, orange
`#e8741a`, teal `#2e86ab`) y `public/legal.html` se copian tal cual y las dos
aplicaciones se parecen desde el primer día; y el patrón de proxy de
`api/ai.js` → `server/ai-handler.js` ya resuelve el "claves siempre en el servidor"
que pide el brief.

Un solo proyecto de Supabase para Scan y Check, con tablas prefijadas `geo_`, en la
misma línea que dice el brief.

---

## 3. Alojamiento — Pro y las alternativas reales

**Aviso primero:** el plan **Hobby de Vercel es para proyectos personales no
comerciales**. `geo.nektiu.com` es un imán de captación de una empresa. Hobby no es
una opción legítima aquí, independientemente de los límites técnicos. Conviene
confirmarlo en los términos vigentes antes de decidir.

| Opción | Coste | Duración de función | Veredicto |
|---|---|---|---|
| **Vercel Pro** | ~20 $/usuario/mes | hasta 300 s | **Recomendada.** Una sola cuenta cubre Scan y Check. Cero fricción: el Scan ya tiene carpeta `.vercel` |
| Vercel Hobby | 0 € | 60 s | Descartada: uso comercial no permitido |
| Vercel Hobby + worker en **Supabase Edge Functions** | 0 € + Supabase | ~150 s en la Edge Function | Técnicamente viable y elegante (el worker vive junto a la base de datos), pero sigue sin resolver el uso comercial del frontend en Hobby |
| **Cloudflare Pages + Workers** | 0 € hasta 100k req/día | Workers sin muro de reloj para `fetch`, con `waitUntil` | La alternativa gratuita seria. Permite uso comercial. Coste: flujo de despliegue distinto al del Scan, dos sitios en dos sitios |
| Netlify | 0 € (comercial permitido) | 10 s, background functions en plan de pago | Peor encaje que Cloudflare |
| Railway / Render / Fly | ~5 $/mes | sin límite | Solo si el worker crece; hoy es matar moscas a cañonazos |

**Recomendación: Vercel Pro.** 20 $/mes por tener las dos aplicaciones en el mismo
sitio, con el mismo despliegue y sin un problema de licencia pendiente, es barato.
Si el objetivo es coste cero, la alternativa honesta es **Cloudflare Pages +
Workers** para las dos aplicaciones — pero conviene decidirlo antes de construir el
Scan, no después.

---

## 4. Los dos motores — y el problema de Google AI Overview

**Google AI Overview no tiene API pública.** No existe un endpoint al que pedirle
«dame el resumen de IA para esta consulta». Hay tres caminos y no son equivalentes:

| Camino | Qué mide de verdad | Coste aprox. por check (22 consultas) | Problema |
|---|---|---|---|
| **A · SERP con AI Overview** (DataForSEO, Serper.dev, SerpAPI) | **El AI Overview real**, el que ve un cliente en Google hoy | 0,05–0,07 € con DataForSEO/Serper · ~0,25 € con SerpAPI | El AI Overview **no aparece en todas las consultas**. Denominador variable |
| **B · Gemini API con Google Search grounding** | Gemini con búsqueda. Se parece, no es lo mismo | 1.500 consultas/día gratis; después ~0,77 €/check | Fuera del tramo gratuito es **seis veces más caro que todo lo demás junto**. Y no es AI Overview |
| **C · Gemini sin grounding** | La memoria del modelo, sin web | ~0,01 € | Barato y honesto, pero ya no es "Google": es Gemini opinando de memoria |

**Recomendación: A, con validación medida antes de comprometerse.**

Es el único que permite decir en el informe *«esto es lo que Google le enseña hoy a
tu cliente»* sin asterisco. Y sale más barato que B.

El riesgo real de A es el denominador: si Google solo genera resumen de IA en, pongamos,
5 de las 11 preguntas discovery, la cifra se calcula sobre 5 respuestas y es frágil.
**Por eso la fase 1 incluye una medición explícita**: pasar las 22 plantillas de tres
sectores por el proveedor SERP con marcas reales y contar la tasa de aparición del
AI Overview en castellano.

- **≥ 60 %** → camino A, cerrado.
- **entre 30 % y 60 %** → camino A, pero subiendo a 15 preguntas discovery para que
  el denominador aguante.
- **< 30 %** → camino C, y en el informe el motor se llama «Gemini», no «Google AI
  Overview». Honestidad antes que marketing.

Esa medición cuesta unos 2 €, se hace en media mañana y evita construir el producto
sobre una suposición.

**El primer motor es OpenAI `gpt-4o-mini`** — barato, es el motor que el
interlocutor usa personalmente y ya está implementado en `real_llm_clients.py`.

### Coste por ejecución (camino A)

| Concepto | Coste |
|---|---|
| OpenAI `gpt-4o-mini` · 22 llamadas × ~800 tokens de salida | ~0,01 € |
| SERP con AI Overview · 22 consultas | ~0,06 € |
| Informe HTML + PDF · plantilla determinista, **0 llamadas LLM** | 0 € |
| **Total** | **≈ 0,07 € por check** |

Con caché de 30 días por dominio y 3 checks/día por IP, 500 ejecuciones únicas al
mes son unos 35 €. El proveedor SERP se contrata por paquetes: conviene empezar por
el más pequeño y el interruptor de apagado protege el resto.

---

## 5. Ejecución — 44 llamadas en menos de dos minutos desde un móvil

La tentación es una conexión SSE abierta 90 segundos. **No.** Las redes móviles la
cortan, un refresh la pierde y el límite de la función la mata.

1. `POST /api/checks` — valida, comprueba interruptor, caché de 30 días y límite por
   IP. Inserta `geo_checks` en estado `queued` con las 22 preguntas ya calculadas
   (las plantillas son deterministas: se conocen **antes** de ejecutar). Devuelve el
   `id` en menos de 300 ms.
2. Un worker recorre las preguntas con un pool de 6–8 concurrentes y escribe cada
   respuesta en `geo_check_responses` según llega.
3. El navegador se suscribe por **Supabase Realtime** a las filas de su `check_id`.
   La barra de progreso enseña las preguntas reales completándose — sin conexión
   larga, sobreviviendo al refresh y a un túnel de metro.
4. Al terminar, el worker calcula las dos frecuencias y pasa el check a `done`.

Tiempo estimado: 60–90 s. Objetivo de dos minutos con margen.

---

## 6. Las preguntas · 10 sectores

22 preguntas por check: 11 brand-explicit, 11 discovery. Plantillas JS por sector,
huecos rellenados desde el formulario. Sin LLM.

1. Belleza, cosmética y cuidado personal
2. Moda, calzado y accesorios
3. Alimentación y bebidas
4. Salud, bienestar y suplementos
5. Tecnología y software
6. Servicios profesionales y consultoría
7. Banca, seguros y servicios financieros
8. Turismo, hoteles y restauración
9. Educación y formación
10. Hogar, decoración y consumo

```js
// src/js/data/sectors/belleza.js
export const belleza = {
  label: 'Belleza, cosmética y cuidado personal',
  categorias: ['cosmética natural', 'cuidado facial', 'productos de belleza'],
  necesidades: ['piel sensible', 'rutina anti-edad', 'un regalo'],
  brandExplicit: [
    '¿Qué opinas de {marca}?',
    '¿Es {marca} una buena opción para {necesidad}?',
    'Compara {marca} con {competidor}.',
    // …
  ],
  discovery: [
    '¿Qué {categoria} me recomiendas para {necesidad}?',
    '¿Cuáles son las mejores opciones de {categoria} en España?',
    // …
  ],
}
```

**Invariante de seguridad**, portado de `filter_discovery_prompts`: antes de lanzar
se verifica que ninguna pregunta discovery contenga la marca ni sus tokens. Si una
plantilla se contamina —marcas cuyo nombre es una palabra genérica del sector— la
pregunta se descarta y se sustituye. Test automático sobre los 10 sectores × un
catálogo de marcas de prueba.

Detalle del camino A: para el motor Google la "pregunta" es una **consulta de
búsqueda**, no un prompt de chat. Las plantillas discovery ya tienen forma de
consulta («mejores X para Y», «qué X me recomiendas»), que además es la que más
dispara el AI Overview. Las brand-explicit funcionan igual de bien como consulta.

### Sobre la cifra que se enseña

Con 11 preguntas × 2 motores = 22 respuestas discovery, la resolución mínima es
1/22 = **4,5 %**. El ejemplo del brief («2,5 %») no es representable: las cifras
posibles son 0 %, 4,5 %, 9,1 %… Y con el camino A el denominador además varía.

Propuesta: enseñar la fracción junto al porcentaje.

> Apareces en **1 de cada 18** respuestas (5,6 %) cuando el cliente no te nombra.

Es más honesto, absorbe el denominador variable, y cuando el resultado es 0 de 18 es
muchísimo más contundente que un «0 %». Refuerza el argumento del brief: 20
preguntas detectan una diferencia enorme, no una diferencia fina.

---

## 7. Datos, informe y correo

### Supabase

Mismo estilo que `supabase/schema.sql` del Scan: un fichero idempotente, ejecutable
tantas veces como haga falta.

```sql
geo_checks (
  id uuid pk, created_at, status,            -- queued|running|done|failed|blocked
  brand_name, brand_domain, brand_domain_normalized,
  sector, competitors text[],
  questions jsonb,                            -- las 22, calculadas al crear
  freq_brand_explicit numeric, freq_discovery numeric,
  n_explicit int, n_discovery int,            -- denominadores, para la fracción
  mentions_explicit int, mentions_discovery int,
  engines text[], cost_cents int,
  ip_hash text, utm jsonb, error text
)

geo_check_responses (                          -- hasta 44 filas por check
  id, check_id fk, question, block,            -- explicit|discovery
  engine, model, response text, has_answer bool,
  brand_mentioned bool, brand_position int,
  competitors_mentioned text[], sources text[],
  latency_ms int, error text
)

geo_leads (
  id, check_id fk, email, name, company, role,
  consent bool, consent_at timestamptz, consent_text text,
  utm jsonb, created_at
)

geo_config (key, value jsonb)                  -- interruptor de apagado, límites
geo_rate_limit (ip_hash, day, count)
```

- **RLS activo.** `anon` no lee `geo_leads` ni `geo_check_responses` — el informe lo
  sirve el servidor. `anon` lee su propio `geo_checks` por id, y las respuestas por
  Realtime con política restringida a `check_id`.
- **Caché de 30 días**: índice único parcial sobre `brand_domain_normalized` con
  `created_at > now() - interval '30 days'`.
- **`ip_hash`**: SHA-256 de IP + salt de servidor. Nunca la IP en claro.
- **Interruptor**: fila en `geo_config`, leída en cada `POST /api/checks`. Se apaga
  sin desplegar.
- `has_answer` en `geo_check_responses` distingue «Google no generó resumen» de
  «Google generó resumen y no te menciona». Sin ese campo la métrica miente.

Pestaña nueva en el panel del Scan: checks ejecutados, estado, coste acumulado y
conversión a lead.

### Informe y PDF

Una sola plantilla HTML con hoja de estilo de impresión, que sirve para las tres
salidas: pantalla, cuerpo del correo y PDF.

Para el PDF, **`pdfmake`** — definición declarativa del documento, corre en Node sin
navegador. La alternativa es Chromium headless (`@sparticuz/chromium` + Puppeteer):
da un PDF idéntico al HTML pero pesa ~50 MB de bundle, arranca lento y encarece la
función. Con `pdfmake` se mantiene una segunda definición del documento, que es el
precio a pagar; para un informe de 3–4 páginas es asumible.

### Correo

**Resend**, remitente `clientes@nektiu.com`, `reply-to` al mismo. Requiere verificar
el dominio `nektiu.com` en Resend con registros **SPF, DKIM y DMARC** en el DNS —
tarea previa, no de última hora: sin ella el informe acaba en spam. Enlace de baja
en todos los correos.

### Legal

- Correo profesional como recomendación fuerte, **sin bloqueo**. Se valida el
  **dominio de la marca** (resolución DNS + `HEAD` al sitio) para evitar checks de
  marcas inventadas; el dominio del correo no se filtra.
- Un solo formulario: correo, empresa, cargo. Sin teléfono, sin doble muro.
- Casilla de consentimiento sin premarcar y separada del botón de envío. Se guarda
  el **texto literal** del consentimiento junto a la fecha y hora — mismo patrón que
  `terms_accepted_at` en el schema del Scan.
- `public/legal.html` del Scan como base, actualizado con esta finalidad y con la
  mención del tratamiento mediante modelos de lenguaje de terceros.
- Supabase en región EU. Revisar el DPA de OpenAI y del proveedor SERP.

---

## 8. Plan de entrega

| Fase | Contenido | Estimación |
|---|---|---|
| **0 · Medición del AI Overview** | 22 plantillas × 3 sectores × marcas reales contra el proveedor SERP. Decide camino A o C. Coste: ~2 € | 0,5 día |
| **1 · Núcleo medible** | Port de `metrics.py` a JS con tests. Cliente OpenAI + cliente SERP. Plantillas de 2 sectores. Script CLI que ejecuta un check completo e imprime las dos cifras. **Sin UI** | 1 día |
| **2 · Persistencia y ejecución** | `schema.sql` idempotente + RLS. `POST /api/checks`, worker con pool, Realtime. Caché 30 días, límite por IP, interruptor | 1,5 días |
| **3 · Producto** | Formulario, progreso con preguntas reales, pantalla de las dos cifras, muro de captura, informe en pantalla. Tokens y CSS del Scan. Móvil primero | 2 días |
| **4 · Correo, PDF y cierre** | Plantilla única HTML/impresión, PDF con `pdfmake`, Resend + DNS, consentimiento, oferta del Diagnóstico con enlace a agenda | 1,5 días |
| **5 · Salida** | Los 10 sectores completos. Dominio, analítica, pestaña en el panel del Scan, prueba de las 7 casillas de «Terminado significa» | 1 día |

**≈ 7,5 días de trabajo efectivo.**

El orden importa: la fase 0 cuesta 2 € y media mañana, y decide si el segundo motor
es «Google AI Overview» o «Gemini». La fase 1 decide si el producto funciona — al
terminarla ya se puede lanzar un check contra una marca real y ver si la brecha
aparece. Si no aparece, el resto no merece construirse todavía.

---

## 9. Lo que queda por decidir

1. **Alojamiento**: Vercel Pro (~20 $/mes, cubre Scan y Check) o Cloudflare Pages +
   Workers (0 €, comercial permitido, flujo distinto). Conviene decidirlo **antes**
   de construir el Scan.
2. **URL de agenda**: la última pantalla del Check ofrece el Diagnóstico GEO con un
   botón del tipo *«Reserva 30 minutos»*. Ese botón necesita apuntar a algún sitio:
   una página de reserva de citas (Cal.com, Calendly, HubSpot Meetings, TidyCal) con
   tu disponibilidad, donde la persona elige hueco sin escribirte. Si no tienes
   ninguna, la alternativa es un formulario de contacto en `nektiu.com` o un
   `mailto:` a `clientes@nektiu.com` — convierte peor, pero sirve para salir.
   **¿Cuál usas o quieres usar?**
3. **Proveedor SERP** para el AI Overview: DataForSEO o Serper.dev. Se elige en la
   fase 0 según cuál devuelva el AI Overview en castellano con más fiabilidad.

---

## 10. Lo que esta propuesta NO hace

Ni puntuación por los diez principios, ni auditoría técnica, ni verificación de
alucinación, ni benchmark estadístico, ni histórico para el cliente, ni cuentas de
usuario, ni un tercer motor. Todo eso vive en GEO Monitor y se vende como
Diagnóstico GEO.
