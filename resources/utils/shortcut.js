/**
 * Atajos de teclado escritos como texto: 'Alt+A', 'Ctrl+Shift+N', 'Alt+Enter'.
 *
 * Las letras y los dígitos se comparan por la tecla física (`event.code`): en
 * Mac, Option+A escribe «å» y comparar por `event.key` nunca coincidiría. El
 * resto de teclas (Enter, ArrowDown…) se compara por `event.key`.
 */

const MODIFIERS = {
    alt: 'altKey',
    option: 'altKey',
    ctrl: 'ctrlKey',
    control: 'ctrlKey',
    shift: 'shiftKey',
    meta: 'metaKey',
    cmd: 'metaKey',
};

/**
 * @param {string|null} shortcut
 * @returns {{ altKey: boolean, ctrlKey: boolean, shiftKey: boolean, metaKey: boolean, code: string|null, key: string|null } | null}
 */
export function parseShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== 'string') {
        return null;
    }

    const parts = shortcut.split('+').map((part) => part.trim()).filter(Boolean);
    const main = parts.pop();
    if (!main) {
        return null;
    }

    const parsed = { altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, code: null, key: null };
    for (const part of parts) {
        const modifier = MODIFIERS[part.toLowerCase()];
        if (!modifier) {
            return null;
        }
        parsed[modifier] = true;
    }

    if (/^[a-z]$/i.test(main)) {
        parsed.code = `Key${main.toUpperCase()}`;
    } else if (/^[0-9]$/.test(main)) {
        parsed.code = `Digit${main}`;
    } else {
        parsed.key = main.toLowerCase();
    }

    return parsed;
}

/** ¿El evento de teclado corresponde al atajo ya interpretado por `parseShortcut`? */
export function matchesShortcut(event, parsed) {
    if (!parsed || !event) {
        return false;
    }

    const sameModifiers = ['altKey', 'ctrlKey', 'shiftKey', 'metaKey']
        .every((modifier) => Boolean(event[modifier]) === parsed[modifier]);

    if (!sameModifiers) {
        return false;
    }

    return parsed.code
        ? event.code === parsed.code
        : String(event.key ?? '').toLowerCase() === parsed.key;
}
