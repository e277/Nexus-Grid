import type { ReactNode } from "react";

const inputCls =
  "mt-1 block w-full rounded-md border border-ng-border bg-ng-surface px-3 py-2 text-sm text-ng-primary placeholder:text-ng-disabled focus:border-ng-accent focus:outline-none focus:ring-2 focus:ring-ng-accent focus:ring-offset-1";

interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className="block text-sm font-medium text-ng-primary">
      {label}
      {children}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date" | "email";
  required?: boolean;
  placeholder?: string;
}

export function TextField({ label, value, onChange, type = "text", required, placeholder }: TextFieldProps) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </Field>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

interface SubmitButtonProps {
  busy?: boolean;
  children: ReactNode;
}

export function SubmitButton({ busy, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-md bg-ng-accent px-4 py-2 text-sm font-semibold text-ng-accent-fg transition-colors hover:bg-ng-accent-hov focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1 disabled:opacity-50"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}

export function CheckboxField({ label, checked, onChange, hint }: CheckboxFieldProps) {
  return (
    <label className="flex items-start gap-2.5 text-sm font-medium text-ng-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-ng-border text-ng-accent focus:ring-ng-accent"
      />
      <span>
        {label}
        {hint ? <span className="block text-xs font-normal text-ng-secondary">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-3 py-2 text-sm text-ng-warning-tx">
      {message}
    </p>
  );
}
