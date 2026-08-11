import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth-context";
import { Field, Notice, SubmitButton, formValues } from "../components";
import { FileTransferPanel } from "../FileTransferPanel";

interface ClientRecord {
  id: string;
  email: string;
  display_name: string;
  status: string;
  last_login_at: string | null;
  space_name: string | null;
  space_id: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  target_type: string | null;
  outcome: "SUCCESS" | "FAILURE";
  ip_address: string | null;
  created_at: string;
  actor_email: string | null;
  actor_name: string | null;
}

function AuditPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const response = await api<{ events: AuditEvent[] }>("/api/v1/admin/audit-events?limit=50");
      setEvents(response.events);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    void api<{ events: AuditEvent[] }>("/api/v1/admin/audit-events?limit=50")
      .then((response) => {
        if (active) setEvents(response.events);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);
  return (
    <section className="card audit-card">
      <div className="card-heading">
        <div><p className="eyebrow">SECURITY RECORD</p><h2>Recent audit activity</h2></div>
        <button className="secondary-button small" type="button" onClick={() => void load()}>Refresh</button>
      </div>
      {loading ? <p className="empty-state">Loading audit activity…</p> : (
        <div className="audit-table" role="table" aria-label="Recent audit activity">
          {events.map((event) => (
            <div className="audit-row" role="row" key={event.id}>
              <div role="cell"><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.actor_name ?? event.actor_email ?? "System"}</span></div>
              <div role="cell"><span>{new Date(event.created_at).toLocaleString()}</span><small>{event.ip_address ?? "Internal worker"}</small></div>
              <span className={`audit-outcome ${event.outcome.toLowerCase()}`} role="cell">{event.outcome}</span>
            </div>
          ))}
          {events.length === 0 ? <p className="empty-state">No audit events recorded yet.</p> : null}
        </div>
      )}
    </section>
  );
}

function AdminPanel() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = () => api<{ clients: ClientRecord[] }>("/api/v1/admin/clients")
    .then((response) => setClients(response.clients));

  useEffect(() => { void load(); }, []);

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = formValues(event);
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/v1/admin/clients/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          displayName: data.get("displayName"),
          spaceName: data.get("spaceName"),
        }),
      });
      form.reset();
      setMessage("Invitation sent. The client has 72 hours to finish setup.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-grid">
      <section className="card">
        <p className="eyebrow">CLIENT ACCESS</p>
        <h2>Invite a client</h2>
        <p className="muted">The client receives a private setup link and must configure MFA.</p>
        {message ? <Notice type={message.startsWith("Invitation sent") ? "success" : "error"}>{message}</Notice> : null}
        <form onSubmit={(event) => void invite(event)}>
          <Field label="Client name" name="displayName" autoComplete="off" />
          <Field label="Client email" name="email" type="email" autoComplete="off" />
          <Field label="Client space name" name="spaceName" autoComplete="off" hint="For example: Contoso 2026 Assessment" />
          <SubmitButton busy={busy}>Send secure invitation</SubmitButton>
        </form>
      </section>
      <section className="card wide">
        <div className="card-heading">
          <div><p className="eyebrow">ISOLATED SPACES</p><h2>Clients</h2></div>
          <span className="count">{clients.length}</span>
        </div>
        {clients.length === 0 ? <p className="empty-state">No client spaces yet.</p> : (
          <div className="client-list">
            {clients.map((client) => (
              <article className="client-row" key={client.id}>
                <div className="avatar" aria-hidden="true">{client.display_name.slice(0, 1).toUpperCase()}</div>
                <div className="client-main">
                  <strong>{client.display_name}</strong>
                  <span>{client.email}</span>
                </div>
                <div className="client-space">{client.space_name ?? "No space"}</div>
                <span className={`status ${client.status.toLowerCase()}`}>{client.status.replace("_", " ")}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function DashboardPage() {
  const auth = useAuth();
  if (auth.loading) return <main className="loading-screen">Checking your secure session…</main>;
  if (!auth.user) return <Navigate to="/login" replace />;
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="compact-brand"><span>B</span><div><strong>Bitwise Secure Portal</strong><small>{auth.user.role === "ADMIN" ? "Administrator" : "Client space"}</small></div></div>
        <div className="user-menu">
          <div><strong>{auth.user.displayName}</strong><span>{auth.user.email}</span></div>
          <button className="secondary-button small" type="button" onClick={() => void auth.logout()}>Sign out</button>
        </div>
      </header>
      <section className="dashboard-content">
        <div className="welcome"><p className="eyebrow">SECURE SESSION ACTIVE</p><h1>Welcome, {auth.user.displayName}</h1><p>Only authorised members can access the information in this portal.</p></div>
        {auth.user.role === "ADMIN" ? <AdminPanel /> : null}
        <FileTransferPanel role={auth.user.role} />
        {auth.user.role === "ADMIN" ? <AuditPanel /> : null}
      </section>
    </main>
  );
}
