import { forwardRef, type InputHTMLAttributes } from 'react';
import type { Category } from '../../core/types';
import { AmountField } from './AmountField';
import { DateField } from './DateField';
import { SmartTextField } from './SmartTextField';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

interface Props extends InputProps {
  category: Category;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

/** Elige la casilla adecuada para cada tipo de dato: calendario para fechas, € para importes, etc. */
export const ValueField = forwardRef<HTMLInputElement, Props>(function ValueField({ category, ...rest }, ref) {
  if (category === 'fecha') return <DateField {...rest} ref={ref} />;
  if (category === 'importe') return <AmountField {...rest} ref={ref} />;
  return <SmartTextField {...rest} ref={ref} category={category} />;
});
