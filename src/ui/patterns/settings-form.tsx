'use client';

import { QUOTE_VALIDITIES } from '@/contracts/airwallex';
import { Input } from '@/ui/primitives/input';
import { Select } from '@/ui/primitives/select';

export interface SettingsValues {
  homeCurrency: string;
  leadDays: string;
  validity: string;
  windowStart: string;
  cutoff: string;
  timeZone: string;
}

export function SettingsForm({
  values,
  onChange,
}: {
  values: SettingsValues;
  onChange: (values: SettingsValues) => void;
}) {
  function patch(partial: Partial<SettingsValues>) {
    onChange({ ...values, ...partial });
  }
  return (
    <form className="grid max-w-md gap-3">
      <Select
        label="Home currency"
        value={values.homeCurrency}
        onValueChange={(homeCurrency) => patch({ homeCurrency })}
        options={[
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
          { value: 'GBP', label: 'GBP' },
        ]}
      />
      <Input
        aria-label="Lead days"
        value={values.leadDays}
        onChange={(event) => patch({ leadDays: event.target.value })}
      />
      <Select
        label="Default quote validity"
        value={values.validity}
        onValueChange={(validity) => patch({ validity })}
        options={QUOTE_VALIDITIES.map((validity) => ({ value: validity, label: validity }))}
      />
      <Input
        aria-label="Deadline window opens"
        value={values.windowStart}
        onChange={(event) => patch({ windowStart: event.target.value })}
      />
      <Input
        aria-label="Auto-settle cutoff"
        value={values.cutoff}
        onChange={(event) => patch({ cutoff: event.target.value })}
      />
      <p className="text-xs text-fg-3">Account time zone {values.timeZone}</p>
    </form>
  );
}
