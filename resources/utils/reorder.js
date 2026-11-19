/**
 * Copia de `list` con el elemento de la posición `from` movido a `to`. No toca
 * la lista original: así el componente avisa el nuevo orden y la app decide.
 *
 *     moveItem(['a', 'b', 'c'], 0, 2) → ['b', 'c', 'a']
 *
 * Con posiciones fuera de rango o iguales devuelve una copia sin cambios.
 *
 * @template T
 * @param {T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(list, from, to) {
    const copy = [...list];
    const inRange = (index) => Number.isInteger(index) && index >= 0 && index < copy.length;

    if (!inRange(from) || !inRange(to) || from === to) {
        return copy;
    }

    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);

    return copy;
}
