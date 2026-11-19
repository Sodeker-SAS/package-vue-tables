<script setup>
/**
 * Tabla de los listados (Index). Reemplaza el DataTable.vue que cada proyecto
 * tenía copiado, con la misma API de props, slots y eventos: migrar una
 * pantalla es cambiar el import.
 *
 * No usa jQuery ni DataTables. Vue ordena y pagina una copia de los ítems, así
 * que nada toca el DOM que Vue pinta (con DataTables, cambiar columnas reventaba
 * el thead y las clases del <th> se borraban al reordenar).
 *
 * Dos modos de paginación:
 * - Cliente (por defecto): recibe todos los ítems; ordena y pagina aquí.
 * - Servidor (`server-pagination`): recibe solo la página actual y su meta;
 *   ordena dentro de la página y avisa el cambio de página con `page-changed`.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { compareSortValues, sortValue, SORT_TYPES } from '../utils/sorting.js';
import { paginationItems } from '../utils/pagination.js';

const props = defineProps({
    /** id del <table>. */
    id: { type: String, default: null },
    /**
     * Columnas: { key, label, width?, align?: 'start'|'center'|'end',
     * orderable?: false (o sortable: false), sortKey?, sortType?, highlight?, wrap?,
     * group?, sticky? }
     *
     * - `group`: clave del grupo (ver `header-groups`); las columnas seguidas del
     *   mismo grupo comparten un rótulo encima.
     * - `sticky`: las primeras columnas seguidas con `sticky: true` quedan fijas a
     *   la izquierda al desplazar la tabla de lado. Van al inicio y sin grupo.
     */
    headers: { type: Array, required: true },
    /**
     * Rótulo de cada grupo de columnas y, si se quiere, sus clases:
     * `{ eggs: { label: 'Huevos', class: 'bg-warning-subtle text-warning' } }`.
     * Sin ninguna columna con `group`, el encabezado es de una sola fila.
     */
    headerGroups: { type: Object, default: () => ({}) },
    items: { type: Array, required: true },
    /** Campo que identifica cada ítem: llave de la fila y de `highlighted-key`. */
    itemKey: { type: String, default: null },
    /** Filas por página en el cliente; 0 o menos, todas en una página. */
    pageLength: { type: Number, default: 10 },
    /** Columna del orden inicial: su `key` o su `sortKey`. Sin ella, la primera ordenable. */
    orderBy: { type: String, default: null },
    orderDir: { type: String, default: 'asc', validator: (value) => ['asc', 'desc'].includes(value) },
    /** Tipo de dato de la columna inicial (`order-by`) si ella no trae `sortType`. */
    orderType: { type: String, default: 'text', validator: (value) => SORT_TYPES.includes(value) },
    /** Respeta el orden de `items` y ninguna columna se puede ordenar. */
    preserveOrder: { type: Boolean, default: false },
    /** Respeta el orden de `items` al cargar; el usuario sí puede ordenar por columna. */
    preserveItemsOrder: { type: Boolean, default: false },
    /** Clic en la fila emite `row-click` (no si el clic es en un enlace, botón o campo). */
    clickableRow: { type: Boolean, default: false },
    serverPagination: { type: Boolean, default: false },
    /** Meta del paginador de Laravel: current_page (o page), last_page, per_page, total. */
    paginationMeta: { type: Object, default: () => ({}) },
    /** Resalta la fila cuyo `item-key` vale esto (p. ej. el registro por el que se filtra). */
    highlightedKey: { type: [String, Number], default: null },
    /** Clase extra por fila: fija o `(item) => string|object|array`. */
    rowClass: { type: [Function, String, Array, Object], default: null },
    /** Filas alternadas. */
    striped: { type: Boolean, default: false },
    /** Datos de las filas en mayúsculas, como lo hacía el DataTable de cada proyecto. */
    uppercase: { type: Boolean, default: true },
    /** Totales al pie, en las dos últimas columnas: [{ label, value, highlight? }]. */
    summaryRows: { type: Array, default: () => [] },
    emptyText: { type: String, default: 'Sin registros.' },
    /**
     * Con `false` los rótulos del encabezado nunca se recortan: el rótulo completo
     * es el ancho mínimo de su columna y, si la tabla no cabe, se desplaza de lado.
     * Con `true` (por defecto) y anchos propios, lo que no cabe termina en «…».
     */
    truncateLabels: { type: Boolean, default: true },
});

