import type { Gender, Paragraph, RepeatBlock, Variable } from '../core/types';
import { blockVars, genderKey } from '../core/repeat';
import { truncate } from '../core/text';
import { validateValue } from '../core/validate';
import { useI18n } from '../i18n';
import { Segmented, ValueField } from './custom';

interface Props {
  repeats: RepeatBlock[];
  variables: Variable[];
  paragraphs: Paragraph[];
  onChange: (id: string, block: RepeatBlock | null) => void;
}

/** Panel de las listas que se repiten: una ficha por persona extra. */
export function RepeatPanel({ repeats, variables, paragraphs, onChange }: Props) {
  const { t } = useI18n();
  return (
    <>
      <h3 className="panel-title">{t('panel.repeatTitle', { n: repeats.length })}</h3>
      {repeats.length === 0 && <p className="panel-hint">{t('panel.repeatHint')}</p>}
      {repeats.map((b) => {
        const vars = blockVars(b, variables);
        const set = (patch: Partial<RepeatBlock>) => onChange(b.id, { ...b, ...patch });
        const setValue = (k: number, varId: string, value: string) =>
          set({ entries: b.entries.map((e, i) => (i === k ? { ...e, [varId]: value } : e)) });
        return (
          <div key={b.id} className="clause repeat-box">
            <span className="clause-text">
              {truncate(
                b.paras
                  .map((p) => paragraphs[p]?.text.trim())
                  .filter(Boolean)
                  .join(' · '),
                110,
              )}
            </span>
            {vars.length === 0 ? (
              <p className="panel-hint">{t('panel.noVarsInBlock')}</p>
            ) : (
              <>
                <p className="panel-hint">{t('panel.personMain')}</p>
                {b.entries.map((entry, k) => (
                  <div key={k} className="person">
                    <div className="person-head">
                      <strong>{t('panel.person', { n: k + 2 })}</strong>
                      <button className="btn small ghost" onClick={() => set({ entries: b.entries.filter((_, i) => i !== k) })}>
                        {t('panel.removePerson')}
                      </button>
                    </div>
                    {vars.map((v) => {
                      const warning = validateValue(v.category, entry[v.id] ?? '');
                      return (
                        <label key={v.id} className="field compact">
                          {v.label}
                          <ValueField
                            category={v.category}
                            invalid={!!warning}
                            value={entry[v.id] ?? ''}
                            placeholder={v.original}
                            onChange={(value) => setValue(k, v.id, value)}
                          />
                          {warning && <span className="warning">{t(warning)}</span>}
                        </label>
                      );
                    })}
                    {vars
                      .filter((v) => v.originalGender)
                      .map((v) => {
                        const current = (entry[genderKey(v.id)] as Gender | undefined) ?? v.gender ?? v.originalGender;
                        return (
                          <div key={`g-${v.id}`} className="gender-row">
                            <span className="muted">{t('panel.gender')}</span>
                            <Segmented<Gender>
                              small
                              ariaLabel={t('panel.gender')}
                              value={current ?? 'm'}
                              onChange={(g) => setValue(k, genderKey(v.id), g)}
                              options={[
                                { value: 'm', label: t('panel.male') },
                                { value: 'f', label: t('panel.female') },
                              ]}
                            />
                          </div>
                        );
                      })}
                  </div>
                ))}
                <button className="btn small" onClick={() => set({ entries: [...b.entries, {}] })}>
                  {t('panel.addPerson')}
                </button>
                <label className="check">
                  <input type="checkbox" checked={b.joinOutside} onChange={(e) => set({ joinOutside: e.target.checked })} />
                  {t('panel.joinOutside')}
                </label>
              </>
            )}
            <div className="clause-actions">
              <button className="btn small ghost" onClick={() => onChange(b.id, null)}>
                {t('panel.removeRepeat')}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
