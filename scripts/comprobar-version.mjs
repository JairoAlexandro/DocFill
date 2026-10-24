// Se ejecuta antes de publicar una versión del programa de escritorio (npm run escritorio:publicar).
// Para que nadie publique sin subir la versión, por pequeño que sea el cambio, comprueba que:
//   1. El repositorio de GitHub está configurado en package.json (build.publish).
//   2. La versión de package.json es MAYOR que la última publicada en GitHub Releases.
//   3. build/release-notes.md tiene las notas de ESTA versión (un título «## x.y.z»).
// Si algo falla, se detiene y explica qué hacer. No modifica nada.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const publish = pkg.build?.publish?.[0];

const fail = (msg) => {
  console.error(`\n✗ No se puede publicar todavía.\n\n${msg}\n`);
  process.exit(1);
};

const parse = (v) => String(v).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
const isNewer = (a, b) => {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

// Solo se publica desde main: es la rama de producción (lo revisado). Se lee .git/HEAD sin ejecutar git.
try {
  const head = (await readFile(join(root, '.git', 'HEAD'), 'utf8')).trim();
  const branch = head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : '(sin rama)';
  if (branch !== 'main') {
    fail(`Estás en la rama «${branch}». Las versiones del programa solo se publican desde «main» (producción).\nUne antes tus cambios: develop → main.`);
  }
} catch {
  /* sin carpeta .git: no se comprueba la rama */
}

if (!publish?.owner || String(publish.owner).startsWith('CAMBIA')) {
  fail('Configura el repositorio de GitHub en package.json → build.publish (owner y repo).');
}

// Última versión publicada (si el repositorio es privado hace falta GH_TOKEN en las variables de entorno).
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'docfill-comprobar-version' };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
let latest = null;
try {
  const res = await fetch(`https://api.github.com/repos/${publish.owner}/${publish.repo}/releases/latest`, { headers });
  if (res.ok) latest = (await res.json()).tag_name;
  else if (res.status !== 404) fail(`GitHub respondió ${res.status} al consultar la última versión. Revisa la conexión o GH_TOKEN.`);
} catch {
  fail('No se pudo consultar GitHub. Revisa la conexión a internet.');
}

if (latest && !isNewer(version, latest)) {
  fail(
    `La versión de package.json (${version}) no es mayor que la última publicada (${latest}).\n` +
      'Cada publicación necesita una versión nueva, aunque sea un arreglo pequeño:\n' +
      '  npm run version:parche   → arreglos (0.1.0 → 0.1.1)\n' +
      '  npm run version:menor    → funciones nuevas (0.1.0 → 0.2.0)\n' +
      '  npm run version:mayor    → cambios grandes (0.1.0 → 1.0.0)',
  );
}

let notes = '';
try {
  notes = await readFile(join(root, 'build', 'release-notes.md'), 'utf8');
} catch {
  /* se avisa abajo */
}
const heading = new RegExp(`^##\\s*v?${version.replace(/\./g, '\\.')}\\s*$`, 'm');
if (!heading.test(notes)) {
  fail(
    `Faltan las notas de la versión ${version} en build/release-notes.md.\n` +
      `Escribe un título «## ${version}» y debajo qué ha cambiado (lo verán los usuarios al actualizar).\n` +
      'Si la actualización debe ser obligatoria, añade #obligatoria en las notas.',
  );
}

const mandatory = /#obligatoria|#mandatory/i.test(notes);
console.log(`\n✓ Versión ${version} lista para publicar${latest ? ` (la última publicada es ${latest})` : ' (será la primera)'}.`);
console.log(mandatory ? '  ⚠ Es una actualización OBLIGATORIA: los usuarios no podrán seguir sin actualizar.\n' : '  Actualización opcional: los usuarios podrán continuar sin actualizar.\n');
