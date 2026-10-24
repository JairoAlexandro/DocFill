interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  small?: boolean;
  ariaLabel?: string;
}

/** Botones de opción única («Hombre / Mujer», «Claro / Oscuro»…). */
export function Segmented<T extends string>({ value, options, onChange, small, ariaLabel }: Props<T>) {
  return (
    <div className={`segmented ${small ? 'small' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
