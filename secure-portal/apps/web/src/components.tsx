import type { FormEvent, PropsWithChildren, ReactNode } from "react";

export function Shell({ children }: PropsWithChildren) {
  return (
    <main className="shell">
      <section className="auth-panel" aria-labelledby="portal-title">
        <header className="brand">
          <div className="brand-mark" aria-hidden="true">B</div>
          <div>
            <p className="eyebrow">BITWISE SECURITY</p>
            <h1 id="portal-title">Secure Portal</h1>
          </div>
        </header>
        {children}
        <footer className="security-note">
          <span aria-hidden="true">●</span> Encrypted connection · Private client access
        </footer>
      </section>
    </main>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={hint ? `${name}-hint` : undefined}
      />
      {hint ? <small id={`${name}-hint`}>{hint}</small> : null}
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="primary-button" type="submit" disabled={busy}>
      {busy ? "Please wait…" : children}
    </button>
  );
}

export function Notice({ type = "error", children }: PropsWithChildren<{ type?: "error" | "success" | "info" }>) {
  return (
    <div className={`notice ${type}`} role={type === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function Pagination({ value, itemLabel, disabled = false, onChange }: {
  value: PaginationState;
  itemLabel: string;
  disabled?: boolean;
  onChange: (page: number) => void;
}) {
  if (value.totalPages <= 1) return null;
  const first = (value.page - 1) * value.pageSize + 1;
  const last = Math.min(value.page * value.pageSize, value.total);
  return (
    <nav className="pagination" aria-label={`${itemLabel} pages`}>
      <span>{first}–{last} of {value.total} {itemLabel}</span>
      <div>
        <button className="secondary-button small" type="button" disabled={disabled || value.page <= 1} onClick={() => onChange(value.page - 1)}>Previous</button>
        <strong aria-live="polite">Page {value.page} of {value.totalPages}</strong>
        <button className="secondary-button small" type="button" disabled={disabled || value.page >= value.totalPages} onClick={() => onChange(value.page + 1)}>Next</button>
      </div>
    </nav>
  );
}

export function formValues(event: FormEvent<HTMLFormElement>): FormData {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
