import { forwardRef, type InputHTMLAttributes } from 'react';
import type { Category } from '../../core/types';
import { validateValue } from '../../core/validate';
import { useI18n } from '../../i18n';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

interface Props extends InputProps {
  value: string;
  onChange: (value: string) => void;
  /** Tipo de dato: decide el teclado, las mayúsculas automáticas y la comprobación. */
  category: Category;
  invalid?: boolean;
}

/** Tipos que se escriben siempre en mayúsculas. */
const UPPER = new Set<Category>(['dni', 'cif', 'iban', 'matricula', 'catastro']);
/** Tipos que se pueden comprobar (y mostrar ✓ si están bien). */
const CHECKABLE = new Set<Category>(['dni', 'cif', 'iban', 'telefono', 'email', 'codigo_postal']);

/** "es9121000418450200051332" → "ES91 2100 0418 4502 0005 1332". */
function groupIban(v: string): string {
  const compact = v.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact) ? compact.replace(/(.{4})(?=.)/g, '$1 ') : v;
}

/** Casilla de texto que se adapta al tipo de dato (DNI, IBAN, teléfono, email…). */
export const SmartTextField = forwardRef<HTMLInputElement, Props>(function SmartTextField(
  { value, onChange, category, invalid, className, onBlur, ...rest },
  ref,
) {
  const { t } = useI18n();
  const valid = CHECKABLE.has(category) && value.trim() !== '' && !value.trim().startsWith('=') && !validateValue(category, value);
  const typeProps: InputHTMLAttributes<HTMLInputElement> =
    category === 'email'
      ? { type: 'email', inputMode: 'email', autoCapitalize: 'off' }
      : category === 'telefono'
        ? { type: 'tel', inputMode: 'tel' }
        : category === 'codigo_postal'
          ? { inputMode: 'numeric', maxLength: 5 }
          : UPPER.has(category)
            ? { autoCapitalize: 'characters', spellCheck: false }
            : {};

  return (
    <div className="custom-field">
      <div className="input-wrap">
        <input
          {...rest}
          {...typeProps}
          ref={ref}
          className={`${className ?? ''} ${invalid ? 'warn' : ''}`}
          value={value}
          onChange={(e) => onChange(UPPER.has(category) ? e.target.value.toUpperCase() : e.target.value)}
          onBlur={(e) => {
            if (category === 'iban') onChange(groupIban(value));
            onBlur?.(e);
          }}
        />
        {valid && (
          <span className="adornment static ok" title={t('field.valid')} aria-label={t('field.valid')}>
            ✓
          </span>
        )}
      </div>
    </div>
  );
});
