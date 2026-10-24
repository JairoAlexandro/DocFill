import type { Candidate, Paragraph } from './types';
import { LETTERS, NAME_SEQ, fold, normalizeKey } from './text';

/** Nombres de pila frecuentes (sin tildes, en minúscula). Sirven para reconocer personas sin usar IA. */
const FIRST_NAMES = new Set(
  `antonio jose manuel francisco david juan javier daniel carlos jesus alejandro miguel rafael pedro pablo angel sergio
  fernando jorge luis alberto alvaro adrian diego raul ivan enrique ramon ruben oscar vicente andres joaquin santiago
  victor eduardo mario roberto jaime marcos ignacio alfonso jordi hugo salvador ricardo emilio guillermo gabriel marc
  mohamed julian julio tomas agustin cristian martin nicolas felix samuel ismael joan gonzalo hector lucas mariano
  sebastian cesar domingo xavier gregorio borja aitor iker unai asier mikel josu inaki xabier eneko gorka jon ander pau
  oriol pol arnau sergi albert gerard marti iago xoan brais anxo lorenzo leonardo mateo leo bruno thiago dario rodrigo
  izan eric aaron alex marco elias benito alfredo arturo bernardo cristobal ernesto esteban eugenio federico fidel
  gerardo gustavo horacio humberto lazaro leandro marcelo mauricio maximo moises nestor octavio patricio rogelio saul
  teodoro valentin joel nil biel gael enzo luca liam alonso juanjo chema txema paco pepe manolo kike nacho
  maria carmen ana isabel laura cristina marta dolores francisca lucia antonia pilar elena paula sara rosa raquel
  manuela mercedes concepcion julia beatriz silvia nuria irene patricia rocio andrea encarnacion montserrat monica alba
  alicia sonia sandra angela marina rosario teresa susana yolanda margarita natalia inmaculada claudia eva noelia sofia
  carla esther veronica nerea angeles amparo carolina victoria lorena miriam ines gloria emilia daniela alejandra lidia
  aurora ainhoa olga celia virginia fatima consuelo milagros soledad josefa luisa adriana diana valeria martina jimena
  vega ariadna noa lola chloe abril aitana blanca iratxe itziar maite leire amaia nekane begona arantxa idoia garazi
  uxue montse neus merce laia ester judith xenia uxia iria antia sabela xiana catalina estefania gemma graciela
  guadalupe ingrid jessica josefina leticia lourdes macarena magdalena micaela nieves noemi pamela purificacion
  remedios ruth salome tamara trinidad vanesa ximena rebeca marisa maribel mari conchi pepa charo lucía elisa elsa
  emma olivia mia candela carlota triana jana`
    .split(/\s+/)
    .filter(Boolean),
);

/** Apellidos más frecuentes: permiten reconocer personas aunque su nombre de pila no esté en la lista. */
const SURNAMES = new Set(
  `garcia rodriguez gonzalez fernandez lopez martinez sanchez perez gomez martin jimenez ruiz hernandez diaz moreno
  munoz alvarez romero alonso gutierrez navarro torres dominguez vazquez ramos gil ramirez serrano blanco molina
  morales suarez ortega delgado castro ortiz rubio marin sanz nunez iglesias medina garrido cortes castillo santos
  lozano guerrero cano prieto mendez cruz calvo gallego vidal leon marquez herrera pena flores cabrera campos vega
  fuentes carrasco diez caballero reyes nieto aguilar pascual santana herrero lorenzo montero hidalgo gimenez ibanez
  ferrer duran santiago benitez mora vicente vargas arias carmona crespo roman pastor soto saez velasco moya soler
  parra esteban bravo gallardo rojas pardo merino franco espinosa izquierdo lara rivas silva rivera casado arroyo
  redondo camacho rey vera otero luque galan montes rios sierra segura carrillo marcos marti soriano mendoza`
    .split(/\s+/)
    .filter(Boolean),
);

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'da', 'do', 'dos', 'das', 'van', 'von', 'di', 'e']);