const emit = defineEmits(['row-click', 'row-selected', 'sort-changed', 'page-changed']);

// Un clic en estos elementos es suyo, no de la fila.
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], .dropdown, [data-bs-toggle]';

/* ---------- Columnas ---------- */

const hasCustomWidths = computed(() => props.headers.some((header) => Boolean(header.width)));
// Anchos fijos (`table-layout: fixed`) solo si los rótulos se pueden recortar: con
// `truncate-labels` en false los anchos son el mínimo y la tabla crece.
const fixedLayout = computed(() => hasCustomWidths.value && props.truncateLabels);

function isOrderable(header) {
    return !props.preserveOrder && header?.orderable !== false && header?.sortable !== false;
}

function matchesOrderBy(header) {
    return Boolean(props.orderBy) && (header.key === props.orderBy || header.sortKey === props.orderBy);
}

function sortTypeOf(header) {
    return header.sortType ?? (matchesOrderBy(header) ? props.orderType : 'text');
}

function cellClass(header) {
    return { 'is-center': header.align === 'center', 'is-end': header.align === 'end', 'is-wrap': header.wrap };
}

/* ---------- Grupos de columnas ---------- */

const hasHeaderGroups = computed(() => props.headers.some((header) => Boolean(header.group)));

/**
 * Las filas del encabezado. Sin grupos, una fila con todas las columnas. Con
 * grupos, arriba el rótulo de cada grupo (`colspan`) y las columnas sin grupo
 * (`rowspan` 2); abajo, las columnas de cada grupo. Cada columna conserva su
 * índice, así el orden y las clases no cambian.
 */
const headerRows = computed(() => {
    const column = (header, index, rowspan = 1) => ({ kind: 'column', key: `c-${index}`, header, index, rowspan });

    if (!hasHeaderGroups.value) {
        return [props.headers.map((header, index) => column(header, index))];
    }

    const top = [];
    const bottom = [];

    props.headers.forEach((header, index) => {
        if (!header.group) {
            top.push(column(header, index, 2));
            return;
        }

        const last = top[top.length - 1];
        if (last?.kind === 'group' && last.group === header.group) {
            last.colspan += 1;
        } else {
            const group = props.headerGroups?.[header.group] ?? {};
            top.push({
                kind: 'group',
                key: `g-${index}`,
                start: index,
                group: header.group,
                label: group.label ?? header.group,
                class: group.class ?? '',
                colspan: 1,
            });
        }

        bottom.push(column(header, index));
    });

    return [top, bottom];
});

/** La primera y la última columna de la tabla llevan el relleno de la tarjeta. */
function edgeClass(first, last) {
    return { 'is-first': first === 0, 'is-last': last === props.headers.length - 1 };
}

/** Línea al inicio de cada grupo (y en la columna que lo cierra) y aire al final. */
function groupClass(index) {
    if (!hasHeaderGroups.value) {
        return null;
    }
    const group = props.headers[index]?.group ?? null;
    const previous = index > 0 ? (props.headers[index - 1]?.group ?? null) : null;
    const next = props.headers[index + 1]?.group ?? null;

    return {
        'is-group-start': index > 0 && group !== previous,
        'is-group-end': group !== null && next !== group,
    };
}

/* ---------- Columnas fijas ---------- */

const tableEl = ref(null);
let stickyObserver = null;

/** Las primeras columnas seguidas con `sticky: true`. */
const stickyCount = computed(() => {
    const index = props.headers.findIndex((header) => !header.sticky);
    return index === -1 ? props.headers.length : index;
});

function stickyClass(index) {
    return index < stickyCount.value
        ? { 'is-sticky': true, 'is-sticky-last': index === stickyCount.value - 1 }
        : null;
}

