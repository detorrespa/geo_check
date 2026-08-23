/**
 * Construcción de las preguntas de un check.
 *
 * Sin LLM: plantillas por sector con los huecos rellenados desde el
 * formulario. Deterministas, así que las preguntas se conocen ANTES de
 * ejecutar — que es lo que permite enseñar la barra de progreso con las
 * preguntas reales apareciendo en pantalla.
 */
import { getSector } from './sectors/index.js';
import { brandNameInText } from './metrics.js';

export const DEFAULT_PER_BLOCK = 11;

function fill(template, { brand, competitors, categorias, necesidades }, i) {
  const competidor = competitors.length ? competitors[i % competitors.length] : '';
  return template
    .replaceAll('{marca}', brand)
    .replaceAll('{competidor}', competidor)
    .replaceAll('{categoria}', categorias[i % categorias.length])
    .replaceAll('{necesidad}', necesidades[i % necesidades.length])
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construye los dos bloques de preguntas.
 *
 * @returns {{explicit: object[], discovery: object[], warnings: string[]}}
 */
export function buildQuestions({ brand, sector, competitors = [], perBlock = DEFAULT_PER_BLOCK }) {
  const name = (brand || '').trim();
  if (!name) throw new Error('Falta el nombre de la marca');

  const s = getSector(sector);
  const rivals = competitors.map((c) => (c || '').trim()).filter(Boolean).slice(0, 3);
  const vocab = { brand: name, competitors: rivals, categorias: s.categorias, necesidades: s.necesidades };
  const warnings = [];

  // Sin competidores no tiene sentido preguntar "compara X con ___".
  const explicitTemplates = rivals.length
    ? s.explicit
    : s.explicit.filter((t) => !t.includes('{competidor}'));

  const explicit = explicitTemplates
    .map((t, i) => fill(t, vocab, i))
    .slice(0, perBlock)
    .map((text) => ({ text, block: 'explicit' }));

  // Invariante: una pregunta discovery no puede nombrar a nadie. Se verifica
  // sobre el texto YA relleno, no sobre la plantilla: el caso que se escapa es
  // el de marcas cuyo nombre es una palabra corriente del sector, donde la
  // categoría misma acaba nombrando a la marca.
  const named = [name, ...rivals];
  const discovery = [];
  const dropped = [];

  s.discovery.forEach((template, i) => {
    if (discovery.length >= perBlock) return;
    const text = fill(template, vocab, i);
    const offender = named.find((n) => brandNameInText(n, text));
    if (offender) {
      dropped.push({ text, offender });
      return;
    }
    discovery.push({ text, block: 'discovery' });
  });

  if (dropped.length) {
    warnings.push(
      `${dropped.length} pregunta(s) discovery descartadas por nombrar a «${dropped[0].offender}»: ` +
        `«${dropped[0].text}»`,
    );
  }
  if (discovery.length < perBlock) {
    warnings.push(
      `Solo ${discovery.length} de ${perBlock} preguntas discovery. El denominador será menor; ` +
        'la cifra se muestra como fracción, así que no miente, pero pierde resolución.',
    );
  }
  if (explicit.length < perBlock) {
    warnings.push(`Solo ${explicit.length} de ${perBlock} preguntas con marca explícita.`);
  }

  return { explicit, discovery, warnings };
}

/** Las dos listas juntas, en el orden en el que se ejecutan. */
export function allQuestions(built) {
  return [...built.explicit, ...built.discovery];
}
