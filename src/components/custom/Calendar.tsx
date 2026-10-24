import { useMemo, useState } from 'react';
import type { SimpleDate } from '../../core/dates';
import { Select } from './Select';

interface Props {
  value: SimpleDate | null;
  /** Mes que se muestra al abrir si aún no hay fecha elegida (p. ej. la fecha que ya tiene el documento). */
  initial?: SimpleDate | null;
  onPick: (date: SimpleDate) => void;
  locale: string;
  labels: { prev: string; next: string; today: string; year: string; month: string };
}

const same = (a: SimpleDate | null, b: SimpleDate) => !!a && a.d === b.d && a.m === b.m && a.y === b.y;

function todayDate(): SimpleDate {
  const n = new Date();
  return { d: n.getDate(), m: n.getMonth() + 1, y: n.getFullYear() };
}

/** Calendario mensual (lunes primero). Permite cambiar de mes y de año rápidamente, útil para fechas de nacimiento. */
export function Calendar({ value, initial, onPick, locale, labels }: Props) {
  const today = todayDate();
  const [view, setView] = useState(() => {
    const base = value ?? initial ?? today;
    return { y: base.y, m: base.m };
  });
  /** Lo que se está escribiendo en la casilla del año (null = mostrar el año actual de la vista). */
  const [yearDraft, setYearDraft] = useState<string | null>(null);

  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(locale, { month: 'long' })),
    [locale],
  );
  // 1 de enero de 2024 fue lunes.
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })),
    [locale],
  );

  const first = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7;
  const days = new Date(view.y, view.m, 0).getDate();
  const cells: (number | null)[] = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const move = (delta: number) =>
    setView((v) => {
      const m = v.m + delta;
      return m < 1 ? { y: v.y - 1, m: 12 } : m > 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m };
    });

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="icon-btn small" onClick={() => move(-1)} aria-label={labels.prev}>‹</button>
        <Select<number>
          small
          className="calendar-month"
          ariaLabel={labels.month}
          value={view.m}
          onChange={(m) => setView((v) => ({ ...v, m }))}
          options={monthNames.map((name, i) => ({ value: i + 1, label: name.charAt(0).toUpperCase() + name.slice(1) }))}
        />
        <input
          className="calendar-year"
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={yearDraft ?? String(view.y)}
          aria-label={labels.year}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            // Se puede escribir libremente; el año se aplica en cuanto tiene 4 cifras.
            const draft = e.target.value.replace(/\D/g, '').slice(0, 4);
            setYearDraft(draft);
            if (draft.length === 4) setView((v) => ({ ...v, y: Number(draft) }));
          }}
          onBlur={() => setYearDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              setYearDraft(null);
              setView((v) => ({ ...v, y: v.y + (e.key === 'ArrowUp' ? 1 : -1) }));
            }
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <button type="button" className="icon-btn small" onClick={() => move(1)} aria-label={labels.next}>›</button>
      </div>
      <div className="calendar-grid" role="grid">
        {weekDays.map((d, i) => (
          <span key={`w${i}`} className="calendar-wd">{d}</span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className={`${same(value, { d, m: view.m, y: view.y }) ? 'selected' : ''} ${same(today, { d, m: view.m, y: view.y }) ? 'today' : ''}`}
              onClick={() => onPick({ d, m: view.m, y: view.y })}
            >
              {d}
            </button>
          ),
        )}
      </div>
      <button type="button" className="link-btn" onClick={() => onPick(today)}>{labels.today}</button>
    </div>
  );
}