function stickyStyle(index) {
    return index < stickyCount.value ? { left: `var(--vt-sticky-${index}, 0px)` } : null;
}

/**
 * Cada columna fija se pega a la izquierda en la suma de los anchos de las
 * anteriores. Los anchos los decide el navegador, así que se miden y se vuelven
 * a medir si cambian; van en variables CSS de la tabla, no en cada celda.
 */
function observeSticky() {
    stickyObserver?.disconnect();
    stickyObserver = null;

    const table = tableEl.value;
    if (!table || stickyCount.value === 0) {
        return;
    }

    const cells = Array.from(table.querySelectorAll(':scope > thead th.is-sticky'));
    const measure = () => {
        let left = 0;
        cells.forEach((cell, index) => {
            table.style.setProperty(`--vt-sticky-${index}`, `${left}px`);
            left += cell.getBoundingClientRect().width;
        });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
        stickyObserver = new ResizeObserver(measure);
        cells.forEach((cell) => stickyObserver.observe(cell));
    }
}

/* ---------- Orden ---------- */

const sort = ref(initialSort());

function initialSort() {
    if (props.preserveOrder || props.preserveItemsOrder) {
        return { key: null, dir: props.orderDir };
    }
    const header = props.headers.find((candidate) => isOrderable(candidate) && matchesOrderBy(candidate))
        ?? props.headers.find(isOrderable);

    return { key: header?.key ?? null, dir: props.orderDir };
}

const sortedHeader = computed(() => props.headers.find((header) => header.key === sort.value.key) ?? null);

const sortedItems = computed(() => {
    const header = sortedHeader.value;
    if (!header) {
        return props.items;
    }

    const field = header.sortKey ?? header.key;
    const type = sortTypeOf(header);

    // Orden estable: a igual valor, se respeta el orden en que llegaron.
    return props.items
        .map((item, index) => ({ item, index, value: sortValue(item?.[field], type) }))
        .sort((a, b) => compareSortValues(a.value, b.value, sort.value.dir) || a.index - b.index)
        .map(({ item }) => item);
});

function toggleSort(header) {
    if (!isOrderable(header)) {
        return;
    }
    const dir = sort.value.key === header.key && sort.value.dir === 'asc' ? 'desc' : 'asc';
    sort.value = { key: header.key, dir };
    page.value = 1;
    emitSort();
}

function emitSort() {
    const header = sortedHeader.value;
    if (!header) {
        return;
    }
    emit('sort-changed', { sortBy: header.sortKey ?? header.key, sortDir: sort.value.dir, sortType: sortTypeOf(header) });
}

function ariaSort(header) {
    if (!isOrderable(header)) {
        return undefined;
    }
    if (sort.value.key !== header.key) {
        return 'none';
    }
    return sort.value.dir === 'asc' ? 'ascending' : 'descending';
}

function sortIcon(header) {
    if (sort.value.key !== header.key) {
        return 'ri-arrow-up-down-line';
    }
    return sort.value.dir === 'asc' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
}

/* ---------- Paginación ---------- */

const page = ref(1);
const meta = computed(() => props.paginationMeta ?? {});

const total = computed(() => (props.serverPagination
    ? Number(meta.value.total ?? props.items.length)
    : sortedItems.value.length));

const perPage = computed(() => {
    const size = props.serverPagination ? Number(meta.value.per_page ?? props.pageLength) : props.pageLength;
    return size > 0 ? size : Math.max(total.value, 1);
});

const currentPage = computed(() => (props.serverPagination
    ? Number(meta.value.current_page ?? meta.value.page ?? 1)
    : page.value));

const lastPage = computed(() => Math.max(1, props.serverPagination && meta.value.last_page
    ? Number(meta.value.last_page)
    : Math.ceil(total.value / perPage.value)));

const firstRow = computed(() => (total.value ? (currentPage.value - 1) * perPage.value + 1 : 0));
const lastRow = computed(() => Math.min(currentPage.value * perPage.value, total.value));

