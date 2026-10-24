import { forwardRef, useRef, useState, type InputHTMLAttributes } from 'react';
import { DATE_STYLES, formatDateStyle, parseDate, type DateStyle, type SimpleDate } from '../../core/dates';
import { useI18n } from '../../i18n';
import { Calendar } from './Calendar';
import { useDismiss } from './useDismiss';
import { Select } from './Select';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

interface Props extends InputProps {
  value: string;
  onChange: (value: string) => void;
  /** Formato de la fecha en el documento. Sin `onFormatChange` no se muestra el selector. */
  format?: DateStyle;
  onFormatChange?: (format: DateStyle) => void;
  invalid?: boolean;
  /** Fecha que tiene ahora el documento: el calendario se abre en ese mes. */
  reference?: string;
}

const EXAMPLE: SimpleDate = { d: 2, m: 11, y: 2002 };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Fecha: se puede escribir o elegir en el calendario, y decidir cómo se escribe en el documento
 * (02/11/2002, 2 de noviembre de 2002…). También admite fórmulas ("= {Fecha} + 1 año").
 */
export const DateField = forwardRef<HTMLInputElement, Props>(function DateField(
  { value, onChange, format, onFormatChange, invalid, reference, className, ...rest },
  ref,
) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open, box, () => setOpen(false));

  const parsed = value.trim().startsWith('=') ? null : parseDate(value);
  const sample = parsed ?? EXAMPLE;

  return (
    <div className="custom-field date-field" ref={box}>
      <div className="input-wrap">
        <input
          {...rest}
          ref={ref}
          className={`${className ?? ''} ${invalid ? 'warn' : ''}`}
          value={value}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="adornment" onClick={() => setOpen((o) => !o)} aria-label={t('date.pick')} title={t('date.pick')} aria-expanded={open}>
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3.5" y="5" width="17" height="15" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="popover">
          <Calendar
            value={parsed}
            initial={reference ? parseDate(reference) : null}
            locale={locale}
            labels={{ prev: t('date.prevMonth'), next: t('date.nextMonth'), today: t('date.today'), year: t('date.year'), month: t('date.month') }}
            onPick={(d) => {
              onChange(`${pad(d.d)}/${pad(d.m)}/${d.y}`);
              setOpen(false);
            }}
          />
        </div>
      )}
      {onFormatChange && (
        <div className="format-row">
          <span>{t('date.format')}</span>
          <Select<DateStyle>
            small
            ariaLabel={t('date.format')}
            value={format ?? 'keep'}
            onChange={onFormatChange}
            options={DATE_STYLES.map((s) =>
              s === 'keep'
                ? { value: s, label: t('date.keep') }
                : { value: s, label: formatDateStyle(sample, s), hint: t(`date.style.${s}`) },
            )}
          />
        </div>
      )}
    </div>
  );
});
