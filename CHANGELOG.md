# Changelog

Cambios de `sodeker/vue-tables`. Las versiones siguen [SemVer](https://semver.org/lang/es/):
mientras el diseño se define van en `0.x`, y un cambio que obliga a ajustar las apps sube el
número del medio.

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