const pageItems = computed(() => (props.serverPagination
    ? sortedItems.value
    : sortedItems.value.slice(firstRow.value - 1, lastRow.value)));

const pages = computed(() => paginationItems(currentPage.value, lastPage.value));

const rangeText = computed(() => {
    const noun = total.value === 1 ? 'registro' : 'registros';
    return `${firstRow.value}–${lastRow.value} de ${total.value.toLocaleString('es-CO')} ${noun}`;
});

function goToPage(target) {
    if (target < 1 || target > lastPage.value || target === currentPage.value) {
        return;
    }
    if (!props.serverPagination) {
        page.value = target;
    }
    emit('page-changed', target);
}

/* ---------- Filas ---------- */

const selectedRow = ref(null);

function rowKey(item, index) {
    const key = props.itemKey ? item?.[props.itemKey] : null;
    return key != null ? String(key) : index;
}

function rowClasses(item) {
    const custom = typeof props.rowClass === 'function' ? props.rowClass(item) : props.rowClass;

    return [
        {
            'is-clickable': props.clickableRow,
            'is-selected': selectedRow.value === item,
            'is-highlighted': props.highlightedKey !== null
                && props.itemKey !== null
                && item?.[props.itemKey] === props.highlightedKey,
        },
        custom,
    ];
}

function onRowClick(event, item) {
    if (event.target.closest(INTERACTIVE)) {
        return;
    }
    if (props.clickableRow) {
        emit('row-click', item);
        return;
    }
    selectedRow.value = selectedRow.value === item ? null : item;
    emit('row-selected', selectedRow.value);
}

function onRowEnter(event, item) {
    if (props.clickableRow && event.target === event.currentTarget) {
        emit('row-click', item);
    }
}

/* ---------- Pie de totales ---------- */

const summarySpacerColspan = computed(() => Math.max(props.headers.length - 2, 0));

/* ---------- Sincronía con las props ---------- */

// Ítems nuevos (otra búsqueda, una recarga de Inertia): de vuelta a la primera
// página. Cambiar un campo de un ítem no reinicia nada.
watch(() => props.items, () => {
    page.value = 1;
});

watch(
    () => [props.orderBy, props.orderDir, props.orderType, props.preserveOrder, props.preserveItemsOrder],
    () => {
        sort.value = initialSort();
        page.value = 1;
    },
);

// Si la columna ordenada desaparece, vuelve el orden inicial.
watch(() => props.headers.map((header) => header.key).join('|'), () => {
    if (sort.value.key && !props.headers.some((header) => header.key === sort.value.key && isOrderable(header))) {
        sort.value = initialSort();
    }
});

// Otras columnas u otras fijas: se vuelven a medir cuando el DOM ya cambió.
watch(
    () => props.headers.map((header) => `${header.key}:${header.sticky ? 1 : 0}:${header.group ?? ''}`).join('|'),
    () => nextTick(observeSticky),
);

watch(lastPage, (last) => {
    if (page.value > last) {
        page.value = last;
    }
});

onMounted(() => {
    emitSort();
    observeSticky();
});

onBeforeUnmount(() => stickyObserver?.disconnect());
</script>

