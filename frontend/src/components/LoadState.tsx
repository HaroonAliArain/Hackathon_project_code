import { AlertCircle, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return <div className="load-state"><LoaderCircle className="spin" size={20} />{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {onRetry && <button className="button button-quiet button-small" onClick={onRetry}>Try again</button>}
    </div>
  );
}
