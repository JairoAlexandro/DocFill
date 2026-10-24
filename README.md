# DocFill

> © 2026 Jairo Alexandro Saborito Franco. **Todos los derechos reservados.** El código se publica solo para consulta (portafolio).
> No se permite copiarlo, usarlo ni comercializarlo sin autorización por escrito. Ver [LICENSE](LICENSE).

Sube un documento (un contrato, por ejemplo) y DocFill encuentra los datos que se repiten: nombres, DNI,
importes, fechas, direcciones y huecos en blanco. Escribes cada dato **una sola vez** y se cambia en todos los sitios
donde aparece, incluidas tablas, encabezados, pies de página y los importes escritos en letras.

- **Sin IA y gratis para siempre:** la detección funciona con reglas y con lo que el usuario le enseña.
  Todas las librerías son gratuitas y de código abierto (pdf.js, pdf-lib, Tesseract, JSZip, React, Electron).
- **Privado:** todo se procesa y se guarda en el equipo del usuario (IndexedDB). No hay servidor.
- **Web y escritorio:** es la misma app; la versión de Windows se empaqueta con Electron. La web también se puede
  instalar como app (PWA) y funciona sin conexión.

## Uso

```bash
npm install
npm run dev                    # web en http://localhost:5173
npm test                       # pruebas del motor
npm run build                  # web lista para publicar en dist/
npm run escritorio             # abre la app de escritorio
npm run escritorio:instalador  # crea el instalador de Windows en release/
npm run version:parche        # sube la versión: arreglos (0.1.0 → 0.1.1)
npm run version:menor         # sube la versión: funciones nuevas (0.1.0 → 0.2.0)
npm run version:mayor         # sube la versión: cambios grandes (0.1.0 → 1.0.0)
npm run escritorio:publicar    # comprueba la versión y publica el instalador en GitHub Releases
npm run ejemplo                # regenera public/ejemplos/contrato-arrendamiento.docx
node scripts/crear-iconos.mjs  # regenera los iconos
node scripts/copiar-ocr.mjs    # copia a public/ los ficheros del OCR y de pdf.js (sin internet)
```

Los ficheros del OCR y de pdf.js (`public/ocr`, `public/pdfjs`) no se suben al repositorio: tras un `npm install`
en un equipo nuevo, ejecuta `node scripts/copiar-ocr.mjs` una vez (copia desde `node_modules`, no descarga nada).

## Cómo detecta los datos

1. **Reglas fijas** (`src/core/rules.ts`): DNI/NIE, CIF, IBAN, email, teléfono, fechas, importes, matrícula,
   referencia catastral, código postal, direcciones y localidad de firma.
2. **Nombres** (`src/core/names.ts`): detrás de D., Dña., Sr., Sra.; antes de «mayor de edad» o «con DNI»; empezando
   por un nombre de pila conocido o con dos apellidos frecuentes. Las empresas se detectan por S.L., S.A., etc.
3. **Huecos en blanco**: `_____`, `.....`, `[NOMBRE]`, `{{nombre}}`, `<<nombre>>`. Se adivina qué va en cada hueco por
   las palabras de delante («con DNI ____» → DNI).
4. **Papel de cada persona** (`src/core/context.ts`): «…, en adelante el ARRENDADOR» → «Nombre (Arrendador)».
5. **Textos repetidos**: palabras en mayúscula que aparecen varias veces; se proponen como sugerencias para revisar.
6. **Aprendizaje** (`src/core/learning.ts`): cuando el usuario marca un texto o pulsa «Recordar», se guarda el
   contexto (palabras de delante y de detrás) y el valor. En documentos futuros se reconoce automáticamente.
   «No es un dato» guarda el texto para no volver a proponerlo. El aprendizaje se puede exportar e importar.

Después, cada valor se busca en todo el documento: formas cortas del nombre, la misma fecha en otros formatos,
los importes en letras y las palabras que dependen del género.

## Formatos

