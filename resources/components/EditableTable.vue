<script setup>
/**
 * Tabla de captura: filas y columnas que el usuario arma y llena. Sirve para
 * cualquier grilla editable (detalles de un documento, tablas de parámetros,
 * matrices de valores) porque no sabe qué hay en cada celda: la app pinta los
 * campos por slot.
 *
 * Es controlada: nunca modifica `columns` ni `rows`. Reordenar columnas emite
 * `update:columns` con el nuevo orden (sirve `v-model:columns`); agregar o quitar
 * filas y columnas solo avisa con un evento, y la app decide (confirmar, abrir un
 * modal, armar la fila nueva…). Cada acción se enciende o se apaga con props.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { paginationItems } from '../utils/pagination.js';
import { moveItem } from '../utils/reorder.js';
import { matchesShortcut, parseShortcut } from '../utils/shortcut.js';

const props = defineProps({
    /** id del <table>. */
    id: { type: String, default: null },
    /**
     * Columnas: { key, label, width?, minWidth?, align?: 'start'|'center'|'end', wrap?,
     * headerClass?, cellClass?, draggable?: false, editable?: false, removable?: false }.
     * `draggable`, `editable` y `removable` en false bloquean esa acción solo en esa columna.
     */
    columns: { type: Array, required: true },
    rows: { type: Array, required: true },
    /** Campo que identifica cada fila, o función `(row, index) => llave`. Sin él, la posición. */
    rowKey: { type: [String, Function], default: null },
    /** Campo que identifica cada columna. */
    columnKey: { type: String, default: 'key' },
    /** Valor de la celda que se muestra si la app no usa slot: `(row, column) => valor`. */
    cellValue: { type: Function, default: (row, column) => row?.[column.key] },

    /* ---------- Acciones (todas se apagan con `readonly`) ---------- */
    canAddRows: { type: Boolean, default: true },
    canRemoveRows: { type: Boolean, default: true },
    canAddColumns: { type: Boolean, default: false },
    canEditColumns: { type: Boolean, default: false },
    canRemoveColumns: { type: Boolean, default: false },
    /** Arrastrar el encabezado (o Alt+← / Alt+→ con el foco en él) para mover la columna. */
    canReorderColumns: { type: Boolean, default: false },
    /** Solo lectura: oculta todas las acciones. */
    readonly: { type: Boolean, default: false },
    /** Topes: al llegar, el botón de agregar se oculta. */
    maxRows: { type: Number, default: null },
    maxColumns: { type: Number, default: null },

    /* ---------- Teclado y foco ---------- */
    /** Atajo para agregar fila: 'Alt+A', 'Ctrl+Enter'… Sin valor, no hay atajo. */
    addRowShortcut: { type: String, default: null },
    /** 'focus': el atajo solo actúa con el foco dentro de la tabla. 'global': en toda la página. */
    shortcutScope: { type: String, default: 'focus', validator: (value) => ['focus', 'global'].includes(value) },
    /** Al aparecer una fila nueva, pone el foco en su primer campo. */
    focusNewRow: { type: Boolean, default: true },

    /* ---------- Apariencia ---------- */
    /** Número de fila en la primera columna. */
    rowNumbers: { type: Boolean, default: true },
    /** Líneas entre columnas y borde alrededor. */
    bordered: { type: Boolean, default: true },
    striped: { type: Boolean, default: false },
    /** A ras de la tarjeta, como el DataTable (sin borde lateral). */
    flush: { type: Boolean, default: false },
    /** 'sm' para celdas compactas con campos pequeños. */
    size: { type: String, default: 'md', validator: (value) => ['sm', 'md'].includes(value) },
    /** Herramientas de la columna: 'hover' las muestra al pasar el puntero (siempre en pantallas táctiles). */
    columnTools: { type: String, default: 'hover', validator: (value) => ['hover', 'always'].includes(value) },
    /** La fila «Nueva fila» queda visible aunque la tabla se desplace a la derecha. */
    stickyAddRow: { type: Boolean, default: true },
    /** Quita las flechas de subir y bajar de los campos numéricos de las celdas. */
    hideNumberSpinners: { type: Boolean, default: true },
    /** Filas por página, con el mismo paginador del DataTable. 0: todas, sin paginador. */
    pageLength: { type: Number, default: 0 },
    /** Clase extra por fila: fija o `(row, index) => string|object|array`. */
    rowClass: { type: [Function, String, Array, Object], default: null },

    /* ---------- Rótulos ---------- */
    addRowLabel: { type: String, default: 'Nueva fila' },
    addColumnLabel: { type: String, default: 'Agregar columna' },
    editColumnLabel: { type: String, default: 'Editar columna' },
    removeColumnLabel: { type: String, default: 'Eliminar columna' },
    removeRowLabel: { type: String, default: 'Eliminar fila' },
    dragColumnLabel: { type: String, default: 'Arrastre para mover la columna' },
    emptyText: { type: String, default: 'Sin filas.' },
    noColumnsText: { type: String, default: 'Sin columnas.' },
});

