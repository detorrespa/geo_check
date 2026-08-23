/**
 * Banco común de plantillas.
 *
 * La forma de las preguntas apenas cambia entre sectores; lo que cambia es el
 * vocabulario (categorías y necesidades). Por eso el esqueleto vive aquí y
 * cada sector aporta su vocabulario más unas pocas plantillas propias: se
 * gana consistencia entre sectores sin perder el matiz de cada uno.
 *
 * Huecos disponibles:
 *   {marca}       nombre de la marca analizada
 *   {competidor}  uno de los competidores del formulario (rota por índice)
 *   {categoria}   categoría del sector (rota por índice)
 *   {necesidad}   situación de compra del sector (rota por índice)
 *
 * Regla inviolable: las plantillas discovery NO pueden contener {marca} ni
 * {competidor}. `buildQuestions` lo verifica y hay un test que lo cubre.
 */

export const BASE_EXPLICIT = [
  '¿Qué opinas de {marca}?',
  '¿Es {marca} una buena opción para {necesidad}?',
  'Compara {marca} con {competidor}.',
  '{marca} o {competidor}, ¿cuál recomiendas?',
  '¿Qué opiniones hay de {marca} en España?',
  '¿Es {marca} una marca fiable?',
  '¿Qué diferencia a {marca} de otras opciones de {categoria}?',
  '¿Merece la pena {marca}?',
];

export const BASE_DISCOVERY = [
  '¿Qué {categoria} me recomiendas para {necesidad}?',
  '¿Cuáles son las mejores opciones de {categoria} en España?',
  'Estoy buscando {categoria} para {necesidad}, ¿qué opciones tengo?',
  '¿Qué marcas de {categoria} están mejor valoradas?',
  '¿Qué {categoria} tiene mejor relación calidad-precio?',
  'Dame una lista de {categoria} recomendables para {necesidad}.',
  '¿Qué {categoria} recomiendan los expertos para {necesidad}?',
  '¿Cuáles son las empresas españolas de {categoria} más conocidas?',
];
