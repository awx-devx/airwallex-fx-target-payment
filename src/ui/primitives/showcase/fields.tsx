'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import type { Showcase } from '@/ui/showcase/types';
import { AmountInput } from '@/ui/primitives/amount-input';
import { Checkbox, Radio, Switch } from '@/ui/primitives/choice';
import { Input } from '@/ui/primitives/input';
import { RateInput } from '@/ui/primitives/rate-input';
import { Slider } from '@/ui/primitives/slider';
import { Textarea } from '@/ui/primitives/textarea';
import { Cell } from '@/ui/primitives/showcase/frame';

function Inputs() {
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Cell label="text md">
        <Input aria-label="Vendor" placeholder="Vendor" defaultValue="Helios GmbH" />
      </Cell>
      <Cell label="sm">
        <Input size="sm" aria-label="Reference" placeholder="Reference" />
      </Cell>
      <Cell label="prefix and suffix">
        <Input aria-label="Amount" prefix="USD" suffix=".00" defaultValue="12,400" />
      </Cell>
      <Cell label="icon">
        <Input
          aria-label="Search"
          placeholder="Search"
          icon={<Search strokeWidth={1.5} className="size-3.5 text-fg-3" />}
        />
      </Cell>
      <Cell label="focus">
        <Input aria-label="Focused" defaultValue="Focused" forced />
      </Cell>
      <Cell label="error">
        <Input aria-label="Account" defaultValue="123" error="Account number is too short" />
      </Cell>
      <Cell label="disabled">
        <Input aria-label="Disabled" defaultValue="Locked" disabled />
      </Cell>
      <Cell label="read-only">
        <Input aria-label="Read only" defaultValue="INV-2041" readOnly />
      </Cell>
      <Cell label="loading">
        <Input aria-label="Loading" placeholder="Looking up…" loading />
      </Cell>
    </div>
  );
}

function Amounts() {
  const [eur, setEur] = useState('1234.5');
  const [kes, setKes] = useState('100.5');
  const [bhd, setBhd] = useState('1.2345');
  const [big, setBig] = useState('5000');
  const [limit, setLimit] = useState('10');
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Cell label="EUR md">
        <AmountInput currency="EUR" value={eur} onValueChange={setEur} balance="8000" />
      </Cell>
      <Cell label="EUR lg">
        <AmountInput currency="EUR" size="lg" value={eur} onValueChange={setEur} balance="8000" />
      </Cell>
      <Cell label="KES 0 dp">
        <AmountInput currency="KES" value={kes} onValueChange={setKes} />
      </Cell>
      <Cell label="BHD 3 dp">
        <AmountInput currency="BHD" value={bhd} onValueChange={setBhd} />
      </Cell>
      <Cell label="invalid">
        <AmountInput currency="USD" value="" onValueChange={() => undefined} invalid />
      </Cell>
      <Cell label="over balance">
        <AmountInput currency="USD" value={big} onValueChange={setBig} balance="1000" />
      </Cell>
      <Cell label="outside FX limits" className="sm:col-span-2">
        <AmountInput
          currency="USD"
          value={limit}
          onValueChange={setLimit}
          fxLimit={{ min: '100', max: '1000' }}
        />
      </Cell>
    </div>
  );
}

function Rates() {
  const pair = { base: 'EUR', quote: 'USD' };
  const jpy = { base: 'JPY', quote: 'USD' };
  const [below, setBelow] = useState('1.08');
  const [above, setAbove] = useState('1.1');
  const [at, setAt] = useState('1.09');
  const [large, setLarge] = useState('1.0842');
  const [inverted, setInverted] = useState('0.0067');
  const [flip, setFlip] = useState(true);
  return (
    <div className="grid max-w-4xl gap-4">
      <Cell label="below entry · md" className="max-w-xl">
        <RateInput pair={pair} value={below} onValueChange={setBelow} entry="1.09" />
      </Cell>
      <Cell label="lg" className="max-w-xl">
        <RateInput pair={pair} size="lg" value={large} onValueChange={setLarge} entry="1.09" />
      </Cell>
      <Cell label="above entry" className="max-w-xl">
        <RateInput pair={pair} value={above} onValueChange={setAbove} entry="1.09" />
      </Cell>
      <Cell label="at entry" className="max-w-xl">
        <RateInput pair={pair} value={at} onValueChange={setAt} entry="1.09" />
      </Cell>
      <Cell label="inverted JPY/USD" className="max-w-xl">
        <RateInput
          pair={jpy}
          value={inverted}
          onValueChange={setInverted}
          inverted={flip}
          onInvertedChange={setFlip}
          entry="0.0067"
        />
      </Cell>
    </div>
  );
}

