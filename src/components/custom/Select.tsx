import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDismiss } from './useDismiss';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Texto pequeño bajo la opción (p. ej. «con ceros»). */
  hint?: string;
}

interface Props<T extends string | number> {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Texto cuando no hay nada elegido. Útil para menús de acción («Unir con…»). */
  placeholder?: string;
  ariaLabel?: string;
  small?: boolean;
  className?: string;
  /** Contenido extra delante del texto del botón (un icono, por ejemplo). */
  icon?: ReactNode;
}

/**
 * Desplegable propio, con el mismo estilo en todos los navegadores y en modo oscuro.
 * Teclado: flechas, Inicio/Fin, Intro, Escape y la primera letra de una opción.
 */
export function Select<T extends string | number>({ value, options, onChange, placeholder, ariaLabel, small, className, icon }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  useDismiss(open, box, () => setOpen(false));

  const selected = options.find((o) => o.value === value);

  const show = () => {
    // Si no hay sitio debajo, la lista se abre hacia arriba.
    const rect = box.current?.getBoundingClientRect();
    setUp(!!rect && window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom);
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  };

  useEffect(() => {
    if (open) list.current?.children[cursor]?.scrollIntoView({ block: 'nearest' });
  }, [open, cursor]);

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape') {
      // Cierra solo esta lista, no el calendario o menú que la contiene.
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') setCursor((c) => Math.min(options.length - 1, c + 1));
    else if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1));
    else if (e.key === 'Home') setCursor(0);
    else if (e.key === 'End') setCursor(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(cursor);
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const i = options.findIndex((o, j) => j > cursor && o.label.toLowerCase().startsWith(k));
      const first = options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (i >= 0 || first >= 0) setCursor(i >= 0 ? i : first);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className={`select ${small ? 'small' : ''} ${className ?? ''}`} ref={box}>
      <button
        type="button"
        className="select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${cursor}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        {icon}
        <span className={selected ? 'select-value' : 'select-value placeholder'}>{selected?.label ?? placeholder ?? ''}</span>
        <svg className="chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul ref={list} id={`${id}-list`} className={`select-list ${up ? 'up' : ''}`} role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`${i === cursor ? 'cursor' : ''} ${o.value === value ? 'selected' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <span className="select-check" aria-hidden="true">{o.value === value ? '✓' : ''}</span>
              <span className="select-text">
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
