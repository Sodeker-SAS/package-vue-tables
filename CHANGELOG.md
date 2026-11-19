# Changelog

Cambios de `sodeker/vue-tables`. Las versiones siguen [SemVer](https://semver.org/lang/es/):
mientras el diseño se define van en `0.x`, y un cambio que obliga a ajustar las apps sube el
número del medio.

## [0.0.3] - 2026-11-19

**Acción en la app:** ninguna para lo que ya existe: sin las props nuevas las dos tablas funcionan
igual que antes. Para usar lo nuevo, `composer update sodeker/vue-tables`. Al migrar una tabla
agrupada desde el `DataTable.vue` de Sai, el `:deep(.dt-th-label)` que evitaba recortar los rótulos
se cambia por `:truncate-labels="false"`.

### Agregado

- `DataTable`: grupos de columnas. `group` en la columna y `header-groups` con el rótulo y las
  clases de cada grupo; el encabezado pasa a dos filas y una línea separa cada grupo. Slot
  `group-{grupo}`. Misma API del `DataTable.vue` de Sai.
- `DataTable`: columnas fijas. `sticky: true` en las primeras columnas las deja a la vista al
  desplazar la tabla de lado; se miden en el navegador y se vuelven a medir si cambian de ancho.
- `DataTable`: `truncate-labels` en `false` para que los rótulos del encabezado nunca se
  recorten; reemplaza el `:deep(.dt-th-label)` que usaban las pantallas.
- `EditableTable`: `page-length` pagina las filas con el mismo pie del `DataTable` (rango y
  botones de página). Número de fila e índices siguen siendo los de `rows`, una fila nueva
  muestra su página y, al quitar filas, la tabla vuelve a la última página que existe.

### Cambiado

- `DataTable`: el relleno de la tarjeta en el encabezado se aplica a la primera y la última
  columna de la tabla (`is-first`, `is-last`) y no a la primera y la última celda de cada fila,
  que con grupos no coinciden. El tono de la fila (cebra, hover, selección) va en la variable
  `--vt-row-bg`, que pintan encima de su fondo las columnas fijas. Sin grupos ni columnas fijas
  se ve igual que antes.
- `EditableTable`: las etiquetas del encabezado usan el color atenuado del `DataTable`
  (`--vt-muted`), y el marco con borde ya no redondea las esquinas.

## [0.0.2] - 2026-11-19

**Acción en la app:** ninguna para lo que ya existe: el `DataTable` no cambia. Para usar la tabla
nueva, `composer update sodeker/vue-tables` e importar `EditableTable` desde `@vue-tables`.

### Agregado

- `EditableTable`: tabla de captura con columnas y filas que el usuario arma y llena. Controlada
  (emite eventos y `update:columns`, nunca modifica sus props) y genérica: las celdas se pintan por
  slot (`cell`, `cell-{key}`). Cada acción se activa con props: agregar, editar, eliminar y mover
  columnas (arrastre o Alt+←/→), agregar y eliminar filas, topes, solo lectura y atajo de teclado
  con alcance de foco o global. Fila «Nueva fila» fija al desplazar en horizontal, líneas entre
  columnas, tamaño compacto y campos numéricos sin flechas. Mismas variables `--vt-*` del tema.
- Utilidades `moveItem` (`utils/reorder.js`, exportada) y `parseShortcut`/`matchesShortcut`
  (`utils/shortcut.js`).

## [0.0.1] - 2026-10-27

Primera versión: se instala en las apps sin usarla todavía en ninguna vista. La migración de los
`DataTable.vue` locales se hace después, coordinada con todo el equipo. **Acción en la app:**
ninguna hasta la migración (ver "Conectar una aplicación" en el README).

### Agregado

- Estructura del paquete: `composer.json`, plugin de Vite (`vite.js`) con el alias
  `@vue-tables` y el modo local para probar sin publicar, igual que `package-doma-frontend`.
- `DataTable`: la tabla de los listados, con la API unificada de los `DataTable.vue` de cada
  proyecto (props, slots `cell-*`/`head-*`/`header-*`/`footer`, eventos
  `sort-changed`/`page-changed`/`row-click`/`row-selected`). Orden y paginación en Vue, sin
  jQuery ni DataTables; paginación en el cliente o en el servidor; estado sin registros; colores
  y radio del tema de cada proyecto.
- Diseño de la tabla: de borde a borde de la tarjeta, encabezado en tono suave con rótulos en
  mayúsculas pequeñas, filas separadas por líneas y paginador con flechas y números. Valores en
  variables `--vt-*` tomadas del tema.
