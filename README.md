# GEO Check · Nektiu

Cuánto aparece una marca en los motores generativos **cuando la nombran**
frente a cuánto aparece **cuando el cliente describe lo que necesita sin
nombrar a nadie**. Dos cifras, y nada más.

No es un diagnóstico. No puntúa los diez principios, no audita la web, no
verifica alucinación ni compara competidores con rigor estadístico. Eso es el
Diagnóstico GEO. El Check está diseñado para detectar **una diferencia enorme**,
y una diferencia enorme se ve con veinte preguntas.

Propuesta completa y decisiones: [`docs/PROPUESTA_GEO_Check.md`](docs/PROPUESTA_GEO_Check.md).

## Estado

**Fase 3 hecha y los diez sectores escritos.** El dominio de la marca se
comprueba. El informe se imprime desde el navegador y, si Resend está
configurado, se envía al guardar el lead. El PDF de servidor no está.

```
src/lib/
├── metrics.js          Métrica: mención, eco del prompt, agregación
├── questions.js        Plantillas rellenadas + invariante discovery
├── check.js            Orquestador con pool de concurrencia
├── sectors/            Vocabulario y plantillas por sector (2 de 10)
└── engines/            openai.js · gemini.js — mismo contrato
scripts/run-check.js    CLI
test/                   22 pruebas, sin dependencias
```

Cero dependencias de terceros: Node 20+ trae `fetch` y `node:test`.

## Arrancar

```bash
cp .env.example .env
npm install
npm run dev
```

La web queda en `http://localhost:5173`. Rellena también `OPENAI_API_KEY` y
`GOOGLE_API_KEY` si quieres lanzar un check desde consola:

```bash
npm run check -- --marca "Freshly Cosmetics" --sector belleza --competidores "Sesderma,Isdin"
```

Salida:

```
────────────────────────────────────────────────────────────────
  Cuando te nombran          81,8 %   (18 de 22 respuestas)
  Cuando NO te nombran        4,5 %   (1 de 22 respuestas)
────────────────────────────────────────────────────────────────
```

Pruebas:

```bash
npm test
```

## Publicar en geo.nektiu.com

Cloudflare Pages. El worker sigue en Supabase; aquí solo se sube el front.

1. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Repo `geo_check`, rama `main`.
3. Ajustes de build:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node: `20` o superior
4. Variables (Production):
   - `VITE_SUPABASE_URL` = `https://ulukwchahodwepyrnpvd.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = la clave publicable
5. **Custom domains** → `geo.nektiu.com`. Cloudflare te da el CNAME;
   añádelo en el DNS de `nektiu.com`.
6. En Supabase → Edge Functions → Secrets:
   `ALLOWED_ORIGINS` = `https://geo.nektiu.com,http://localhost:5173`

Sin el paso 6, cualquier web podría lanzar checks a tu costa.

## Tres decisiones que conviene conocer

**La cifra se enseña como fracción, no solo como porcentaje.** Con 11 preguntas
× 2 motores, la resolución mínima es 1/22 = 4,5 %: los porcentajes intermedios
no existen. «1 de cada 22» es más honesto, absorbe las respuestas que fallan y,
cuando el resultado es 0 de 22, pega mucho más fuerte que un «0 %».

**Una respuesta que no existe no cuenta como «no te mencionan».** Si un motor
falla, esa consulta sale del denominador. Meterla dentro hundiría la frecuencia
sin que hubiera pasado nada. Por eso `summarizeBlock` separa `attempted` de
`answers`.

**La mención se decide con una coincidencia literal, nunca preguntándole a un
modelo.** Es determinista, reproducible y gratis. La única sutileza es recortar
el eco de la pregunta: sin eso, una marca «aparece» solo porque el motor repitió
la pregunta que la nombraba.

## Diferencias respecto a GEO Monitor

La métrica es un port de `agents/metrics.py` de
[geo_monitor](https://github.com/detorrespa/geo_monitor), con dos cambios
deliberados:

- **Coincidencia por límites de palabra** en lugar de subcadena simple. Con
  subcadena, la marca «Natura» cuenta como mencionada cada vez que un motor
  escribe «cosmética natural». En una herramienta interna eso se detecta a ojo;
  en una aplicación pública publica una cifra inflada que nadie revisa.
- **La raya (—) cuenta como adorno de eco.** En castellano los modelos abren la
  respuesta con raya constantemente.

Y el motor de Google es Gemini con `google_search` activado — port de
`query_gemini`, con su cadena de modelos de reserva. **No es el AI Overview del
buscador**: Google no ofrece API para eso, y en el informe se llama «Google
(Gemini con búsqueda)» y no de otra manera.

## Siguiente

Fase 2: esquema de Supabase con RLS, `POST /api/checks`, worker y progreso por
Realtime, caché de 30 días por dominio, límite por IP e interruptor de apagado.

Antes hacen falta dos decisiones: alojamiento (Vercel Pro o Cloudflare) y la URL
de agenda del cierre.