| Formato | Cómo se rellena | Notas |
|---|---|---|
| Word `.docx` | Directamente, conservando el formato | Tablas, encabezados, pies y notas |
| LibreOffice `.odt` | Directamente | Encabezados y pies |
| PowerPoint `.pptx` | Directamente | Todas las diapositivas |
| Excel `.xlsx` | Directamente | Celdas de texto (no números) |
| Texto `.txt`, `.md` | Directamente | |
| PDF con formulario | Rellena los campos | |
| PDF sin formulario | Tapa el texto antiguo y escribe el nuevo encima | Letra estándar (Helvetica) |
| PDF escaneado | OCR en español y luego igual que el anterior | Tesseract, sin conexión |
| Fotos `.png`, `.jpg` | OCR; el resultado es un PDF | |
| Exportar a PDF | Escritorio, con LibreOffice instalado (gratuito) | Para Word, LibreOffice, PowerPoint, Excel y texto |

**Importante en PDF sin formulario:** el texto antiguo queda tapado pero sigue dentro del archivo (se podría copiar).
Por eso la descarga trae activada la opción «Eliminar de verdad el texto antiguo», que convierte las páginas en imagen.
Si el texto nuevo es más largo que el antiguo, la letra se reduce un poco para que quepa.

## Funciones

- Vista previa con cada dato resaltado, opción «Ver nombres» (etiqueta de cada dato sobre el texto) y modo
  «Resultado» para ver el documento ya relleno. Cada dato muestra la lista de sitios donde aparece.
- Revisión final antes de descargar: avisa de restos del dato antiguo que no se van a cambiar, huecos sin rellenar,
  datos sin valor y valores no válidos.
- Formas cortas del nombre («Sr. Martínez», «Carlos», «Martínez Ruiz») enlazadas al nombre completo.
- Fechas: la misma fecha en número, en texto o en letras es un solo dato y cada aparición mantiene su formato.
- Género: D./Dña., «el ARRENDATARIO»/«la ARRENDATARIA», del/de la y vecino/vecina cambian al elegir otro género.
- Campos calculados: `= {Importe (Renta)} * 2`, `= {Fecha} + 1 año`, `= {Base} * 21%`.
- Cláusulas opcionales: cualquier párrafo se puede quitar del resultado o incluir solo si un dato tiene valor.
- **Listas que se repiten** (varios inquilinos, avalistas…): se marca con «Repetir» el bloque de párrafos de una
  persona y se añaden las demás. El bloque se copia por cada persona, cada una con sus datos y su género, y fuera del
  bloque se pueden juntar todos («Ana Torres y Luis Mora»). La gramática fuera del bloque no pasa a plural.
- Nombre automático del archivo: `Contrato - {Nombre (Arrendataria)}`.
- Deshacer (Ctrl+Z) para unir, quitar, marcar y cambios de tipo, género, listas y cláusulas.
- Marcar datos a mano seleccionando texto, unir dos datos que son el mismo y descartar falsos positivos.
- Validación de DNI/NIE, CIF, IBAN, teléfono y email.
- Respeta mayúsculas: si el original estaba en MAYÚSCULAS, el valor nuevo también.
- Plantillas guardadas (buscar y duplicar), fichas reutilizables (importables desde CSV) e historial.
- Relleno en lote desde CSV (Excel) o JSON: un documento por fila u objeto, descargados en un .zip.
  Cada dato se identifica por su nombre o por su clave (`nombre_arrendataria`). Para las listas, se añade el número
  de persona a la clave (`nombre_arrendataria_2`). Ejemplo de JSON:

  ```json
  { "documentos": [
      { "archivo": "contrato-ana", "nombre_arrendataria": "Ana Torres", "importe_renta": "900" },
      { "archivo": "contrato-luis", "nombre_arrendataria": "Luis Mora", "nombre_arrendataria_2": "Eva Gil" }
  ] }
  ```
- Copia de seguridad completa (plantillas, fichas, historial y aprendizaje) en un único .json, opcionalmente cifrada
  con contraseña (AES-GCM). También sirve para pasar los datos de la web a la app de escritorio.
- Idiomas de la interfaz: español e inglés (`src/i18n.tsx`; para añadir otro, copia el diccionario `en`).
- Tema claro, oscuro o el del sistema.
- Pide al navegador almacenamiento persistente para que no borre los datos aunque falte espacio.

## Web instalable (PWA)

