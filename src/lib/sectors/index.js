/**
 * Los 10 sectores del GEO Check (lista cerrada en el formulario).
 *
 * La forma de las preguntas vive en templates.js. Aquí solo hay vocabulario
 * y unas plantillas propias: el matiz de cada oficio, sin romper el esqueleto.
 */
import { BASE_EXPLICIT, BASE_DISCOVERY } from './templates.js';

export const belleza = {
  id: 'belleza',
  label: 'Belleza, cosmética y cuidado personal',
  categorias: ['cosmética natural', 'cuidado facial', 'productos de belleza'],
  necesidades: ['piel sensible', 'una rutina anti-edad', 'un regalo'],
  // Seis y no cuatro: sin competidores se caen las dos comparativas de la
  // base, y el bloque explícito tiene que llegar a once igualmente.
  extraExplicit: [
    '¿Qué tal son los productos de {marca}?',
    '¿Los productos de {marca} son adecuados para {necesidad}?',
    '¿Dónde puedo comprar {marca}?',
    '¿Cuáles son los productos más recomendados de {marca}?',
    '¿Qué ingredientes usa {marca}?',
    '¿Tiene buena reputación {marca} entre los dermatólogos?',
  ],
  extraDiscovery: [
    '¿Qué marcas de {categoria} son de confianza?',
    'Recomiéndame {categoria} de calidad para {necesidad}.',
    '¿Qué {categoria} compra la gente en España?',
    '¿Qué marcas de cosmética española merecen la pena?',
  ],
};

export const moda = {
  id: 'moda',
  label: 'Moda, calzado y accesorios',
  categorias: ['ropa', 'calzado', 'complementos'],
  necesidades: ['el día a día', 'una ocasión especial', 'renovar el armario'],
  extraExplicit: [
    '¿Qué tal es la ropa de {marca}?',
    '¿Los diseños de {marca} valen para {necesidad}?',
    '¿Dónde puedo comprar {marca}?',
    '¿Qué prendas de {marca} se recomiendan más?',
    '¿Cómo queda {marca} en talla y calidad?',
    '¿{marca} se considera una marca de moda fiable en España?',
  ],
  extraDiscovery: [
    '¿Qué marcas de {categoria} son de confianza?',
    'Recomiéndame {categoria} de calidad para {necesidad}.',
    '¿Qué {categoria} compra la gente en España?',
    '¿Qué marcas españolas de {categoria} merecen la pena?',
  ],
};

export const alimentacion = {
  id: 'alimentacion',
  label: 'Alimentación y bebidas',
  categorias: ['alimentación', 'bebidas', 'productos de la compra'],
  necesidades: ['el desayuno', 'una dieta equilibrada', 'la compra semanal'],
  extraExplicit: [
    '¿Qué tal saben los productos de {marca}?',
    '¿Los productos de {marca} encajan en {necesidad}?',
    '¿Dónde puedo comprar {marca}?',
    '¿Cuáles son los productos más conocidos de {marca}?',
    '¿{marca} usa ingredientes de calidad?',
    '¿Tiene buena reputación {marca} en la alimentación española?',
  ],
  extraDiscovery: [
    '¿Qué marcas de {categoria} son de confianza?',
    'Recomiéndame {categoria} de calidad para {necesidad}.',
    '¿Qué {categoria} compra la gente en España?',
    '¿Qué marcas españolas de {categoria} merecen la pena?',
  ],
};

export const salud = {
  id: 'salud',
  label: 'Salud, bienestar y suplementos',
  categorias: ['suplementos', 'productos de bienestar', 'cuidado de la salud'],
  necesidades: ['más energía', 'el día a día', 'cuidar la salud'],
  extraExplicit: [
    '¿Qué tal funcionan los productos de {marca}?',
    '¿Los productos de {marca} sirven para {necesidad}?',
    '¿Dónde puedo comprar {marca}?',
    '¿Qué productos de {marca} se recomiendan más?',
    '¿{marca} tiene aval científico o profesional?',
    '¿Tiene buena reputación {marca} entre quienes cuidan la salud?',
  ],
  extraDiscovery: [
    '¿Qué marcas de {categoria} son de confianza?',
    'Recomiéndame {categoria} de calidad para {necesidad}.',
    '¿Qué {categoria} compra la gente en España?',
    '¿Qué alternativas de {categoria} hay para {necesidad}?',
  ],
};

export const tecnologia = {
  id: 'tecnologia',
  label: 'Tecnología y software',
  categorias: ['software de gestión', 'herramientas digitales para empresas', 'soluciones tecnológicas'],
  necesidades: ['una pyme', 'digitalizar procesos internos', 'un equipo comercial'],
  extraExplicit: [
    '¿Qué tal funciona {marca}?',
    '¿Es {marca} adecuado para {necesidad}?',
    '¿Cuánto cuesta {marca}?',
    '¿Qué valoraciones tiene {marca}?',
    '¿Qué integraciones ofrece {marca}?',
    '¿{marca} funciona bien para una empresa española?',
  ],
  extraDiscovery: [
    '¿Qué {categoria} me conviene si tengo {necesidad}?',
    '¿Qué proveedores de {categoria} hay en España?',
    '¿Qué {categoria} usan las empresas para {necesidad}?',
    '¿Qué alternativas de {categoria} hay para {necesidad}?',
  ],
};