const emit = defineEmits([
    'update:columns',
    'column-moved',
    'add-column',
    'edit-column',
    'remove-column',
    'add-row',
    'remove-row',
]);

const root = ref(null);
const body = ref(null);

/* ---------- Llaves ---------- */

function columnId(column, index) {
    return column?.[props.columnKey] ?? index;
}

function rowId(row, index) {
    if (typeof props.rowKey === 'function') return props.rowKey(row, index);
    if (props.rowKey) return row?.[props.rowKey] ?? index;
    return index;
}

/* ---------- Qué se muestra ---------- */

const editable = computed(() => !props.readonly);
const rowsReached = computed(() => props.maxRows !== null && props.rows.length >= props.maxRows);
const columnsReached = computed(() => props.maxColumns !== null && props.columns.length >= props.maxColumns);

const showAddRow = computed(() => editable.value && props.canAddRows && props.columns.length > 0 && !rowsReached.value);
const showAddColumn = computed(() => editable.value && props.canAddColumns && !columnsReached.value);
const showRemoveRow = computed(() => editable.value && props.canRemoveRows);
/** Última columna: el + del encabezado y la papelera (o el slot) de cada fila. */
const hasActionsColumn = computed(() => showAddColumn.value || showRemoveRow.value);
const totalColumns = computed(() => props.columns.length + (props.rowNumbers ? 1 : 0) + (hasActionsColumn.value ? 1 : 0));

function canDrag(column) {
    return editable.value && props.canReorderColumns && column?.draggable !== false && props.columns.length > 1;
}

function canEdit(column) {
    return editable.value && props.canEditColumns && column?.editable !== false;
}

function canRemove(column) {
    return editable.value && props.canRemoveColumns && column?.removable !== false;
}

function alignClass(column) {
    return {
        'is-center': column?.align === 'center',
        'is-end': column?.align === 'end',
        'is-wrap': column?.wrap,
    };
}

function columnStyle(column) {
    const style = {};
    if (column?.width) style.width = column.width;
    if (column?.minWidth) style.minWidth = column.minWidth;
    return Object.keys(style).length ? style : null;
}

function rowClasses(row, index) {
    return typeof props.rowClass === 'function' ? props.rowClass(row, index) : props.rowClass;
}

/* ---------- Mover columnas ---------- */

const dragIndex = ref(null);
const overIndex = ref(null);

function moveColumn(from, to) {
    if (from === to || to < 0 || to >= props.columns.length) return;
    const column = props.columns[from];
    emit('update:columns', moveItem(props.columns, from, to));
    emit('column-moved', { column, from, to });
}

