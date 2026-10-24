import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={`ui-button ui-button--${variant} ${className}`.trim()} />;
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`ui-card ${className}`.trim()} />;
}

export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span {...props} className={`ui-badge ui-badge--${tone} ${className}`.trim()} />;
}

export function Banner({
  tone = 'info',
  role = 'status',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: 'info' | 'warning' | 'danger' }) {
  return (
    <div {...props} role={role} className={`ui-banner ui-banner--${tone} ${className}`.trim()} />
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-input ${className}`.trim()} />;
}

export function SelectInput({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`ui-select ${className}`.trim()} />;
}

export function Toggle({
  checked,
  label,
  className = '',
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  label: string;
  children?: ReactNode;
}) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={`ui-toggle ${checked ? 'on' : ''} ${className}`.trim()}
    >
      {children ?? <span />}
    </button>
  );
}

export function SelectableCard({
  selected,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      className={`ui-selectable-card ${selected ? 'selected' : ''} ${className}`.trim()}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </header>
  );
}
