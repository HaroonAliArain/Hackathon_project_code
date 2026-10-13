import { humanize } from '../shared/format';

export default function StatePill({ value }: { value?: string }) {
  const normalized = (value || 'unknown').toLowerCase().replaceAll('_', '-');
  return <span className={`state-pill state-${normalized}`}>{humanize(value)}</span>;
}
