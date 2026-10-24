import { useEffect, type RefObject } from 'react';

/** Cierra un desplegable al pulsar fuera de él o la tecla Escape. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement>, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Si un desplegable de dentro ya ha atendido el Escape (preventDefault), este no se cierra.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose]);
}