function Choices() {
  const [checked, setChecked] = useState<boolean | 'indeterminate'>(true);
  const [radio, setRadio] = useState('local');
  const [on, setOn] = useState(true);
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <div className="space-y-2">
        <Checkbox size="sm" label="Small" checked={false} onCheckedChange={() => undefined} />
        <Checkbox label="Checked" checked={checked} onCheckedChange={setChecked} />
        <Checkbox label="Mixed" checked="indeterminate" onCheckedChange={() => undefined} />
        <Checkbox label="Disabled" checked disabled onCheckedChange={() => undefined} />
      </div>
      <div className="space-y-3">
        <Radio
          size="sm"
          label="Size sm"
          value="a"
          onValueChange={() => undefined}
          options={[
            { value: 'a', label: 'Selected' },
            { value: 'b', label: 'Open' },
          ]}
        />
        <Radio
          label="Method"
          value={radio}
          onValueChange={setRadio}
          options={[
            { value: 'local', label: 'LOCAL' },
            { value: 'swift', label: 'SWIFT' },
            { value: 'off', label: 'Disabled', disabled: true },
          ]}
        />
      </div>
      <div className="space-y-2">
        <Switch size="sm" label="Small" checked={false} onCheckedChange={() => undefined} />
        <Switch label="Armed" checked={on} onCheckedChange={setOn} />
        <Switch label="Disabled" checked disabled onCheckedChange={() => undefined} />
      </div>
    </div>
  );
}

function Sliders() {
  const [buffer, setBuffer] = useState(12);
  const [validity, setValidity] = useState(30);
  return (
    <div className="grid max-w-xl gap-6">
      <Cell label="ticks">
        <Slider
          label="Buffer"
          value={buffer}
          onValueChange={setBuffer}
          max={40}
          ticks={[0, 10, 20, 30, 40]}
        />
      </Cell>
      <Cell label="glow thumb">
        <Slider label="Validity" value={validity} onValueChange={setValidity} glow />
      </Cell>
    </div>
  );
}

function Notes() {
  const [note, setNote] = useState('Pay from the USD wallet.');
  return (
    <div className="grid max-w-xl gap-4">
      <Cell label="error">
        <Textarea aria-label="Broken note" defaultValue="Too short" error="Add a little more detail" />
      </Cell>
      <Cell label="counter">
        <Textarea
          aria-label="Note"
          maxLength={80}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Cell>
    </div>
  );
}

export const fieldShowcases: Showcase[] = [
  {
    id: 'input',
    group: 'primitives',
    title: 'Input',
    importPath: '@/ui/primitives/input',
    sections: [{ id: 'input-matrix', title: 'Variants and states', render: () => <Inputs /> }],
  },
  {
    id: 'amount',
    group: 'primitives',
    title: 'AmountInput',
    importPath: '@/ui/primitives/amount-input',
    description: 'Commits to payout precision. KES and SAR are 0 dp.',
    sections: [{ id: 'amount-matrix', title: 'Precision, Max, warnings', render: () => <Amounts /> }],
  },
  {
    id: 'rate',
    group: 'primitives',
    title: 'RateInput',
    importPath: '@/ui/primitives/rate-input',
    description: 'Stores canonical price. Invert only changes the display.',
    sections: [{ id: 'rate-matrix', title: 'Pips and entry hint', render: () => <Rates /> }],
  },
  {
    id: 'textarea',
    group: 'primitives',
    title: 'Textarea',
    importPath: '@/ui/primitives/textarea',
    sections: [{ id: 'textarea-matrix', title: 'Error and counter', render: () => <Notes /> }],
  },
  {
    id: 'choice',
    group: 'primitives',
    title: 'Checkbox, Radio, Switch',
    importPath: '@/ui/primitives/choice',
    sections: [{ id: 'choice-matrix', title: 'Sizes and states', render: () => <Choices /> }],
  },
  {
    id: 'slider',
    group: 'primitives',
    title: 'Slider',
    importPath: '@/ui/primitives/slider',
    sections: [{ id: 'slider-matrix', title: 'Ticks and glow', render: () => <Sliders /> }],
  },
];