function onDragStart(event, index) {
    dragIndex.value = index;
    // Firefox no arrastra sin datos en el dataTransfer.
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(index) {
    if (dragIndex.value !== null) overIndex.value = index;
}

function onDrop(index) {
    if (dragIndex.value !== null) moveColumn(dragIndex.value, index);
    endDrag();
}

function endDrag() {
    dragIndex.value = null;
    overIndex.value = null;
}

/** Alternativa sin mouse: Alt+← y Alt+→ con el foco en el encabezado. */
async function onHeaderKeydown(event, index) {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (!canDrag(props.columns[index])) return;
    event.preventDefault();
    const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
    if (to < 0 || to >= props.columns.length) return;
    moveColumn(index, to);
    await nextTick();
    root.value?.querySelectorAll('thead .vt-editable__column')[to]?.focus();
}

/* ---------- Paginación ---------- */

// Cliente, como el DataTable: se pinta solo la página actual, pero el número de
// fila y el índice de los eventos y slots siguen siendo los de `rows`.
const page = ref(1);
const paginated = computed(() => props.pageLength > 0);
const perPage = computed(() => (paginated.value ? props.pageLength : Math.max(props.rows.length, 1)));
const lastPage = computed(() => Math.max(1, Math.ceil(props.rows.length / perPage.value)));
const firstIndex = computed(() => (page.value - 1) * perPage.value);
const pageRows = computed(() => props.rows.slice(firstIndex.value, firstIndex.value + perPage.value));
const pages = computed(() => paginationItems(page.value, lastPage.value));

const rangeText = computed(() => {
    const total = props.rows.length;
    const noun = total === 1 ? 'fila' : 'filas';
    const last = Math.min(firstIndex.value + perPage.value, total);
    return `${firstIndex.value + 1}–${last} de ${total.toLocaleString('es-CO')} ${noun}`;
});

function goToPage(target) {
    if (target >= 1 && target <= lastPage.value) page.value = target;
}

function pageOf(index) {
    return Math.floor(index / perPage.value) + 1;
}

// Al quitar filas la página puede dejar de existir: queda en la última.
watch(lastPage, (last) => {
    if (page.value > last) page.value = last;
});

/* ---------- Filas ---------- */

function requestAddRow() {
    if (showAddRow.value) emit('add-row');
}

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"]';

// Al aparecer filas nuevas se muestra la página de la primera de ellas y el
// foco va a su primer campo.
watch(
    () => props.rows.map((row, index) => rowId(row, index)),
    async (keys, previous) => {
        if (!previous || keys.length <= previous.length) return;
        const before = new Set(previous);
        const index = keys.findIndex((key) => !before.has(key));
        if (index < 0) return;
        page.value = pageOf(index);
        if (!props.focusNewRow) return;
        await nextTick();
        body.value?.querySelectorAll(':scope > tr.vt-editable__row')[index - firstIndex.value]?.querySelector(FOCUSABLE)?.focus();
    },
);

/* ---------- Atajo ---------- */

const shortcut = computed(() => parseShortcut(props.addRowShortcut));

function onKeydown(event) {
    if (!shortcut.value || !showAddRow.value || !matchesShortcut(event, shortcut.value)) return;
    if (props.shortcutScope === 'focus' && !root.value?.contains(document.activeElement)) return;
    event.preventDefault();
    requestAddRow();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div
        ref="root"
        class="vt-editable"
        :class="{
            'is-bordered': bordered,
            'is-striped': striped,
            'is-flush': flush,
            'is-sm': size === 'sm',
            'is-tools-always': columnTools === 'always',
            'is-no-spinners': hideNumberSpinners,
        }"
    >
        <div class="vt-editable__frame">
            <table :id="id" class="vt-editable__table">
                <thead>
                    <tr>
                        <th v-if="rowNumbers" scope="col" class="vt-editable__index">#</th>
                        <th
                            v-for="(column, index) in columns"
                            :key="columnId(column, index)"
                            scope="col"
                            class="vt-editable__column"
                            :class="[
                                alignClass(column),
                                column.headerClass,
                                {
                                    'is-draggable': canDrag(column),
                                    'is-dragging': dragIndex === index,
                                    'is-drop-target': overIndex === index && dragIndex !== index,
                                },
                            ]"
                            :style="columnStyle(column)"
                            :draggable="canDrag(column) ? 'true' : undefined"
                            :tabindex="canDrag(column) ? 0 : undefined"
                            :title="canDrag(column) ? dragColumnLabel : undefined"
                            @dragstart="canDrag(column) && onDragStart($event, index)"
                            @dragover.prevent="onDragOver(index)"
                            @dragleave="overIndex = null"
                            @drop.prevent="onDrop(index)"
                            @dragend="endDrag"
                            @keydown="onHeaderKeydown($event, index)"
                        >
                            <div class="vt-editable__head">
                                <i v-if="canDrag(column)" class="ri-draggable vt-editable__grip" aria-hidden="true"></i>
                                <slot :name="`head-${columnId(column, index)}`" :column="column" :index="index">
                                    <slot name="head" :column="column" :index="index">
                                        <button
                                            v-if="canEdit(column)"
                                            type="button"
                                            class="vt-editable__label is-button"
                                            :title="editColumnLabel"
                                            @click="emit('edit-column', column, index)"
                                        >
                                            {{ column.label }}
                                        </button>
                                        <span v-else class="vt-editable__label">{{ column.label }}</span>
                                    </slot>
                                </slot>
                                <div v-if="canEdit(column) || canRemove(column) || $slots['column-tools']" class="vt-editable__tools">
                                    <slot name="column-tools" :column="column" :index="index" />
                                    <button
                                        v-if="canEdit(column)"
                                        type="button"
                                        class="vt-editable__icon"
                                        :title="editColumnLabel"
                                        :aria-label="`${editColumnLabel} ${column.label ?? ''}`"
                                        @click="emit('edit-column', column, index)"
                                    >
                                        <i class="ri-pencil-line" aria-hidden="true"></i>
                                    </button>
                                    <button
                                        v-if="canRemove(column)"
                                        type="button"
                                        class="vt-editable__icon is-danger"
                                        :title="removeColumnLabel"
                                        :aria-label="`${removeColumnLabel} ${column.label ?? ''}`"
                                        @click="emit('remove-column', column, index)"
                                    >
                                        <i class="ri-delete-bin-line" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                        </th>
                        <th v-if="hasActionsColumn" scope="col" class="vt-editable__actions">
                            <button
                                v-if="showAddColumn"
                                type="button"
                                class="vt-editable__add-column"
                                :title="addColumnLabel"
                                :aria-label="addColumnLabel"
                                @click="emit('add-column')"
                            >
                                <i class="ri-add-line" aria-hidden="true"></i>
                            </button>
                        </th>
                    </tr>
                </thead>

                <tbody ref="body">
                    <tr v-if="!columns.length" class="vt-editable__empty-row">
                        <td :colspan="totalColumns">
                            <slot name="no-columns">
                                <div class="vt-editable__empty">{{ noColumnsText }}</div>
                            </slot>
                        </td>
                    </tr>
                    <tr v-else-if="!rows.length" class="vt-editable__empty-row">
                        <td :colspan="totalColumns">
                            <slot name="empty">
                                <div class="vt-editable__empty">{{ emptyText }}</div>
                            </slot>
                        </td>
                    </tr>
                    <template v-else>
                        <tr
                            v-for="(row, offset) in pageRows"
                            :key="rowId(row, firstIndex + offset)"
                            class="vt-editable__row"
                            :class="rowClasses(row, firstIndex + offset)"
                        >
                            <td v-if="rowNumbers" class="vt-editable__index">{{ firstIndex + offset + 1 }}</td>
                            <td
                                v-for="(column, columnIndex) in columns"
                                :key="columnId(column, columnIndex)"
                                :class="[alignClass(column), column.cellClass]"
                            >
                                <slot
                                    :name="`cell-${columnId(column, columnIndex)}`"
                                    :row="row"
                                    :column="column"
                                    :rowIndex="firstIndex + offset"
                                    :columnIndex="columnIndex"
                                    :value="cellValue(row, column)"
                                >
                                    <slot
                                        name="cell"
                                        :row="row"
                                        :column="column"
                                        :rowIndex="firstIndex + offset"
                                        :columnIndex="columnIndex"
                                        :value="cellValue(row, column)"
                                    >
                                        {{ cellValue(row, column) }}
                                    </slot>
                                </slot>
                            </td>
                            <td v-if="hasActionsColumn" class="vt-editable__actions">
                                <slot name="row-actions" :row="row" :rowIndex="firstIndex + offset">
                                    <button
                                        v-if="showRemoveRow"
                                        type="button"
                                        class="vt-editable__icon is-danger is-soft"
                                        :title="removeRowLabel"
                                        :aria-label="`${removeRowLabel} ${firstIndex + offset + 1}`"
                                        @click="emit('remove-row', row, firstIndex + offset)"
                                    >
                                        <i class="ri-delete-bin-5-line" aria-hidden="true"></i>
                                    </button>
                                </slot>
                            </td>
                        </tr>
                    </template>
                </tbody>

                <tfoot v-if="showAddRow || $slots.footer">
                    <tr v-if="showAddRow" class="vt-editable__add-row">
                        <td :colspan="totalColumns">
                            <div class="vt-editable__add-row-content" :class="{ 'is-sticky': stickyAddRow }">
                                <slot name="add-row" :add="requestAddRow">
                                    <button type="button" class="vt-editable__add-row-button" @click="requestAddRow">
                                        <i class="ri-add-line" aria-hidden="true"></i>
                                        {{ addRowLabel }}
                                    </button>
                                    <span v-if="addRowShortcut" class="vt-editable__shortcut">{{ addRowShortcut }}</span>
                                </slot>
                            </div>
                        </td>
                    </tr>
                    <slot name="footer" :columns="columns" :totalColumns="totalColumns" />
                </tfoot>
            </table>
        </div>

        <div v-if="paginated && rows.length" class="vt-editable__footer">
            <div class="vt-editable__range" role="status" aria-live="polite">{{ rangeText }}</div>

            <nav v-if="lastPage > 1" class="vt-editable__pagination" aria-label="Páginas">
                <button
                    type="button"
                    class="vt-editable__page"
                    aria-label="Anterior"
                    :disabled="page <= 1"
                    @click="goToPage(page - 1)"
                >
                    <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
                </button>
                <template v-for="entry in pages" :key="`${entry.type}-${entry.value}`">
                    <span v-if="entry.type === 'ellipsis'" class="vt-editable__page is-ellipsis" aria-hidden="true">…</span>
                    <button
                        v-else
                        type="button"
                        class="vt-editable__page"
                        :class="{ 'is-active': entry.value === page }"
                        :aria-current="entry.value === page ? 'page' : undefined"
                        @click="goToPage(entry.value)"
                    >
                        {{ entry.value }}
                    </button>
                </template>
                <button
                    type="button"
                    class="vt-editable__page"
                    aria-label="Siguiente"
                    :disabled="page >= lastPage"
                    @click="goToPage(page + 1)"
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
 * (--vz-* de Velzon), con los valores de fábrica de respaldo. Son las mismas
 * variables --vt-* del DataTable, así las dos tablas se ven del mismo sistema.
 */
