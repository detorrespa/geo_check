/**
 * Métrica del GEO Check.
 *
 * Port de `agents/metrics.py` de GEO Monitor. Determinista, sin LLM y sin
 * coste: se cuenta si la marca aparece o no en cada respuesta, nada más.
 *
 * Lo único delicado es el eco del prompt. Varios motores empiezan repitiendo
 * la pregunta del usuario; si no se recorta, una marca "aparece" solo porque
 * el modelo repitió la pregunta que la nombraba. Ese es el fallo que
 * invalidaría la cifra entera, y por eso `stripLeadingPromptEcho` existe.
 */

// Caracteres de adorno que los motores dejan al empezar tras citar la pregunta.
// La raya y el semirraya (— –) no están en la versión de metrics.py y sí hacen
// falta: en castellano los modelos abren la respuesta con raya constantemente.
const ECHO_EDGE = ' \n\r\t-–—|*:>#"\'';

// Signos que rodean un token de marca sin formar parte de él.
const TOKEN_EDGE = /^[.,;:()"']+|[.,;:()"']+$/g;

function trimEchoEdge(text) {
  let i = 0;
  while (i < text.length && ECHO_EDGE.includes(text[i])) i += 1;
  return text.slice(i);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const boundaryCache = new Map();

/**
 * Coincidencia con límites de palabra.
 *
 * **Divergencia deliberada respecto a `metrics.py`**, que usa subcadena
 * simple. Con subcadena, la marca "Natura" cuenta como mencionada cada vez
 * que un motor escribe "cosmética natural" — un falso positivo que en una
 * herramienta interna se detecta a ojo, pero que en una aplicación pública
 * publica una cifra inflada sin que nadie lo revise.
 *
 * `\p{L}\p{N}` con la bandera `u` respeta acentos y ñ, y deja fuera la
 * puntuación, así que "¿Conoces Nektiu?" o "Nektiu," siguen contando.
 */
function containsWord(haystack, needle) {
  if (!needle) return false;
  let re = boundaryCache.get(needle);
  if (!re) {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'iu');
    boundaryCache.set(needle, re);
  }
  return re.test(haystack);
}

/**
 * ¿Contiene `text` la marca de forma literal?
 *
 * Dos vías: la marca completa, o —para marcas de varias palabras— sus dos
 * primeros tokens significativos por separado, que cubre "Laboratorios Vidal"
 * mencionada como "Vidal ... laboratorios".
 */
export function brandNameInText(brandName, text) {
  const brand = (brandName || '').toLowerCase().trim();
  const haystack = (text || '').toLowerCase();
  if (!brand || !haystack.trim()) return false;
  if (containsWord(haystack, brand)) return true;

  const parts = brand
    .split(/\s+/)
    .map((p) => p.replace(TOKEN_EDGE, ''))
    .filter((p) => p.length >= 3);

  if (parts.length >= 2) {
    return containsWord(haystack, parts[0]) && containsWord(haystack, parts[1]);
  }
  return false;
}

/**
 * Quita la pregunta del principio de la respuesta cuando el motor la cita.
 *
 * Prueba la coincidencia completa y luego prefijos de 280, 180 y 96
 * caracteres, porque algunos motores reformulan el final de la pregunta.
 */
export function stripLeadingPromptEcho(response, prompt) {
  if (!response) return '';
  const answer = response.trim();
  const question = (prompt || '').trim();
  if (question.length < 12) return answer;

  const answerLower = answer.toLowerCase();
  const questionLower = question.toLowerCase();

  if (answerLower.startsWith(questionLower)) {
    return trimEchoEdge(answer.slice(question.length));
  }

  for (const n of [280, 180, 96]) {
    const size = Math.min(n, questionLower.length);
    if (size < 12) continue;
    if (answerLower.startsWith(questionLower.slice(0, size))) {
      return trimEchoEdge(answer.slice(size));
    }
  }

  return answer;
}

/** Mención de marca en lo que el motor realmente aportó, sin el eco. */
export function brandInAnswer(brandName, prompt, response) {
  return brandNameInText(brandName, stripLeadingPromptEcho(response, prompt));
}

/** Competidores del formulario que aparecen en la respuesta, sin el eco. */
export function competitorsInAnswer(competitors, prompt, response) {
  const body = stripLeadingPromptEcho(response, prompt);
  return (competitors || []).filter((c) => brandNameInText(c, body));
}

/**
 * Puesto de la marca por orden de aparición frente a los competidores.
 * 1 = la primera que nombra el motor. `null` si no aparece.
 *
 * Alimenta el "y estos aparecen en tu lugar" del informe; no entra en la
 * cifra que se enseña en pantalla.
 */
export function mentionRank(brandName, competitors, prompt, response) {
  const body = stripLeadingPromptEcho(response, prompt).toLowerCase();
  const positionOf = (name) => {
    const n = (name || '').toLowerCase().trim();
    if (!n) return -1;
    // Mismos límites de palabra que `containsWord`, para que el puesto y la
    // mención nunca se contradigan.
    const match = body.match(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{N}])`, 'iu'),
    );
    return match ? match.index : -1;
  };

  const brandAt = positionOf(brandName);
  if (brandAt < 0) return null;

  const ahead = (competitors || [])
    .map(positionOf)
    .filter((at) => at >= 0 && at < brandAt).length;

  return ahead + 1;
}

/**
 * Agrega un bloque de respuestas a la cifra que se enseña.
 *
 * `answers` es el denominador y solo cuenta respuestas que existen. Una
 * consulta sin respuesta —el motor falló, o Google no generó resumen— no es
 * "no te mencionan": queda fuera. Contarla hundiría la frecuencia sin que
 * hubiera pasado nada.
 */
export function summarizeBlock(brandName, responses) {
  const usable = (responses || []).filter((r) => r.ok && r.text);
  const mentions = usable.filter((r) => brandInAnswer(brandName, r.question, r.text)).length;
  const answers = usable.length;

  return {
    answers,
    mentions,
    attempted: (responses || []).length,
    frequency: answers ? mentions / answers : null,
    // "1 de cada 22" — absorbe el denominador variable y es más honesto que
    // un porcentaje con una resolución que no tenemos.
    fraction: answers ? `${mentions} de ${answers}` : 'sin datos',
  };
}

/** Las dos cifras del Check, más el reparto por motor para el informe. */
export function summarize(brandName, responses) {
  const explicit = (responses || []).filter((r) => r.block === 'explicit');
  const discovery = (responses || []).filter((r) => r.block === 'discovery');

  const byEngine = {};
  for (const r of responses || []) {
    byEngine[r.engine] ||= { explicit: [], discovery: [] };
    byEngine[r.engine][r.block].push(r);
  }

  return {
    explicit: summarizeBlock(brandName, explicit),
    discovery: summarizeBlock(brandName, discovery),
    byEngine: Object.fromEntries(
      Object.entries(byEngine).map(([engine, blocks]) => [
        engine,
        {
          explicit: summarizeBlock(brandName, blocks.explicit),
          discovery: summarizeBlock(brandName, blocks.discovery),
        },
      ]),
    ),
  };
}

/** Porcentaje con un decimal, o "—" cuando no hay denominador. */
export function formatPct(frequency) {
  if (frequency === null || frequency === undefined) return '—';
  return `${(frequency * 100).toFixed(1).replace('.', ',')} %`;
}