export const ROLE_WORDS = [
  'arrendador', 'arrendadora', 'arrendadores', 'arrendatario', 'arrendataria', 'arrendatarios', 'fiador', 'fiadora',
  'avalista', 'comprador', 'compradora', 'vendedor', 'vendedora', 'propietario', 'propietaria', 'inquilino', 'inquilina',
  'trabajador', 'trabajadora', 'empleador', 'empresa', 'cliente', 'proveedor', 'prestador', 'prestadora', 'prestatario',
  'prestataria', 'prestamista', 'cedente', 'cesionario', 'cesionaria', 'representante', 'apoderado', 'apoderada',
  'testigo', 'contratante', 'contratista', 'mandante', 'mandatario', 'donante', 'donatario', 'heredero', 'heredera',
  'socio', 'socia', 'administrador', 'administradora', 'deudor', 'deudora', 'acreedor', 'acreedora', 'solicitante',
  'interesado', 'interesada', 'alumno', 'alumna', 'paciente', 'tutor', 'tutora',
];

/** Palabras que suelen ir en mayúscula pero no son datos personales. */
const STOP = new Set(
  `el la los las lo un una unos unas de del y e o u en a al con por para sin sobre que se su sus es este esta estos estas
  ese esa dicho dicha mismo misma presente primero primera segundo segunda tercero tercera cuarto cuarta quinto quinta
  sexto sexta septimo septima octavo octava noveno novena decimo decima undecima duodecima clausula clausulas
  estipulacion estipulaciones reunidos intervienen exponen manifiestan acuerdan otorgan contrato contratos arrendamiento
  arrendamientos vivienda parte partes articulo articulos ley codigo civil real decreto urbanos boletin oficial estado
  euros euro iva enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre
  lunes martes miercoles jueves viernes sabado domingo sr sra don dona dna d fdo firma firmado anexo pagina total nota
  senor senora objeto duracion renta fianza gastos obras resolucion jurisdiccion juzgados tribunales nombre apellidos
  dni nie nif cif domicilio calle avenida plaza y/o no si mas cuando como donde entre ambas ambos dichas dichos
  condiciones generales particulares capitulo titulo seccion apartado inmueble finca registro propiedad notario
  ${ROLE_WORDS.join(' ')}`
    .split(/\s+/)
    .filter(Boolean),
);

interface Token {
  s: number;
  e: number;
  w: string;
}

function tokens(text: string): Token[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ s: m.index!, e: m.index! + m[0].length, w: fold(m[0]).replace(/[.,;:]+$/, '') }));
}

/** Quita palabras vacías al principio y al final ("El Arrendador Juan Pérez" → "Juan Pérez"). */
function trimStop(text: string, offset: number): { start: number; end: number; text: string; words: Token[] } | null {
  const t = tokens(text);
  let i = 0;
  let j = t.length - 1;
  while (i <= j && (STOP.has(t[i].w) || PARTICLES.has(t[i].w))) i++;
  while (j >= i && (STOP.has(t[j].w) || PARTICLES.has(t[j].w))) j--;
  if (i > j) return null;
  const words = t.slice(i, j + 1).filter((x) => !PARTICLES.has(x.w));
  return { start: offset + t[i].s, end: offset + t[j].e, text: text.slice(t[i].s, t[j].e), words };
}

const TRIGGER_RE = new RegExp(
  `(?<![${LETTERS}])(?:D\\.?\\s*\\/\\s*Dña\\.?|D\\.ª|Dª|Dña\\.?|Doña|Don|D\\.|Sr\\.|Sra\\.|Señor|Señora|Srta\\.)[ \\u00A0]+`,
  'gi',
);
const AFTER_NAME_RE =
  /^\s*,?\s*(?:mayor(?:es)? de edad|con (?:d\.?n\.?i|n\.?i\.?e|n\.?i\.?f|documento|pasaporte)|provist[oa]s? de|de nacionalidad|vecin[oa] de|nacid[oa])/i;

export function isFirstName(word: string): boolean {
  return FIRST_NAMES.has(fold(word));
}

