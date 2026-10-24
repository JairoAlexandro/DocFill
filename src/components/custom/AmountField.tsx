import { forwardRef, type InputHTMLAttributes } from 'react';
import { formatNumber, isFormula } from '../../core/formula';
import { apocopate, numberToWords, parseAmount } from '../../core/numberWords';
import { useI18n } from '../../i18n';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

interface Props extends InputProps {
  value: string;
  onChange: (value: string) => void;
  /** Muestra cómo quedará en letras (si el documento lo escribe también en letras). */
  showWords?: boolean;
  invalid?: boolean;
}

/** Importe en euros: al salir de la casilla se escribe con puntos de miles (1.234,50). */
export const AmountField = forwardRef<HTMLInputElement, Props>(function AmountField(
  { value, onChange, showWords, invalid, className, onBlur, ...rest },
  ref,
) {
  const { t } = useI18n();
  const n = isFormula(value) ? null : parseAmount(value);

  return (
    <div className="custom-field">
      <div className="input-wrap">
        <input
          {...rest}
          ref={ref}
          className={`${className ?? ''} ${invalid ? 'warn' : ''}`}
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            if (n != null && !isFormula(value)) onChange(formatNumber(n));
            onBlur?.(e);
          }}
        />
        <span className="adornment static" aria-hidden="true">€</span>
      </div>
      {showWords && n != null && n >= 1 && <div className="field-note">{t('amount.words', { w: apocopate(numberToWords(Math.floor(n))) })}</div>}
    </div>
  );
});
