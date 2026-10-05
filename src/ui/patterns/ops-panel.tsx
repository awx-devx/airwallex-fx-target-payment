import type { HealthReport } from '@/contracts/health';
import { Badge } from '@/ui/primitives/badge';
import { Table, Td, Th, Tr } from '@/ui/primitives/table';

const CHECKS = [
  ['mongo', 'Mongo'],
  ['redis', 'Redis'],
  ['worker', 'Worker'],
  ['airwallex', 'Airwallex'],
] as const;

export function OpsPanel({ report }: { report: HealthReport }) {
  return (
    <section className="space-y-3" aria-label="Ops">
      <h2 className="text-sm font-medium">Ops</h2>
      <div className="flex flex-wrap gap-2">
        {CHECKS.map(([key, label]) => (
          <Badge
            key={key}
            tone={report.checks[key] === 'ok' ? 'up' : 'down'}
            dot
          >
            {label} {report.checks[key]}
          </Badge>
        ))}
      </div>
      <Table label="Queue depths">
        <thead>
          <Tr>
            <Th>Queue</Th>
            <Th>Waiting</Th>
            <Th>Active</Th>
            <Th>Delayed</Th>
            <Th>Failed</Th>
          </Tr>
        </thead>
        <tbody>
          {report.queues.map((queue) => {
            const alert =
              (queue.name === 'execution' || queue.name === 'webhook') &&
              queue.failed > 0;
            return (
              <Tr key={queue.name}>
                <Td>{queue.name}</Td>
                <Td>{queue.waiting}</Td>
                <Td>{queue.active}</Td>
                <Td>{queue.delayed}</Td>
                <Td>
                  <span className={alert ? 'text-down' : undefined}>
                    {queue.failed}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <Table label="Feed freshness">
        <thead>
          <Tr>
            <Th>Pair</Th>
            <Th>Age</Th>
            <Th>Fresh</Th>
          </Tr>
        </thead>
        <tbody>
          {report.feeds.length === 0 ? (
            <Tr>
              <Td>No watching bills</Td>
              <Td>—</Td>
              <Td>—</Td>
            </Tr>
          ) : (
            report.feeds.map((feed) => (
              <Tr key={feed.pair}>
                <Td>{feed.pair}</Td>
                <Td>{feed.ageMs === null ? 'No tick' : `${feed.ageMs} ms`}</Td>
                <Td>{feed.fresh ? 'Yes' : 'No'}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </section>
  );
}