<template>
    <div
        class="vt-table"
        :class="{ 'vt-table--striped': striped, 'vt-table--uppercase': uppercase }"
    >
        <div class="vt-table__frame">
            <table
                :id="id"
                ref="tableEl"
                class="vt-table__table"
                :class="{ 'is-fixed': fixedLayout, 'is-full-labels': !truncateLabels, 'is-grouped': hasHeaderGroups }"
            >
                <colgroup v-if="hasCustomWidths">
                    <col v-for="(header, index) in headers" :key="index" :style="header.width ? { width: header.width } : null">
                </colgroup>

                <thead>
                    <tr v-for="(row, rowIndex) in headerRows" :key="rowIndex">
                        <template v-for="cell in row" :key="cell.key">
                            <!-- Rótulo de un grupo de columnas. -->
                            <th
                                v-if="cell.kind === 'group'"
                                scope="colgroup"
                                :colspan="cell.colspan"
                                class="vt-table__group is-center is-group-start"
                                :class="[cell.class, edgeClass(cell.start, cell.start + cell.colspan - 1)]"
                            >
                                <slot :name="`group-${cell.group}`" :group="cell">{{ cell.label }}</slot>
                            </th>
                            <th
                                v-else
                                scope="col"
                                :rowspan="cell.rowspan > 1 ? cell.rowspan : undefined"
                                :class="[cellClass(cell.header), edgeClass(cell.index, cell.index), groupClass(cell.index), stickyClass(cell.index)]"
                                :style="stickyStyle(cell.index)"
                                :aria-sort="ariaSort(cell.header)"
                            >
                                <button
                                    v-if="isOrderable(cell.header)"
                                    type="button"
                                    class="vt-table__sort"
                                    :class="{ 'is-sorted': sort.key === cell.header.key }"
                                    @click="toggleSort(cell.header)"
                                >
                                    <!-- data-label: reserva el ancho del rótulo en negrita (ver estilos). -->
                                    <span class="vt-table__label" :data-label="cell.header.label">
                                        <span class="vt-table__label-text">
                                            <slot :name="`head-${cell.header.key}`" :header="cell.header">
                                                <slot :name="`header-${cell.header.key}`" :header="cell.header">{{ cell.header.label }}</slot>
                                            </slot>
                                        </span>
                                    </span>
                                    <i class="vt-table__sort-icon" :class="sortIcon(cell.header)" aria-hidden="true"></i>
                                </button>
                                <span v-else class="vt-table__label">
                                    <span class="vt-table__label-text">
                                        <slot :name="`head-${cell.header.key}`" :header="cell.header">
                                            <slot :name="`header-${cell.header.key}`" :header="cell.header">{{ cell.header.label }}</slot>
                                        </slot>
                                    </span>
                                </span>
                            </th>
                        </template>
                    </tr>
                </thead>

                <tbody>
                    <tr
                        v-for="(item, index) in pageItems"
                        :key="rowKey(item, index)"
                        class="vt-table__row"
                        :class="rowClasses(item)"
                        :tabindex="clickableRow ? 0 : undefined"
                        @click="onRowClick($event, item)"
                        @keydown.enter="onRowEnter($event, item)"
                    >
                        <td
                            v-for="(header, column) in headers"
                            :key="column"
                            :class="[cellClass(header), groupClass(column), stickyClass(column)]"
                            :style="stickyStyle(column)"
                        >
                            <slot
                                :name="`cell-${header.key}`"
                                :item="item"
                                :header="header"
                                :value="item?.[header.key]"
                                :index="firstRow - 1 + index"
                            >
                                <span :class="{ 'vt-table__value--highlight': header.highlight }">{{ item?.[header.key] }}</span>
                            </slot>
                        </td>
                    </tr>

                    <tr v-if="!pageItems.length" class="vt-table__empty-row">
                        <td :colspan="headers.length">
                            <slot name="empty">
                                <div class="vt-table__empty">
                                    <i class="ri-inbox-line" aria-hidden="true"></i>
                                    <span>{{ emptyText }}</span>
                                </div>
                            </slot>
                        </td>
                    </tr>
                </tbody>

                <tfoot v-if="summaryRows.length || $slots.footer">
                    <tr v-if="summaryRows.length" class="vt-table__summary">
                        <td v-if="summarySpacerColspan" :colspan="summarySpacerColspan"></td>
                        <td class="is-end">
                            <div
                                v-for="(row, rowIndex) in summaryRows"
                                :key="`summary-label-${rowIndex}`"
                                class="vt-table__summary-line vt-table__summary-label"
                                :class="{ 'is-highlight': row.highlight }"
                            >
                                <slot name="summary-label" :row="row" :index="rowIndex">{{ row.label }}</slot>
                            </div>
                        </td>
                        <td class="is-end">
                            <div
                                v-for="(row, rowIndex) in summaryRows"
                                :key="`summary-value-${rowIndex}`"
                                class="vt-table__summary-line vt-table__summary-value"
                                :class="{ 'is-highlight': row.highlight }"
                            >
                                <slot name="summary-value" :row="row" :index="rowIndex">{{ row.value }}</slot>
                            </div>
                        </td>
                    </tr>
                    <slot name="footer" :headers="headers" />
                </tfoot>
            </table>
        </div>

        <div v-if="total > 0" class="vt-table__footer">
            <div class="vt-table__range" role="status" aria-live="polite">{{ rangeText }}</div>

            <nav v-if="lastPage > 1" class="vt-table__pagination" aria-label="Páginas">
                <button
                    type="button"
                    class="vt-table__page"
                    aria-label="Anterior"
                    :disabled="currentPage <= 1"
                    @click="goToPage(currentPage - 1)"
                >
                    <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
                </button>
                <template v-for="entry in pages" :key="`${entry.type}-${entry.value}`">
                    <span v-if="entry.type === 'ellipsis'" class="vt-table__page is-ellipsis" aria-hidden="true">…</span>
                    <button
                        v-else
                        type="button"
                        class="vt-table__page"
                        :class="{ 'is-active': entry.value === currentPage }"
                        :aria-current="entry.value === currentPage ? 'page' : undefined"
                        @click="goToPage(entry.value)"
                    >
                        {{ entry.value }}
                    </button>
                </template>
                <button
                    type="button"
                    class="vt-table__page"
                    aria-label="Siguiente"
                    :disabled="currentPage >= lastPage"
                    @click="goToPage(currentPage + 1)"
                >
                    <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
                </button>
            </nav>
        </div>
    </div>
