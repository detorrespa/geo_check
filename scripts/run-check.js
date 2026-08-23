#!/usr/bin/env node
/**
 * CLI de la fase 1: ejecuta un check completo y enseña las dos cifras.
 *
 * Sin interfaz, sin base de datos, sin despliegue. Sirve para responder a la
 * única pregunta que importa antes de construir nada más: ¿aparece la brecha?
 *
 *   npm run check -- --marca "Freshly Cosmetics" --sector belleza \
 *     --competidores "Sesderma,Isdin" --dominio freshlycosmetics.com
 */
import { runCheck, competitorRanking } from '../src/lib/check.js';
import { configuredEngines, DEFAULT_ENGINES } from '../src/lib/engines/index.js';
import { availableSectors, SECTOR_LABELS } from '../src/lib/sectors/index.js';
import { formatPct } from '../src/lib/metrics.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
    args[key] = value;
  }
  return args;
}

function usage() {
  console.log(`
GEO Check · ejecución desde consola

  npm run check -- --marca "<marca>" --sector <sector> [opciones]

Opciones
  --marca         Nombre de la marca (obligatorio)
  --sector        ${availableSectors().join(' | ')}
  --competidores  Hasta tres, separados por comas
  --dominio       Dominio de la marca (solo se guarda; aún no se valida)
  --motores       Por defecto: ${DEFAULT_ENGINES.join(',')}
  --por-bloque    Preguntas por bloque (por defecto 11)
  --concurrencia  Llamadas en vuelo (por defecto 6)
  --json          Vuelca el resultado completo en JSON

Sectores con plantillas escritas: ${availableSectors().map((s) => `${s} (${SECTOR_LABELS[s]})`).join(', ')}
`);
}

function bar(done, total, width = 28) {
  const filled = Math.round((done / total) * width);
  return `[${'█'.repeat(filled)}${'·'.repeat(width - filled)}] ${done}/${total}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.marca || !args.sector) {
    usage();
    process.exit(args.marca && args.sector ? 0 : 1);
  }

  const engines = (args.motores || DEFAULT_ENGINES.join(',')).split(',').map((e) => e.trim());
  const competitors = (args.competidores || '').split(',').map((c) => c.trim()).filter(Boolean);

  // Antes de nada, enseñar qué se ha entendido: si las comillas se pierden por
  // el camino, se ve aquí y no en una cifra rara veinte llamadas después.
  console.log(`\nMarca:        ${args.marca}`);
  console.log(`Sector:       ${SECTOR_LABELS[args.sector] || args.sector}`);
  console.log(`Competidores: ${competitors.join(', ') || '—'}`);
  console.log(`Motores:      ${engines.join(', ')}\n`);

  const configured = configuredEngines();
  const missing = engines.filter((e) => !configured[e]);
  if (missing.length) {
    console.error(`✗ Sin clave para: ${missing.join(', ')}`);
    console.error('  Copia .env.example a .env y rellena las claves.\n');
    process.exit(1);
  }

  const result = await runCheck({
    brand: args.marca,
    domain: args.dominio || '',
    sector: args.sector,
    competitors,
    engines,
    perBlock: args['por-bloque'] ? Number(args['por-bloque']) : undefined,
    concurrency: args.concurrencia ? Number(args.concurrencia) : 6,
    onProgress: ({ done, total, record }) => {
      const mark = record.ok ? (record.brandMentioned ? '●' : '○') : '✗';
      const line = `${bar(done, total)}  ${mark} ${record.question.slice(0, 44)}`;
      // Redibujar sobre la misma línea solo sirve en un terminal; si la salida
      // está redirigida, `\r` no borra nada y deja un churro ilegible.
      if (process.stdout.isTTY) process.stdout.write(`\r${line.padEnd(90)}`);
      else console.log(line);
    },
  });

  if (process.stdout.isTTY) process.stdout.write(`\r${' '.repeat(90)}\r`);
  else console.log('');

  for (const w of result.warnings) console.log(`⚠ ${w}`);
  if (result.warnings.length) console.log('');

  const { explicit, discovery } = result.summary;

  console.log('─'.repeat(64));
  console.log(`  Cuando te nombran      ${formatPct(explicit.frequency).padStart(8)}   (${explicit.fraction} respuestas)`);
  console.log(`  Cuando NO te nombran   ${formatPct(discovery.frequency).padStart(8)}   (${discovery.fraction} respuestas)`);
  console.log('─'.repeat(64));

  console.log('\nPor motor');
  for (const [engine, blocks] of Object.entries(result.summary.byEngine)) {
    console.log(
      `  ${engine.padEnd(8)} nombrada ${formatPct(blocks.explicit.frequency).padStart(8)} (${blocks.explicit.fraction})` +
        `   ·   discovery ${formatPct(blocks.discovery.frequency).padStart(8)} (${blocks.discovery.fraction})`,
    );
  }

  const rivals = competitorRanking(result);
  if (rivals.length) {
    console.log('\nAparecen en tu lugar');
    for (const { name, mentions } of rivals) console.log(`  ${name.padEnd(24)} ${mentions} menciones`);
  }

  const failed = result.responses.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`\n${failed.length} respuesta(s) sin datos — fuera del denominador, no cuentan como "no te mencionan":`);
    for (const f of failed.slice(0, 5)) console.log(`  ${f.engine}: ${f.error}`);
  }

  console.log(`\n${result.responses.length} llamadas en ${(result.elapsedMs / 1000).toFixed(1)} s\n`);

  if (args.json) console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`);
  process.exit(1);
});