Publicada en `https://` (o en `localhost`), la web se puede instalar desde Ajustes o desde el icono de instalar del
navegador. Funciona sin conexión (`public/sw.js`) y, instalada, permite «Abrir con DocFill» desde el explorador de
archivos para `.docx`, `.odt` y `.pdf`.

## Programa de Windows: descarga, versiones y actualizaciones

Todo funciona con GitHub Releases (gratuito).

**Descarga desde la web.** La página de inicio y Ajustes muestran «Descargar para Windows», que apunta siempre al
instalador de la última versión publicada (`DocFill-Setup.exe`). El botón no aparece dentro del propio programa ni
mientras el repositorio no esté configurado.

**Al abrir el programa** se comprueba si hay una versión nueva antes de mostrar la ventana (`electron/updates.cjs`):
- Actualización normal: «Actualizar ahora» o «Continuar sin actualizar».
- Actualización **obligatoria**: «Actualizar ahora» o «Salir»; no se puede seguir con la versión antigua.
- Sin conexión, o si GitHub tarda más de 8 segundos, el programa se abre con normalidad.
- En Ajustes hay un botón «Buscar actualizaciones» y se ve la versión instalada.

**Publicar una versión nueva** (siempre con versión nueva, aunque sea un arreglo pequeño):

1. Sube la versión: `npm run version:parche` (arreglos), `version:menor` (funciones nuevas) o `version:mayor`.
2. Escribe las notas en `build/release-notes.md`, con un título `## x.y.z` igual a la versión nueva. Los usuarios
   las verán al actualizar. Para que la actualización sea **obligatoria**, escribe `#obligatoria` en las notas.
3. `npm run escritorio:publicar`. Antes de construir nada, `scripts/comprobar-version.mjs` se niega a seguir si la
   versión no es mayor que la última publicada o si faltan las notas de esa versión, y avisa si será obligatoria.

**Configuración (una sola vez):**

1. Crea un repositorio en GitHub (por ejemplo `docfill`).
2. En `package.json` → `build.publish`, cambia `CAMBIA-ESTO-POR-TU-USUARIO` por tu usuario de GitHub.
3. Crea un token de GitHub con permiso para publicar releases y guárdalo en la variable de entorno `GH_TOKEN`
   (nunca en el código ni en un archivo del proyecto).

Mientras `build.publish` tenga el valor de ejemplo, el programa no busca actualizaciones y la web no muestra la
descarga. El instalador no está firmado, así que Windows mostrará el aviso de SmartScreen la primera vez.

## Dónde se guardan los datos

- **Web:** IndexedDB del navegador, ligada al dominio y al navegador concretos.
- **Escritorio:** IndexedDB de Electron en `%APPDATA%\DocFill\`.
- El idioma y el tema se guardan en `localStorage`.

## Estructura

```
src/core/       motor (sin interfaz, con pruebas): formatos, reglas, nombres, fechas, género, fórmulas,
                listas, PDF y OCR, revisión, lote
src/components  interfaz en React
src/storage.ts  almacenamiento local (IndexedDB) y copias de seguridad
src/i18n.tsx    traducciones
electron/       app de escritorio (exportar a PDF con LibreOffice y actualizaciones)
public/         manifiesto y service worker de la PWA, iconos y documento de ejemplo
scripts/        documento de ejemplo, iconos y copia de los ficheros del OCR
```

## Ideas para más adelante

- Plural automático fuera de las listas («los ARRENDATARIOS», «arriendan»).
- En PDF sin formulario, imitar la fuente original en lugar de Helvetica.
- Firmar el instalador de Windows (requiere un certificado, que tiene coste).
- Cuentas de usuario y sincronización (requeriría servidor y base de datos).

## Licencia

© 2026 Jairo Alexandro Saborito Franco. Todos los derechos reservados. Puedes ver el código como muestra de trabajo, pero no
copiarlo, modificarlo, distribuirlo, usarlo en otros productos ni comercializarlo sin autorización por escrito.
Para licencias, colaboraciones o la compra del proyecto, contacta a través de
[GitHub](https://github.com/JairoAlexandro). Texto completo en [LICENSE](LICENSE).

Las librerías de terceros que usa DocFill mantienen sus propias licencias de código abierto.