.vt-editable {
    --vt-border: var(--vz-border-color, #e9ebec);
    --vt-radius: var(--vz-border-radius, 0.25rem);
    --vt-surface: var(--vz-secondary-bg, #fff);
    --vt-head-bg: rgba(var(--vz-body-color-rgb, 33, 37, 41), 0.012);
    --vt-foot-bg: var(--vz-light, #f3f6f9);
    --vt-muted: var(--vz-secondary-color, #878a99);
    --vt-text: var(--vz-body-color, #212529);
    --vt-primary: var(--vz-primary, #25a0e2);
    --vt-primary-rgb: var(--vz-primary-rgb, 37, 160, 226);
    --vt-primary-ink: var(--vz-primary-text-emphasis, #1f88c0);
    --vt-danger: var(--vz-danger, #f06548);
    --vt-danger-rgb: var(--vz-danger-rgb, 240, 101, 72);
    --vt-zebra: rgba(var(--vz-body-color-rgb, 33, 37, 41), 0.025);
    --vt-cell-x: 0.75rem;
    --vt-cell-y: 0.6rem;
    --vt-card-x: var(--vz-card-spacer-x, 1rem);
    --vt-line: var(--vz-border-width, 1px) solid var(--vt-border);

    color: var(--vt-text);
    font-size: var(--vz-body-font-size, 0.8125rem);
}

.vt-editable.is-sm {
    --vt-cell-x: 0.5rem;
    --vt-cell-y: 0.4rem;
}

/* ---------- Contenedor ---------- */

.vt-editable__frame {
    overflow-x: auto;
    background-color: var(--vt-surface);
}

.vt-editable.is-bordered .vt-editable__frame {
    border: var(--vt-line);
    border-radius: 0;
}

/* A ras de la tarjeta, como el DataTable: sale del relleno del card-body. */
.vt-editable.is-flush .vt-editable__frame {
    margin-inline: calc(-1 * var(--vt-card-x));
    border-inline: 0;
    border-radius: 0;
}

.vt-editable__table {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
}

.vt-editable__table th,
.vt-editable__table td {
    padding: var(--vt-cell-y) var(--vt-cell-x);
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
    border-bottom: var(--vt-line);
}

.vt-editable__table tbody tr:last-child td {
    border-bottom: 0;
}

.vt-editable.is-bordered .vt-editable__table th + th,
.vt-editable.is-bordered .vt-editable__table td + td {
    border-left: var(--vt-line);
}

.vt-editable__table .is-center {
    text-align: center;
}

.vt-editable__table .is-end {
    text-align: end;
}

.vt-editable__table .is-wrap {
    white-space: normal;
}

.vt-editable.is-striped .vt-editable__row:nth-child(even) td {
    background-color: var(--vt-zebra);
}

/* ---------- Encabezado ---------- */

.vt-editable__table thead th {
    background-color: var(--vt-head-bg);
    font-weight: 600;
}

.vt-editable__column.is-draggable {
    cursor: grab;
}

.vt-editable__column.is-dragging {
    opacity: 0.45;
}

.vt-editable__column.is-drop-target {
    box-shadow: inset 3px 0 0 var(--vt-primary);
    background-color: rgba(var(--vt-primary-rgb), 0.08);
}

.vt-editable__column:focus-visible {
    outline: 2px solid rgba(var(--vt-primary-rgb), 0.45);
    outline-offset: -2px;
}

.vt-editable__head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.vt-editable__table th.is-center .vt-editable__head {
    justify-content: center;
}

.vt-editable__table th.is-end .vt-editable__head {
    justify-content: flex-end;
}

.vt-editable__grip {
    color: var(--vt-muted);
}

.vt-editable__label {
    color: var(--vt-muted);
    font-weight: 600;
}

.vt-editable__label.is-button {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
}

.vt-editable__label.is-button:hover {
    color: var(--vt-primary-ink);
}

.vt-editable__tools {
    display: inline-flex;
    gap: 0.1rem;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.15s;
}

.vt-editable__column:hover .vt-editable__tools,
.vt-editable__column:focus-within .vt-editable__tools,
.vt-editable.is-tools-always .vt-editable__tools {
    opacity: 1;
}

@media (hover: none) {
    .vt-editable__tools {
        opacity: 1;
    }
}

/* ---------- Botones de ícono ---------- */

.vt-editable__icon,
.vt-editable__add-column {
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border: 0;
    border-radius: var(--vt-radius);
    background: none;
    color: var(--vt-muted);
    cursor: pointer;
}

.vt-editable__icon:hover {
    background-color: rgba(var(--vt-primary-rgb), 0.1);
    color: var(--vt-primary-ink);
}

.vt-editable__icon.is-danger:hover {
    background-color: rgba(var(--vt-danger-rgb), 0.12);
    color: var(--vt-danger);
}

.vt-editable__icon.is-soft.is-danger {
    background-color: rgba(var(--vt-danger-rgb), 0.12);
    color: var(--vt-danger);
}

.vt-editable__icon.is-soft.is-danger:hover {
    background-color: var(--vt-danger);
    color: var(--vt-surface);
}

.vt-editable__add-column {
    background-color: rgba(var(--vt-primary-rgb), 0.12);
    color: var(--vt-primary-ink);
}

.vt-editable__add-column:hover {
    background-color: var(--vt-primary);
    color: var(--vt-surface);
}

.vt-editable__icon:focus-visible,
.vt-editable__add-column:focus-visible,
.vt-editable__label.is-button:focus-visible,
.vt-editable__add-row-button:focus-visible {
    outline: 2px solid rgba(var(--vt-primary-rgb), 0.45);
    outline-offset: 2px;
}

/* ---------- Columnas fijas ---------- */

.vt-editable__table .vt-editable__index {
    width: 1%;
    color: var(--vt-muted);
    text-align: center;
    font-variant-numeric: tabular-nums;
}

.vt-editable__table .vt-editable__actions {
    width: 1%;
    text-align: center;
}

/* ---------- Vacíos ---------- */

.vt-editable__empty {
    padding: 1.25rem 0.5rem;
    color: var(--vt-muted);
    text-align: center;
    white-space: normal;
}

/* ---------- Pie: nueva fila ---------- */

.vt-editable__add-row td {
    border-top: var(--vt-line);
    border-bottom: 0;
    background-color: var(--vt-foot-bg);
}

/* Fija al borde izquierdo visible aunque la tabla se desplace a la derecha. */
.vt-editable__add-row-content {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}

.vt-editable__add-row-content.is-sticky {
    position: sticky;
    left: var(--vt-cell-x);
}

.vt-editable__add-row-button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--vt-primary);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}

.vt-editable__add-row-button:hover {
    color: var(--vt-primary-ink);
    text-decoration: underline;
}

.vt-editable__shortcut {
    color: var(--vt-muted);
    font-size: 0.75rem;
}

/* ---------- Campos numéricos sin flechas (los pinta la app por slot) ---------- */

.vt-editable.is-no-spinners :deep(input[type='number']::-webkit-outer-spin-button),
.vt-editable.is-no-spinners :deep(input[type='number']::-webkit-inner-spin-button) {
    -webkit-appearance: none;
    margin: 0;
}

.vt-editable.is-no-spinners :deep(input[type='number']) {
    -moz-appearance: textfield;
    appearance: textfield;
}

@media (prefers-reduced-motion: reduce) {
    .vt-editable__tools {
        transition: none;
    }
}

/* ---------- Pie: rango y páginas (los mismos del DataTable) ---------- */

.vt-editable__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.75rem;
    color: var(--vt-muted);
}

.vt-editable__range {
    font-variant-numeric: tabular-nums;
}

.vt-editable__pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
}

.vt-editable__page {
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

.vt-editable__page i {
    font-size: 1.1rem;
    line-height: 1;
}

.vt-editable__page:hover:not(:disabled):not(.is-active):not(.is-ellipsis) {
    background-color: var(--vz-tertiary-bg, #f3f6f9);
}

.vt-editable__page:focus-visible {
    outline: 2px solid rgba(var(--vt-primary-rgb), 0.45);
    outline-offset: 1px;
}

/* La página actual, en tono suave del primario. */
.vt-editable__page.is-active {
    background-color: rgba(var(--vt-primary-rgb), 0.12);
    color: var(--vt-primary-ink);
    font-weight: 600;
    cursor: default;
}

.vt-editable__page:disabled {
    opacity: 0.4;
    cursor: default;
}

.vt-editable__page.is-ellipsis {
    min-width: 1.5rem;
    padding: 0;
    color: var(--vt-muted);
    cursor: default;
}
</style>
