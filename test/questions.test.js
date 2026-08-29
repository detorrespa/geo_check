import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestions, allQuestions } from '../src/lib/questions.js';
import { availableSectors, getSector, SECTOR_LABELS } from '../src/lib/sectors/index.js';
import { brandNameInText } from '../src/lib/metrics.js';

const MARCAS_DE_PRUEBA = [
  'Nektiu',
  'Freshly Cosmetics',
  'Laboratorios Vidal',
  "L'Oréal",
  'Natura',      // subcadena de "natural": no debe contaminar nada
  'Natural',     // palabra entera de "cosmética natural": sí contamina
  'Digital',     // palabra corriente en tecnología
];

test('rellena todos los huecos de las plantillas', () => {
  const built = buildQuestions({ brand: 'Nektiu', sector: 'belleza', competitors: ['Sesderma'] });
  for (const q of allQuestions(built)) {
    assert.equal(/\{(marca|competidor|categoria|necesidad)\}/.test(q.text), false, `hueco sin rellenar: ${q.text}`);
    assert.equal(q.text.includes('  '), false, `espacio doble: ${q.text}`);
  }
});

test('INVARIANTE · ninguna pregunta discovery nombra a nadie', () => {
  for (const sector of availableSectors()) {
    for (const brand of MARCAS_DE_PRUEBA) {
      const competitors = ['Sesderma', 'Isdin'];
      const built = buildQuestions({ brand, sector, competitors });
      for (const q of built.discovery) {
        for (const name of [brand, ...competitors]) {
          assert.equal(
            brandNameInText(name, q.text),
            false,
            `[${sector}/${brand}] discovery nombra a «${name}»: ${q.text}`,
          );
        }
      }
    }
  }
});

test('avisa cuando la marca contamina las plantillas discovery', () => {
  // "Natural" es una palabra entera de la categoría "cosmética natural":
  // esas preguntas dejarían de ser discovery, así que se caen.
  const built = buildQuestions({ brand: 'Natural', sector: 'belleza' });
  assert.ok(built.warnings.length > 0, 'debería avisar de las descartadas');
  assert.ok(built.discovery.length < 11, 'y quedar con menos preguntas');
});

test('una marca que solo es subcadena de la categoría no descarta nada', () => {
  // "Natura" dentro de "natural" es el falso positivo que la coincidencia por
  // límites de palabra evita. Si esto se rompe, se pierden preguntas válidas.
  const built = buildQuestions({ brand: 'Natura', sector: 'belleza' });
  assert.equal(built.discovery.length, 11);
  assert.equal(built.warnings.length, 0);
});

test('los bloques traen 11 preguntas con una marca normal', () => {
  const built = buildQuestions({ brand: 'Nektiu', sector: 'tecnologia', competitors: ['Odoo', 'Holded'] });
  assert.equal(built.explicit.length, 11);
  assert.equal(built.discovery.length, 11);
  assert.equal(built.warnings.length, 0);
});

test('sin competidores no hay comparativas huérfanas y el bloque sigue completo', () => {
  for (const sector of availableSectors()) {
    const built = buildQuestions({ brand: 'Nektiu', sector, competitors: [] });
    for (const q of built.explicit) {
      assert.equal(q.text.includes(' con .'), false, `comparativa sin competidor: ${q.text}`);
      assert.equal(q.text.includes(' o ,'), false, `comparativa sin competidor: ${q.text}`);
    }
    // Cada sector necesita plantillas de reserva que no dependan del rival.
    assert.equal(built.explicit.length, 11, `[${sector}] bloque explícito incompleto sin competidores`);
    assert.equal(built.warnings.length, 0, `[${sector}] ${built.warnings.join(' / ')}`);
  }
});

test('solo se aceptan tres competidores', () => {
  const built = buildQuestions({
    brand: 'Nektiu',
    sector: 'belleza',
    competitors: ['A', 'B', 'C', 'D Cuarta'],
  });
  const texto = built.explicit.map((q) => q.text).join(' ');
  assert.equal(texto.includes('D Cuarta'), false);
});

test('cada pregunta lleva su bloque y no se mezclan', () => {
  const built = buildQuestions({ brand: 'Nektiu', sector: 'belleza', competitors: ['Isdin'] });
  assert.ok(built.explicit.every((q) => q.block === 'explicit'));
  assert.ok(built.discovery.every((q) => q.block === 'discovery'));
  assert.equal(allQuestions(built).length, built.explicit.length + built.discovery.length);
});

test('un sector inventado falla con un mensaje que lo explica', () => {
  assert.throws(() => getSector('inventado'), /Sector desconocido/);
});

test('el catálogo declara los diez sectores y todos tienen plantillas', () => {
  const ids = Object.keys(SECTOR_LABELS);
  assert.equal(ids.length, 10);
  assert.deepEqual([...availableSectors()].sort(), [...ids].sort());
  for (const sector of ids) {
    const built = buildQuestions({ brand: 'Nektiu', sector, competitors: ['Sesderma', 'Isdin'] });
    assert.equal(built.explicit.length, 11, `[${sector}] explícito incompleto`);
    assert.equal(built.discovery.length, 11, `[${sector}] discovery incompleto`);
    assert.equal(built.warnings.length, 0, `[${sector}] ${built.warnings.join(' / ')}`);
  }
});
