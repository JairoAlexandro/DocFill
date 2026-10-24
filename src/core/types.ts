export type Category =
  | 'nombre'
  | 'empresa'
  | 'dni'
  | 'cif'
  | 'iban'
  | 'email'
  | 'telefono'
  | 'fecha'
  | 'importe'
  | 'direccion'
  | 'codigo_postal'
  | 'matricula'
  | 'catastro'
  | 'localidad'
  | 'texto';

export const CATEGORY_LABELS: Record<Category, string> = {
  nombre: 'Nombre',
  empresa: 'Empresa',
  dni: 'DNI/NIE',
  cif: 'CIF',
  iban: 'IBAN',
  email: 'Email',
  telefono: 'Teléfono',
  fecha: 'Fecha',
  importe: 'Importe',
  direccion: 'Dirección',
  codigo_postal: 'Código postal',
  matricula: 'Matrícula',
  catastro: 'Ref. catastral',
  localidad: 'Localidad',
  texto: 'Texto',
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

/** De dónde sale cada dato detectado. */
export type Source = 'regla' | 'hueco' | 'nombre' | 'aprendido' | 'repetido' | 'manual';

export const SOURCE_LABELS: Record<Source, string> = {
  regla: 'Regla',
  hueco: 'Hueco en blanco',
  nombre: 'Nombre',
  aprendido: 'Aprendido',
  repetido: 'Se repite',
  manual: 'Marcado a mano',
};

export type PartKind = 'cuerpo' | 'encabezado' | 'pie' | 'notas' | 'diapositiva' | 'hoja' | 'celdas' | 'campo' | 'pagina';

export interface Paragraph {
  index: number;
  part: string;
  kind: PartKind;
  text: string;
  inTable: boolean;
  /** Nombre del campo cuando el documento es un PDF con formulario. */
  field?: string;
  /** Posición de la línea en la página (PDF normales, escaneados e imágenes). */
  geo?: { page: number; y: number; size: number; xs: number[] };
}

/**
 * Cómo se escribe el valor en una aparición concreta:
 * - letras / letras-un: importe en letras ("mil doscientos", "veintiún").
 * - nombre-pila / apellidos / apellido1: forma corta de un nombre ("Carlos", "Martínez Ruiz", "Sr. Martínez").
 * - fecha-num / fecha-larga / fecha-letras: la misma fecha en otro formato.
 * - genero: palabra que cambia según el género de la persona ("el arrendatario" / "la arrendataria").
 */
export type Transform =
  | 'letras'
  | 'letras-un'
  | 'nombre-pila'
  | 'apellidos'
  | 'apellido1'
  | 'fecha-num'
  | 'fecha-larga'
  | 'fecha-letras'
  | 'genero';

export type Gender = 'm' | 'f';

export interface Occurrence {
  para: number;
  start: number;
  end: number;
  text: string;
  transform?: Transform;
  /** Formas masculina y femenina (solo para transform "genero"). */
  alt?: Record<Gender, string>;
}

export interface Variable {
  id: string;
  label: string;
  category: Category;
  original: string;
  source: Source;
  confidence: number;
  occurrences: Occurrence[];
  /** Valor nuevo. Si empieza por "=" es una fórmula: "= {Importe (Renta)} * 2", "= {Fecha} + 1 año". */
  value: string;
  /** Género de la persona en el documento original y el elegido para el nuevo. */
  originalGender?: Gender;
  gender?: Gender;
  /** Solo fechas: formato con el que se escribe (por defecto, el de cada sitio del documento). */
  dateFormat?: 'keep' | 'num' | 'num-short' | 'larga' | 'letras';
}

/**
 * Bloque de párrafos que se repite una vez por persona (o elemento) de una lista.
 * La primera persona usa los valores normales de los datos; las siguientes, los de `entries`.
 */
export interface RepeatBlock {
  id: string;
  /** Párrafos consecutivos que forman el bloque. */
  paras: number[];
  /** Valores de la 2.ª, 3.ª… persona, por id de dato. */
  entries: Record<string, string>[];
  /** Fuera del bloque, escribir todos juntos: "Ana Torres y Luis Mora". */
  joinOutside: boolean;
}

/** Párrafo que se puede quitar del documento final. */
export interface OptionalClause {
  para: number;
  include: boolean;
  /** Si se indica, la cláusula solo se incluye cuando este dato tiene valor. */
  dependsOn?: string;
}

export interface Candidate {
  para: number;
  start: number;
  end: number;
  text: string;
  category: Category;
  source: Source;
  priority: number;
  confidence: number;
  /** Nombre definitivo (solo reglas aprendidas). */
  label?: string;
  /** Nombre sugerido antes de añadir el rol ("Nombre" → "Nombre (Arrendador)"). */
  base?: string;
  /** Clave para agrupar apariciones en un mismo dato. */
  key?: string;
}

export interface Selection {
  para: number;
  start: number;
  end: number;
  text: string;
}
