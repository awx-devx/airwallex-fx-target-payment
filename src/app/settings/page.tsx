'use client';

import { useState } from 'react';
import { AuroraBand } from '@/ui/patterns/grain-aurora';
import { SettingsForm, type SettingsValues } from '@/ui/patterns/settings-form';

const INITIAL: SettingsValues = {
  homeCurrency: 'USD',
  leadDays: '1',
  validity: 'MIN_30',
  windowStart: '09:00',
  cutoff: '14:00',
  timeZone: 'America/Los_Angeles',
};

export default function SettingsPage() {
  return <SettingsScreen />;
}

function SettingsScreen() {
  const [values, setValues] = useState(INITIAL);
  return (
    <div className="relative isolate min-h-dvh bg-bg-0 text-fg-1">
      <AuroraBand freeze={false} />
      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        <h1 className="text-lg font-medium">Settings</h1>
        <p className="mt-1 text-fg-2">
          Times in the terminal use your local zone. The deadline window is {values.timeZone}.
        </p>
        <div className="mt-6">
          <SettingsForm values={values} onChange={setValues} />
        </div>
      </main>
    </div>
  );
}
