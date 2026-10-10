import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Radio, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-border bg-mist text-text',
  primary: 'border-signal/25 bg-primary-light text-[#b9f8fb]',
  success: 'border-success/25 bg-success-light text-success',
  warning: 'border-warning/30 bg-warning-light text-warning',
  error: 'border-error/25 bg-error-light text-error',
};

export function PageHeader({ eyebrow, title, description, actions, className }: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('app-page-header', className)}>
      <div className="min-w-0">
        {eyebrow ? <span className="sr-only">{eyebrow}: </span> : null}
        <h1>{title}</h1>
        {description ? <p className="app-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="app-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('app-panel', className)} {...props}>{children}</section>;
}

export function StatusBadge({ tone = 'neutral', children, className }: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', toneClasses[tone], className)}>{children}</span>;
}

const noticeIcons = {
  neutral: Info,
  primary: Radio,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export function Notice({ tone = 'neutral', title, children, actions, className, live = false }: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  const Icon = noticeIcons[tone];
  return (
    <section className={cn('app-notice border', toneClasses[tone], className)} role={tone === 'error' ? 'alert' : live ? 'status' : undefined} aria-live={live ? 'polite' : undefined}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1"><h2>{title}</h2>{children ? <div className="app-notice__body">{children}</div> : null}</div>
      {actions ? <div className="app-notice__actions">{actions}</div> : null}
    </section>
  );
}

export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const safeValue = Math.min(Math.max(value, 0), max);
  const percentage = max > 0 ? (safeValue / max) * 100 : 0;
  return (
    <div className="app-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={safeValue}>
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="app-empty-state">
      {icon ? <div className="app-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <h2>{title}</h2><p>{description}</p>{action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
