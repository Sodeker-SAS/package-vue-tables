# sodeker/vue-tables

Tablas Vue de los proyectos de Sódeker: un solo lugar para el diseño y el comportamiento de las
tablas, en lugar del `DataTable.vue` que cada proyecto tenía copiado. No es exclusivo de un
ecosistema: sirve a cualquier proyecto con Vue 3 y el tema Velzon (Bootstrap 5).

Es un paquete Composer **sin PHP y sin build propio**: Composer solo lo entrega en `vendor/` y
cada aplicación compila su fuente con su propio Vite, igual que el resto de su `resources/js`.
Funciona igual que [`package-doma-frontend`](https://github.com/Sodeker-SAS/package-doma-frontend).

## Estructura

```
resources/
├── index.js          punto de entrada público: import { … } from '@vue-tables'
├── components/       tablas (SFC con <script setup>)
└── utils/            funciones sin Vue: orden y paginación
vite.js               plugin de Vite que conecta el paquete con la app
package.json          solo declara peerDependencies; no se instala
```

## Uso desde una aplicación

```js
import { DataTable } from '@vue-tables';
```

No hay hoja de estilos global que importar: cada tabla trae sus estilos.

## Tablas

### `DataTable`

La tabla de los listados (Index). Tiene la misma API que el `DataTable.vue` de los proyectos, con lo
que cada copia había agregado (`preserve-items-order` y `summary-rows` de Iris, `highlighted-key`,
`striped` y el slot `footer` de SAI, `header-*` de SAT…): **migrar una pantalla es cambiar el
import**.

```js
// antes
import DataTable from '@/Components/DataTable.vue';
// después
import { DataTable } from '@vue-tables';
```

```vue
<DataTable
    id="table_communication_channels"
    :headers="[
        { label: 'Código', key: 'code', width: '20%' },
        { label: 'Nombre', key: 'name' },
        { label: 'Saldo', key: 'balance', align: 'end', sortType: 'number' },
        { label: 'Acciones', key: 'actions', orderable: false },
    ]"
    :items="registros"
    :page-length="10"
    order-by="code"
>
    <template #cell-actions="{ item }">…</template>
</DataTable>
```

No usa jQuery ni DataTables: Vue ordena y pagina una copia de los ítems. Con DataTables, que
reescribía el `<thead>` y las clases de los `<th>` por debajo de Vue, cambiar las columnas
reventaba la tabla (`insertBefore` de `null`) y reordenar borraba clases; eso ya no pasa.

#### Columnas (`headers`)

| Campo | Para qué |
|---|---|
| `key` | Campo del ítem que se muestra y nombre de sus slots |
| `label` | Rótulo del encabezado |
| `width` | Ancho (`'20%'`, `'120px'`). Con alguna columna con ancho, la tabla usa `table-layout: fixed` y lo que no cabe termina en "…" |
| `align` | `start` (por defecto), `center` o `end`. En `end` la flecha de orden va a la izquierda del rótulo |
| `orderable` | `false`: la columna no se ordena. `sortable: false` (SAT) hace lo mismo |
| `sortKey` | Campo por el que se ordena en lugar de `key` (p. ej. la fecha ISO detrás de una fecha formateada) |
| `sortType` | `text` (por defecto), `number` o `date`. `date` entiende ISO y `dd/mm/aaaa` |
| `highlight` | El valor en el primario y en negrita |
| `wrap` | La celda puede partirse en varias líneas |

#### Props

| Prop | Por defecto | Para qué |
|---|---|---|
| `headers`, `items` | — | Columnas y filas |
| `id` | — | `id` del `<table>` |
| `item-key` | — | Campo que identifica cada ítem: llave de la fila y de `highlighted-key` |
| `page-length` | `10` | Filas por página; `0`, todas en una página |
| `order-by`, `order-dir` | primera ordenable, `asc` | Orden inicial: `key` o `sortKey` de la columna |
| `order-type` | `text` | Tipo de la columna de `order-by` si ella no trae `sortType` |
| `preserve-order` | `false` | Respeta el orden de `items` y ninguna columna se ordena |
| `preserve-items-order` | `false` | Respeta el orden de `items` al cargar; el usuario sí puede ordenar |
| `clickable-row` | `false` | Clic (o Enter) en la fila emite `row-click`. No cuenta el clic en enlaces, botones o campos |
| `server-pagination` | `false` | Solo llega la página actual; ver abajo |
| `pagination-meta` | `{}` | Meta del paginador: `current_page` (o `page`), `last_page`, `per_page`, `total` |
| `highlighted-key` | — | Resalta la fila cuyo `item-key` vale esto |
| `row-class` | — | Clase extra por fila: fija o `(item) => …` |
| `striped` | `false` | Filas alternadas |
| `uppercase` | `true` | Datos de las filas en mayúsculas, como lo hacía el `DataTable.vue` de cada proyecto |
| `summary-rows` | `[]` | Totales al pie, en las dos últimas columnas: `[{ label, value, highlight? }]` |
| `empty-text` | `Sin registros.` | Texto de la tabla sin filas |

#### Slots

| Slot | Props | Para qué |
|---|---|---|
| `cell-{key}` | `item`, `header`, `value`, `index` | Contenido de la celda |
| `head-{key}` (o `header-{key}`) | `header` | Contenido del encabezado |
| `empty` | — | Reemplaza el estado sin registros |
| `footer` | `headers` | Filas propias dentro del `<tfoot>` (totales, por ejemplo) |
| `summary-label`, `summary-value` | `row`, `index` | Cada línea de `summary-rows` |

#### Eventos

| Evento | Carga | Cuándo |
|---|---|---|
| `sort-changed` | `{ sortBy, sortDir, sortType }` | Al montar (el orden inicial) y cada vez que el usuario ordena |
| `page-changed` | página | El usuario cambia de página |
| `row-click` | ítem | Clic en la fila con `clickable-row` |
| `row-selected` | ítem o `null` | Clic en la fila sin `clickable-row`: la marca o la desmarca |

#### Diseño

- La tabla va de borde a borde de la tarjeta, sin recuadro propio: sale del relleno del
  `card-body` (como hacía `.table-card` de Velzon con el `DataTable.vue` de cada proyecto) y la
  primera columna queda alineada con el buscador y el título.
- Encabezado en un tono suave que lo separa de los registros (`--vt-head-bg`), con rótulos en
  mayúsculas pequeñas; la columna ordenada va en el primario y en negrita.
- Filas separadas por líneas, con el tono del primario bajo el puntero.
- Pie con el rango de registros y el paginador: flechas para ir a la página anterior o siguiente,
  números de página y la actual en tono suave del primario.

Los valores del diseño son variables CSS `--vt-*` al comienzo de los estilos del componente,
todas tomadas del tema (`--vz-*`).

#### Paginación en el servidor

Con `server-pagination` la tabla recibe solo la página actual y su meta, pinta el pie con esos
datos y emite `page-changed`; la página pide la siguiente. El orden por columna se aplica dentro
de la página recibida.

```vue
<DataTable
    :headers="headers"
    :items="thirdParties.data"
    server-pagination
    :pagination-meta="thirdParties.meta"
    @page-changed="(page) => router.reload({ data: { page } })"
/>
```

#### Diferencias con el `DataTable.vue` de los proyectos

- Ítems nuevos (otra búsqueda, una recarga de Inertia) vuelven a la página 1, igual que antes.
  Cambiar un campo de un ítem ya no reinicia la página ni el orden.
- Los vacíos van siempre al final, se ordene hacia arriba o hacia abajo. El texto se ordena
  natural y sin distinguir tildes ni mayúsculas ("item 2" antes de "item 10").
- `paging-type` y `pagination-labels` ya no existen: el pie es el mismo en todas las tablas.

## Probar sin publicar

El `vite.config.js` de la aplicación usa la **primera copia del paquete que exista**:

| Orden | Ruta | Cuándo aplica |
|---|---|---|
| 1 | `VUE_TABLES_PATH` | Variable de entorno opcional para forzar otra copia |
| 2 | `../package-vue-tables` | **Modo local**: la carpeta de trabajo, hermana de las apps |
| 3 | `vendor/sodeker/vue-tables` | **Modo publicado**: la versión que instaló Composer |

En modo local cada archivo que se guarda en `vue-tables` llega al navegador por HMR, igual que
un archivo de la propia app: **sin commit, sin tag y sin tocar Composer**. En el servidor
`../package-vue-tables` no existe y se usa la copia de `vendor/` sin cambiar nada.

### Conectar una aplicación (una sola vez)

**1. `vite.config.js`** — elegir la copia y registrar el plugin. La función sirve para todos los
paquetes de frontend de Sódeker (doma-frontend incluido):

```js
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Paquetes de frontend de Sódeker. De cada uno se usa la primera copia que
// exista: la ruta de su variable de entorno, la carpeta hermana ../package-*
// (montada en el contenedor node, para probar sin publicar) o la que instaló
// Composer en vendor/.
async function sodekerPackage(paths) {
    const root = paths
        .filter(Boolean)
        .map((path) => resolve(path))
        .find((path) => existsSync(resolve(path, 'vite.js')));

    return root ? (await import(pathToFileURL(resolve(root, 'vite.js')).href)).default : () => null;
}

// vue-tables: tablas de los listados.
const vueTables = await sodekerPackage([process.env.VUE_TABLES_PATH, '../package-vue-tables', 'vendor/sodeker/vue-tables']);

// …y en plugins: [laravel(…), vue(…), vueTables()]
```

**2. `docker-compose.yml`** — montar el paquete en el servicio `node`:

```yaml
    volumes:
      # vue-tables en vivo: vite.config.js lo prefiere a vendor/. Si la
      # carpeta no existe en el Mac, Docker monta una vacía y se usa vendor/.
      - ../package-vue-tables:/var/package-vue-tables:ro
    environment:
      # VUE_TABLES_PATH=vendor/sodeker/vue-tables en el .env para usar la
      # versión instalada por Composer. Vacío, se usa ../package-vue-tables.
      - VUE_TABLES_PATH=${VUE_TABLES_PATH:-}
```

La ruta `/var/package-vue-tables` no es arbitraria: la app vive en `/var/www`, así que
`../package-vue-tables` desde ahí es `/var/package-vue-tables`.

**3. Recrear el contenedor** — los volúmenes solo se aplican al crearlo:

```bash
docker compose up -d --no-deps --force-recreate node
```

**4. `jsconfig.json`** (opcional) — para que el editor resuelva `@vue-tables`:

```json
"@vue-tables": ["../package-vue-tables/resources/index.js", "vendor/sodeker/vue-tables/resources/index.js"],
"@vue-tables/*": ["../package-vue-tables/resources/*", "vendor/sodeker/vue-tables/resources/*"]
```

**Verificación:** el log de Vite debe decir qué copia usa.

```bash
docker logs node_suite 2>&1 | grep vue-tables
```

```
vue-tables: usando la copia local /var/package-vue-tables
```

Si no aparece la línea, se está usando `vendor/` (o el paquete no está en ninguna de las rutas).

### Reglas del modo local

- **Dependencias npm.** Todo paquete npm que importe una tabla se declara en `peerDependencies`
  y debe estar en el `package.json` de cada app. En modo local se resuelve siempre desde
  `node_modules` de la app: si allí no está, falla en local igual que fallaría en producción.
- **Cambios en `vite.js` o `package.json` del paquete** exigen reiniciar el contenedor:
  `docker restart node_suite`. El resto de archivos se refleja al guardar.
- **Nada que importe `@vue-tables` llega a `develop`** antes de que el paquete tenga un tag y la
  app lo instale por Composer: en el servidor no existe `../package-vue-tables`.
- **`vite build` con la copia local** muestra un aviso: esa build lleva código sin publicar.

## Publicar una versión

1. Registrar los cambios en `CHANGELOG.md` y crear el tag (`v0.x.y` mientras se define el diseño)
   sobre `main`, como en `package-doma-frontend`.
2. En cada app, declarar el repositorio e instalar:

   ```json
   "repositories": [
       { "type": "vcs", "url": "git@github.com:Sodeker-SAS/package-vue-tables.git", "no-api": true }
   ]
   ```

   ```bash
   docker compose exec php composer require sodeker/vue-tables:^0.0
   ```

3. Para probar en local la versión publicada en lugar de la carpeta de trabajo, definir
   `VUE_TABLES_PATH=vendor/sodeker/vue-tables` en el servicio `node` y reiniciarlo.

## Convenciones

- Vue 3 con `<script setup>`, en JavaScript, como en las apps.
- Nombres genéricos (`DataTable`), sin el nombre de un ecosistema: el paquete sirve a cualquier
  proyecto. Durante la migración convive con el `DataTable.vue` de cada proyecto; un
  `grep -rl "@vue-tables" resources/js` muestra qué pantallas ya lo usan.
- Estilos de cada componente en `<style scoped>`. **Ningún color fijo**: todo sale de las
  variables del tema del proyecto (`--vz-*` de Velzon), con los valores de fábrica de respaldo, y el radio
  es `var(--vz-border-radius, 0.25rem)`.
- Rótulos directos, sin conectores: "Sin registros.", "Anterior", "Siguiente".
- Íconos de Remix Icon (`ri-*`), que carga cada app.
- Cada componente o utilidad pública se exporta en `resources/index.js`.
- Código, comentarios y documentación en español.
