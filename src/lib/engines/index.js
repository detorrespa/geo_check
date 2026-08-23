/**
 * Registro de motores.
 *
 * Todos cumplen el mismo contrato:
 *   ask(question) -> { engine, model, text, sources, ok, error, latencyMs }
 *
 * Añadir el AI Overview real vía SerpApi el día que haga falta es escribir un
 * tercer archivo con esa forma y registrarlo aquí. Ni la métrica ni el
 * orquestador se enteran.
 */
import * as openai from './openai.js';
import * as gemini from './gemini.js';

export const ENGINES = { [openai.id]: openai, [gemini.id]: gemini };

export const DEFAULT_ENGINES = [openai.id, gemini.id];

export function getEngine(engineId) {
  const engine = ENGINES[engineId];
  if (!engine) {
    throw new Error(`Motor desconocido: "${engineId}". Disponibles: ${Object.keys(ENGINES).join(', ')}`);
  }
  return engine;
}

/** Qué motores tienen clave configurada ahora mismo. */
export function configuredEngines() {
  return Object.fromEntries(Object.values(ENGINES).map((e) => [e.id, e.configured()]));
}
