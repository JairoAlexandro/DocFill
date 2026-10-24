# Word de pruebas

`contrato-pruebas.docx` se genera con `node scripts/crear-prueba.mjs`. Para ver lo que detecta DocFill sin abrir la web:
`npx vitest run src/core/prueba.test.ts`.

## Qué probar con él

| Parte del documento | Qué comprueba |
|---|---|
| Encabezado y pie de página | Que el nombre, la empresa y el CIF también se cambian ahí |
| «Inmobiliaria Levante, S.L.» con CIF | Detección de empresas y CIF |
| «D. Javier Ortega Molina» (en negrita y cursiva) | Nombre partido en trozos con formato distinto |
| DNI «45.678.912-S» | DNI con puntos y guion |
| «Dña. María José Fernández Ruiz», «vecina», «provista» | Nombre compuesto, género (prueba Hombre/Mujer) |
| «la Sra. Fernández», «María José» | Formas cortas del nombre |
| «Yeray Castillo Navarro» con NIE | Nombre poco común reconocido por los apellidos, NIE |
| «+34 911 234 567» | Teléfono con prefijo |
| Calle Ruzafa, catastral, matrícula | Dirección del inmueble, referencia catastral, matrícula |
| `[NOMBRE DEL GESTOR]` (2 veces), `{{telefono_gestor}}` | Marcadores entre corchetes y llaves |
| Tabla de datos | Cambios dentro de tablas |
| Fechas «1 de febrero de 2025», «01/02/2025», «uno de febrero de dos mil veinticinco» | La misma fecha en tres formatos |
| Fin «01/02/2026» | Fórmula `= {Fecha} + 1 año` |
| Renta 950 €, fianza 1.900 € | Importes en letras; fórmula `= {Importe (Renta)} * 2` |
| Base 1.000 €, IVA 210 €, total 1.210 € | Fórmulas `= {Base} * 21%` y `= {Base} + {IVA}` |
| Cláusula QUINTA (avalista) | Huecos `____` y `.....`; cláusula opcional que depende del avalista |
| Cláusula SÉPTIMA (mascotas) | Cláusula opcional con casilla |
| Párrafo «De otra parte, Dña. María José…» | Lista que se repite: añade una segunda inquilina o inquilino |
| Firma en MAYÚSCULAS | Que el nombre nuevo también salga en mayúsculas |
| Todo | Revisión final antes de descargar, lote con JSON, nombre automático del archivo |
