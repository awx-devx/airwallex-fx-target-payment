import { splitPips } from '@/ui/format/format';

/** Tabular price with the last two digits emphasised. */
export function PipNumber({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { head, pips } = splitPips(value);
  const classes = className ? `num ${className}` : 'num';
  return (
    <span className={classes}>
      <span className="num-head">{head}</span>
      {pips ? <span className="num-pip">{pips}</span> : null}
    </span>
  );
}