export const servicios = {
  id: 'servicios',
  label: 'Servicios profesionales y consultoría',
  categorias: ['consultoría', 'servicios profesionales', 'asesoría para empresas'],
  necesidades: ['una pyme', 'organizar la empresa', 'tomar mejores decisiones'],
  extraExplicit: [
    '¿Qué tal es el trabajo de {marca}?',
    '¿{marca} encaja si tengo {necesidad}?',
    '¿Cómo se contrata a {marca}?',
    '¿Qué valoraciones tiene {marca}?',
    '¿En qué se especializa {marca}?',
    '¿{marca} es una buena consultora para una empresa española?',
  ],
  extraDiscovery: [
    '¿Qué {categoria} me conviene si tengo {necesidad}?',
    '¿Qué proveedores de {categoria} hay en España?',
    '¿Qué {categoria} usan las empresas para {necesidad}?',
    '¿Qué alternativas de {categoria} hay para {necesidad}?',
  ],
};

export const finanzas = {
  id: 'finanzas',
  label: 'Banca, seguros y servicios financieros',
  categorias: ['seguros', 'servicios financieros', 'productos bancarios'],
  necesidades: ['una familia', 'una pyme', 'proteger el ahorro'],
  extraExplicit: [
    '¿Qué tal es {marca} como entidad?',
    '¿Los productos de {marca} sirven para {necesidad}?',
    '¿Cómo se contrata {marca}?',
    '¿Qué opiniones hay de {marca} entre clientes?',
    '¿{marca} tiene buenas condiciones y transparencia?',
    '¿Es {marca} una opción fiable en España?',
  ],
  extraDiscovery: [
    '¿Qué {categoria} me conviene si tengo {necesidad}?',
    '¿Qué proveedores de {categoria} hay en España?',
    '¿Qué {categoria} elige la gente para {necesidad}?',
    '¿Qué alternativas de {categoria} hay para {necesidad}?',
  ],
};

export const turismo = {
  id: 'turismo',
  label: 'Turismo, hoteles y restauración',
  categorias: ['hoteles', 'restaurantes', 'alojamiento en España'],
  necesidades: ['un fin de semana', 'una comida de empresa', 'unas vacaciones'],
  extraExplicit: [
    '¿Qué tal es la experiencia en {marca}?',
    '¿{marca} encaja para {necesidad}?',
    '¿Cómo se reserva {marca}?',
    '¿Qué opiniones hay de {marca} en viajes recientes?',
    '¿Qué destaca de {marca} frente a otras opciones?',
    '¿Merece la pena {marca} si buscas calidad en España?',
  ],
  extraDiscovery: [
    '¿Qué {categoria} recomiendan para {necesidad} en España?',
    '¿Qué {categoria} elige la gente en España?',
    '¿Qué {categoria} tienen mejor relación calidad-precio para {necesidad}?',
    '¿Qué alternativas de {categoria} hay para {necesidad}?',
  ],
};

export const educacion = {
  id: 'educacion',
  label: 'Educación y formación',
  categorias: ['formación', 'cursos online', 'educación para profesionales'],
  necesidades: ['cambiar de trabajo', 'un equipo', 'aprender una habilidad'],
  extraExplicit: [
    '¿Qué tal es la formación de {marca}?',
    '¿Los programas de {marca} sirven para {necesidad}?',
    '¿Cómo me inscribo en {marca}?',
    '¿Qué valoraciones tiene {marca}?',
    '¿{marca} tiene buen profesorado y temario?',
    '¿Es {marca} una buena escuela para profesionales en España?',
  ],
  extraDiscovery: [
    '¿Qué {categoria} me conviene si tengo {necesidad}?',
    '¿Qué proveedores de {categoria} hay en España?',
    '¿Qué {categoria} recomiendan para {necesidad}?',
    '¿Qué alternativas de {categoria} hay para {necesidad}?',
  ],
};

export const hogar = {
  id: 'hogar',
  label: 'Hogar, decoración y consumo',
  categorias: ['decoración', 'productos para el hogar', 'menaje'],
  necesidades: ['renovar una habitación', 'un piso nuevo', 'el día a día'],
  extraExplicit: [
    '¿Qué tal es la calidad de {marca}?',
    '¿Los productos de {marca} valen para {necesidad}?',
    '¿Dónde puedo comprar {marca}?',
    '¿Qué productos de {marca} se recomiendan más?',
    '¿Cómo es el diseño de {marca}?',
    '¿{marca} es una marca de hogar fiable en España?',
  ],
  extraDiscovery: [
    '¿Qué marcas de {categoria} son de confianza?',
    'Recomiéndame {categoria} de calidad para {necesidad}.',
    '¿Qué {categoria} compra la gente en España?',
    '¿Qué marcas españolas de {categoria} merecen la pena?',
  ],
};

const SECTORS = {
  belleza,
  moda,
  alimentacion,
  salud,
  tecnologia,
  servicios,
  finanzas,
  turismo,
  educacion,
  hogar,
};

export const SECTOR_LABELS = Object.fromEntries(
  Object.values(SECTORS).map((sector) => [sector.id, sector.label]),
);

export function getSector(id) {
  const sector = SECTORS[id];
  if (!sector) {
    throw new Error(`Sector desconocido: "${id}". Disponibles: ${Object.keys(SECTORS).join(', ')}`);
  }
  return {
    ...sector,
    explicit: [...BASE_EXPLICIT, ...(sector.extraExplicit || [])],
    discovery: [...BASE_DISCOVERY, ...(sector.extraDiscovery || [])],
  };
}

export function availableSectors() {
  return Object.keys(SECTORS);
}