export function findNameCandidates(p: Paragraph): Candidate[] {
  const out: Candidate[] = [];
  const text = p.text;
  const push = (r: { start: number; end: number; text: string }, priority: number, confidence: number) =>
    out.push({ para: p.index, start: r.start, end: r.end, text: r.text, category: 'nombre', source: 'nombre', priority, confidence });

  // 1) Detrás de tratamientos: D., Dña., Don, Sr., Sra.…
  const trig = new RegExp(TRIGGER_RE.source, TRIGGER_RE.flags);
  const seq = new RegExp(NAME_SEQ, 'y');
  let m: RegExpExecArray | null;
  while ((m = trig.exec(text))) {
    seq.lastIndex = m.index + m[0].length;
    const n = seq.exec(text);
    if (!n) continue;
    const r = trimStop(n[0], n.index);
    if (r && r.words.length >= 2) push(r, 60, 0.9);
  }

  // 2) Secuencias en mayúscula seguidas de "mayor de edad", "con DNI"… o que empiezan por un nombre conocido.
  const all = new RegExp(NAME_SEQ, 'g');
  while ((m = all.exec(text))) {
    let r = trimStop(m[0], m.index);
    if (!r || r.words.length < 2) continue;
    // "Adiós Juan Pérez Gil": si un nombre de pila conocido aparece más adelante, el nombre empieza ahí.
    if (!isFirstName(r.words[0].w)) {
      const i = r.words.findIndex((w, j) => j > 0 && j < r!.words.length - 1 && isFirstName(w.w));
      if (i > 0) {
        const cut = r.words[i].s;
        r = { ...r, start: m.index + cut, text: text.slice(m.index + cut, r.end), words: r.words.slice(i) };
      }
    }
    if (AFTER_NAME_RE.test(text.slice(r.end, r.end + 40))) push(r, 55, 0.85);
    // "María José" solo son nombres de pila: es la forma corta de alguien, no una persona nueva.
    else if (isFirstName(r.words[0].w) && r.words.slice(1).some((w) => !STOP.has(w.w) && !isFirstName(w.w))) push(r, 50, 0.75);
    else if (!STOP.has(r.words[0].w) && r.words.slice(1).filter((w) => SURNAMES.has(w.w)).length >= 2) push(r, 48, 0.7);
  }
  return out;
}

const COMPANY_RE = /(?<![\p{L}])(S\.\s?L\.\s?U\.|S\.\s?L\.\s?L\.|S\.\s?L\.|S\.\s?A\.\s?U\.|S\.\s?A\.|S\.\s?Coop\.|C\.\s?B\.|SLU|SLL|SL|SAU|SA)(?![\p{L}])/gu;
const COMPANY_CONNECTORS = new Set(['de', 'del', 'la', 'los', 'las', 'y', '&', 'e']);

/** Empresas: palabras en mayúscula delante de S.L., S.A., S.Coop.… */
export function findCompanyCandidates(p: Paragraph): Candidate[] {
  const out: Candidate[] = [];
  const text = p.text;
  let m: RegExpExecArray | null;
  const re = new RegExp(COMPANY_RE.source, COMPANY_RE.flags);
  while ((m = re.exec(text))) {
    let pos = m.index;
    let startIdx = -1;
    let count = 0;
    for (;;) {
      const seg = text.slice(0, pos);
      const mm = seg.match(/(\S+)(\s*)$/);
      if (!mm) break;
      const token = mm[1].replace(/,$/, '');
      const tokenStart = seg.length - mm[0].length;
      // Fin de frase o numeración de apartado ("I.-", "1.-", "a)"): ahí no sigue el nombre de la empresa.
      if (/[.:;\-)]$/.test(token)) break;
      if (COMPANY_CONNECTORS.has(fold(token))) {
        pos = tokenStart;
        continue;
      }
      if (!/^[\p{Lu}0-9&]/u.test(token)) break;
      startIdx = tokenStart;
      pos = tokenStart;
      if (++count >= 6) break;
    }
    if (startIdx < 0) continue;
    const r = trimStop(text.slice(startIdx, m.index), startIdx);
    if (!r) continue;
    const end = m.index + m[0].length;
    out.push({
      para: p.index,
      start: r.start,
      end,
      text: text.slice(r.start, end),
      category: 'empresa',
      source: 'regla',
      priority: 65,
      confidence: 0.85,
    });
  }
  return out;
}

/** Textos en mayúscula de 2 o más palabras que aparecen varias veces: posibles datos que conviene revisar. */
export function findRepeated(paragraphs: Paragraph[]): Candidate[] {
  const found = new Map<string, Candidate[]>();
  for (const p of paragraphs) {
    const all = new RegExp(NAME_SEQ, 'g');
    let m: RegExpExecArray | null;
    while ((m = all.exec(p.text))) {
      const r = trimStop(m[0], m.index);
      if (!r || r.words.length < 2) continue;
      if (r.words.every((w) => STOP.has(w.w))) continue;
      const key = normalizeKey(r.text);
      const list = found.get(key) ?? [];
      list.push({
        para: p.index,
        start: r.start,
        end: r.end,
        text: r.text,
        category: 'texto',
        source: 'repetido',
        priority: 20,
        confidence: 0.35,
      });
      found.set(key, list);
    }
  }
  return [...found.values()].filter((l) => l.length >= 2).flat();
}