</template>

<style scoped>
/*
 * Ningún color fijo: todo sale de las variables del tema de cada proyecto
 * (--vz-* de Velzon), con los valores de fábrica de respaldo. Así la tabla toma
 * el primario, los bordes y el modo oscuro de cada proyecto.
 */
.vt-table {
    --vt-border: var(--vz-border-color, #e9ebec);
    --vt-radius: var(--vz-border-radius, 0.25rem);
    --vt-surface: var(--vz-secondary-bg, #fff);
    /* Tono suave que separa el encabezado de los registros: sobre blanco da
       #fcfcfc y en modo oscuro aclara el fondo en la misma medida. */
    --vt-head-bg: rgba(var(--vz-body-color-rgb, 33, 37, 41), 0.012);
    --vt-muted: var(--vz-secondary-color, #878a99);
    --vt-text: var(--vz-body-color, #212529);
    --vt-primary: var(--vz-primary, #25a0e2);
    --vt-primary-rgb: var(--vz-primary-rgb, 37, 160, 226);
    /* Tono del primario para texto: más legible que el primario sobre blanco. */
    --vt-primary-ink: var(--vz-primary-text-emphasis, #1f88c0);
    --vt-zebra: transparent;
    --vt-hover-bg: rgba(var(--vt-primary-rgb), 0.04);
    --vt-cell-x: 0.75rem;
    --vt-cell-y: 0.8rem;
    /* Relleno de la tarjeta: la tabla llega a sus bordes y la primera columna
       queda alineada con el buscador y el título. */
    --vt-card-x: var(--vz-card-spacer-x, 1rem);
    /* Separa los grupos de columnas y las columnas fijas: más marcada que el
       borde normal, que casi no se distingue sobre las filas alternadas. */
    --vt-group-line: var(--vz-border-color-translucent, rgba(0, 0, 0, 0.175));

    color: var(--vt-text);
    font-size: var(--vz-body-font-size, 0.8125rem);
}

/* ---------- Contenedor: a ras de la tarjeta ---------- */

/* Sale del relleno del card-body hasta los bordes de la tarjeta, como hacía
   .table-card de Velzon con el DataTable de cada proyecto. */
.vt-table__frame {
    overflow-x: auto;
    margin-inline: calc(-1 * var(--vt-card-x));
    border-block: var(--vz-border-width, 1px) solid var(--vt-border);
    background-color: var(--vt-surface);
}

.vt-table__table {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
}

.vt-table__table.is-fixed {
    table-layout: fixed;
}

.vt-table__table th,
.vt-table__table td {
    padding: var(--vt-cell-y) var(--vt-cell-x);
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
}

.vt-table__table th.is-first,
.vt-table__table td:first-child {
    padding-left: var(--vt-card-x);
}

.vt-table__table th.is-last,
.vt-table__table td:last-child {
    padding-right: var(--vt-card-x);
}

.vt-table__table .is-center {
    text-align: center;
}

.vt-table__table .is-end {
    text-align: end;
}

.vt-table__table .is-wrap {
    white-space: normal;
}

/* Con anchos propios las columnas no crecen: lo que no cabe termina en "…". */
.vt-table__table.is-fixed th,
.vt-table__table.is-fixed td {
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ---------- Encabezado ---------- */

.vt-table__table thead th {
    border-bottom: var(--vz-border-width, 1px) solid var(--vt-border);
    background-color: var(--vt-head-bg);
    color: var(--vt-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

/* ---------- Grupos de columnas ---------- */

/* El rótulo del grupo, más bajo que el de las columnas. */
.vt-table__table thead th.vt-table__group {
    padding-top: 0.4rem;
    padding-bottom: 0.4rem;
}

.vt-table__table .is-group-start {
    border-left: var(--vz-border-width, 1px) solid var(--vt-group-line);
    padding-left: 1rem;
}

.vt-table__table .is-group-end {
    padding-right: 1rem;
}

/* ---------- Columnas fijas ---------- */

/* Se pintan con el fondo de la tarjeta para que no se vea lo que pasa por
   debajo; el tono de la fila (cebra, hover, selección) va encima como imagen.
   La última lleva una línea a la derecha: un borde no acompaña a una celda
   fija, una pseudo-capa sí. */
.vt-table__table th.is-sticky,
.vt-table__table td.is-sticky {
    position: sticky;
    z-index: 1;
}

.vt-table__table thead th.is-sticky {
    z-index: 3;
    background-color: var(--vt-surface);
    background-image: linear-gradient(var(--vt-head-bg), var(--vt-head-bg));
}

.vt-table__row > td.is-sticky {
    background-color: var(--vt-surface);
    background-image: linear-gradient(var(--vt-row-bg), var(--vt-row-bg));
}

.vt-table__table .is-sticky-last::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--vz-border-width, 1px);
    background: var(--vt-group-line);
}

/* ---------- Rótulos completos (`truncate-labels` en false) ---------- */

.vt-table__table.is-full-labels .vt-table__label,
.vt-table__table.is-full-labels .vt-table__label-text {
    min-width: max-content;
    overflow: visible;
}

.vt-table__sort {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: var(--vt-radius);
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: inherit;
    text-transform: inherit;
    cursor: pointer;
}

/* En las columnas a la derecha la flecha va a la izquierda del rótulo, así el
   rótulo queda alineado con los números. */
.vt-table__table th.is-end .vt-table__sort {
    flex-direction: row-reverse;
}

.vt-table__sort:focus-visible {
    outline: 2px solid rgba(var(--vt-primary-rgb), 0.45);
    outline-offset: 2px;
}

/* El rótulo reserva siempre el ancho de su versión en negrita: una copia
   invisible (::after) comparte la celda de la grilla. Sin esto, al ordenar por
   una columna su rótulo crecía y la columna se corría unos píxeles. */
.vt-table__label {
    display: inline-grid;
    min-width: 0;
    overflow: hidden;
}

.vt-table__label-text,
.vt-table__label::after {
    grid-area: 1 / 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vt-table__table th.is-wrap .vt-table__label-text {
    white-space: normal;
}

.vt-table__label::after {
    content: attr(data-label);
    height: 0;
    font-weight: 700;
    visibility: hidden;
    pointer-events: none;
}

.vt-table__sort-icon {
    flex-shrink: 0;
    font-size: 0.85em;
    line-height: 1;
    opacity: 0.35;
    transition: opacity 0.15s ease, color 0.15s ease;
}

.vt-table__sort:hover {
    color: var(--vt-text);
}

.vt-table__sort:hover .vt-table__sort-icon {
    opacity: 0.8;
}

.vt-table__sort.is-sorted {
    color: var(--vt-primary-ink);
    font-weight: 700;
}

.vt-table__sort.is-sorted .vt-table__sort-icon {
    opacity: 1;
}

/* ---------- Filas ---------- */

.vt-table__table tbody tr + tr > td {
    border-top: var(--vz-border-width, 1px) solid var(--vt-border);
}

.vt-table--uppercase .vt-table__row > td {
    text-transform: uppercase;
}

.vt-table--striped {
    --vt-zebra: rgba(var(--vz-body-color-rgb, 33, 37, 41), 0.025);
}

/* Cebra, puntero, selección y resaltado, en ese orden: cada uno pisa al anterior.
   El tono va en una variable de la fila para que las columnas fijas lo pinten
   encima de su fondo opaco. */
.vt-table__row {
    --vt-row-bg: transparent;
}

.vt-table__row > td {
    background-color: var(--vt-row-bg);
}

.vt-table__row:nth-child(even) {
    --vt-row-bg: var(--vt-zebra);
}

.vt-table__row:hover {
    --vt-row-bg: var(--vt-hover-bg);
}

.vt-table__row.is-selected {
    --vt-row-bg: rgba(var(--vt-primary-rgb), 0.08);
}

.vt-table__row.is-highlighted {
    --vt-row-bg: var(--vz-primary-bg-subtle, #def1fb);
}

.vt-table__row.is-clickable {
    cursor: pointer;
}

.vt-table__row.is-clickable:focus-visible {
    outline: 2px solid rgba(var(--vt-primary-rgb), 0.45);
    outline-offset: -2px;
}

.vt-table__value--highlight {
    color: var(--vt-primary);
    font-weight: 600;
}

/* ---------- Sin registros ---------- */

.vt-table__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 2rem 1rem;
    color: var(--vt-muted);
    white-space: normal;
}

.vt-table__empty i {
    font-size: 1.75rem;
    line-height: 1;
    opacity: 0.6;
}

/* ---------- Totales ---------- */

.vt-table__table tfoot td {
    border-top: var(--vz-border-width, 1px) solid var(--vt-border);
    vertical-align: top;
}

.vt-table__summary-line {
    font-weight: 600;
    line-height: 1.6;
}

.vt-table__summary-label {
    text-transform: uppercase;
}

.vt-table__summary-value {
    font-variant-numeric: tabular-nums;
}

.vt-table__summary-line.is-highlight {
    color: var(--vt-primary);
    font-weight: 700;
}

/* ---------- Pie: rango y páginas ---------- */

.vt-table__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.75rem;
    color: var(--vt-muted);
}

.vt-table__range {
    font-variant-numeric: tabular-nums;
}

.vt-table__pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
}

.vt-table__page {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--vt-radius);
    background-color: transparent;
    color: var(--vt-text);
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
}

.vt-table__page i {
    font-size: 1.1rem;
    line-height: 1;
}

.vt-table__page:hover:not(:disabled):not(.is-active):not(.is-ellipsis) {
    background-color: var(--vz-tertiary-bg, #f3f6f9);
}

.vt-table__page:focus-visible {
    outline: 2px solid rgba(var(--vt-primary-rgb), 0.45);
    outline-offset: 1px;
}

/* La página actual, en tono suave del primario. */
.vt-table__page.is-active {
    background-color: rgba(var(--vt-primary-rgb), 0.12);
    color: var(--vt-primary-ink);
    font-weight: 600;
    cursor: default;
}

.vt-table__page:disabled {
    opacity: 0.4;
    cursor: default;
}

.vt-table__page.is-ellipsis {
    min-width: 1.5rem;
    padding: 0;
    color: var(--vt-muted);
    cursor: default;
}
</style>
