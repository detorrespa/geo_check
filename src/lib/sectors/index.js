/**
 * Los 10 sectores del GEO Check (lista cerrada en el formulario).
 *
 * De momento hay dos escritos por completo — los suficientes para validar el
 * núcleo. Los ocho restantes son la fase 5: mismo formato, solo vocabulario.
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

const SECTORS = { belleza, tecnologia };

/** Catálogo completo, incluidos los ocho sectores aún sin plantillas. */
export const SECTOR_LABELS = {
  belleza: 'Belleza, cosmética y cuidado personal',
  moda: 'Moda, calzado y accesorios',
  alimentacion: 'Alimentación y bebidas',
  salud: 'Salud, bienestar y suplementos',
  tecnologia: 'Tecnología y software',
  servicios: 'Servicios profesionales y consultoría',
  finanzas: 'Banca, seguros y servicios financieros',
  turismo: 'Turismo, hoteles y restauración',
  educacion: 'Educación y formación',
  hogar: 'Hogar, decoración y consumo',
};

export function getSector(id) {
  const sector = SECTORS[id];
  if (!sector) {
    const pendiente = SECTOR_LABELS[id]
      ? ` («${SECTOR_LABELS[id]}» aún no tiene plantillas escritas)`
      : '';
    throw new Error(
      `Sector desconocido: "${id}"${pendiente}. Disponibles: ${Object.keys(SECTORS).join(', ')}`,
    );
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
