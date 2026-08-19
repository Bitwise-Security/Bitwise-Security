import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth-context";
import { Field, Notice, Pagination, SubmitButton, formValues } from "../components";
import type { PaginationState } from "../components";
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const load = async (requestedPage = page) => {
    setLoading(true);
    try {
      const response = await api<{ events: AuditEvent[]; pagination: PaginationState }>(`/api/v1/admin/audit-events?page=${requestedPage}`);
      setEvents(response.events);
      setPagination(response.pagination);
      if (response.pagination.page !== requestedPage) setPage(response.pagination.page);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    void api<{ events: AuditEvent[]; pagination: PaginationState }>(`/api/v1/admin/audit-events?page=${page}`)
      .then((response) => {
        if (!active) return;
        setEvents(response.events);
        setPagination(response.pagination);
        if (response.pagination.page !== page) setPage(response.pagination.page);
      })
      .finally(() => {
        if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [page]);
  return (
    <section className="portal-section" id="security">
      <div className="section-heading">
        <div><p className="eyebrow">SECURITY & ACCOUNTABILITY</p><h2>Security record</h2><p>Review sign-ins, file actions and permission changes across the portal.</p></div>
        <span className="section-kicker">Append-only activity</span>
      </div>
      <div className="card audit-card">
        <div className="card-heading">
          <div><p className="eyebrow">RECENT EVENTS</p><h3>Audit activity</h3></div>
          <button className="secondary-button small" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button>
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
        <Pagination value={pagination} itemLabel="records" disabled={loading} onChange={(nextPage) => { setLoading(true); setPage(nextPage); }} />
      </div>
    </section>
  );
}

function AdminPanel() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [clientMessage, setClientMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ClientRecord | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const load = () => api<{ clients: ClientRecord[] }>("/api/v1/admin/clients")
    .then((response) => setClients(response.clients));

  useEffect(() => { void load(); }, []);

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = formValues(event);
    setBusy(true);
    setInviteMessage(null);
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
      setInviteMessage("Invitation sent. The client has 72 hours to finish setup.");
      await load();
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const openClientDeletion = (client: ClientRecord) => {
    setDeleteCandidate(client);
    setDeleteConfirmation("");
    setClientMessage(null);
  };

  const deleteClient = async () => {
    if (!deleteCandidate || deleteConfirmation.trim().toLowerCase() !== deleteCandidate.email.toLowerCase()) return;
    setDeletingClientId(deleteCandidate.id);
    setClientMessage(null);
    try {
      await api(`/api/v1/admin/clients/${deleteCandidate.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const deletedEmail = deleteCandidate.email;
      setDeleteCandidate(null);
      setDeleteConfirmation("");
      setClientMessage({ type: "success", text: `${deletedEmail} can no longer sign in. Existing spaces and administrator-shared files were preserved.` });
      await load();
    } catch (error) {
      setClientMessage({ type: "error", text: error instanceof Error ? error.message : "The client account could not be deleted." });
    } finally {
      setDeletingClientId(null);
    }
  };

  return (
    <section className="portal-section" id="clients">
      <div className="section-heading">
        <div><p className="eyebrow">CONTROLLED ACCESS</p><h2>Clients and invitations</h2><p>Create access only when a client needs an ongoing private workspace.</p></div>
        <span className="section-kicker">Password + MFA</span>
      </div>
      <div className="dashboard-grid">
      <section className="card invite-card">
        <p className="eyebrow">CLIENT ACCESS</p>
        <h2>Invite a client</h2>
        <p className="muted">The client receives a private setup link and must configure MFA.</p>
        {inviteMessage ? <Notice type={inviteMessage.startsWith("Invitation sent") ? "success" : "error"}>{inviteMessage}</Notice> : null}
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
        <p className="muted client-list-intro">Client accounts are optional. A space used only for a password-protected link does not need an invited client.</p>
        {clientMessage ? <Notice type={clientMessage.type}>{clientMessage.text}</Notice> : null}
        {clients.length === 0 ? <p className="empty-state">No client spaces yet.</p> : (
          <div className="client-list">
            {clients.map((client) => (
              <article className="client-row" key={`${client.id}:${client.space_id ?? "none"}`}>
                <div className="avatar" aria-hidden="true">{client.display_name.slice(0, 1).toUpperCase()}</div>
                <div className="client-main">
                  <strong>{client.display_name}</strong>
                  <span>{client.email}</span>
                </div>
                <div className="client-space">{client.space_name ?? "No space"}</div>
                <span className={`status ${client.status.toLowerCase()}`}>{client.status.replace("_", " ")}</span>
                <button className="danger-button small" type="button" disabled={deletingClientId !== null} onClick={() => openClientDeletion(client)}>Delete account</button>
              </article>
            ))}
          </div>
        )}
        {deleteCandidate ? (
          <section className="space-deletion-panel client-deletion-panel" role="alertdialog" aria-labelledby="delete-client-title" aria-describedby="delete-client-warning">
            <p className="eyebrow">REMOVE PORTAL ACCESS</p>
            <h2 id="delete-client-title">Delete {deleteCandidate.display_name}&apos;s account?</h2>
            <p id="delete-client-warning">This permanently removes the login, invitation, MFA credentials and active sessions. The client&apos;s spaces and administrator-shared files remain, so you can continue using password-protected links.</p>
            <p className="retention-note">If this client uploaded files, deletion is blocked until you permanently delete the spaces containing those files.</p>
            <label className="field confirmation-field">
              <span>Type <strong>{deleteCandidate.email}</strong> to confirm</span>
              <input value={deleteConfirmation} type="email" autoComplete="off" onChange={(event) => setDeleteConfirmation(event.target.value)} />
            </label>
            <div className="deletion-actions">
              <button className="secondary-button" type="button" disabled={deletingClientId !== null} onClick={() => { setDeleteCandidate(null); setDeleteConfirmation(""); }}>Cancel</button>
              <button className="danger-button" type="button" disabled={deletingClientId !== null || deleteConfirmation.trim().toLowerCase() !== deleteCandidate.email.toLowerCase()} onClick={() => void deleteClient()}>{deletingClientId ? "Deleting securely…" : "Permanently delete account"}</button>
            </div>
          </section>
        ) : null}
      </section>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const auth = useAuth();
  if (auth.loading) return <main className="loading-screen">Checking your secure session…</main>;
  if (!auth.user) return <Navigate to="/login" replace />;
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="compact-brand"><span aria-hidden="true">B</span><div><strong>Bitwise Secure Portal</strong><small>{auth.user.role === "ADMIN" ? "Administrative workspace" : "Private client workspace"}</small></div></div>
          <div className="header-actions">
            <span className="secure-status"><i aria-hidden="true" /> Secure session</span>
            <div className="user-menu">
              <div><strong>{auth.user.displayName}</strong><span>{auth.user.email}</span></div>
              <button className="secondary-button small" type="button" onClick={() => void auth.logout()}>Sign out</button>
            </div>
          </div>
        </div>
      </header>
      <section className="dashboard-content">
        <div className="portal-hero">
          <div className="welcome"><p className="eyebrow">SECURE SESSION ACTIVE</p><h1>Welcome, {auth.user.displayName}</h1><p>{auth.user.role === "ADMIN" ? "Manage client access and exchange sensitive files from one controlled workspace." : "Exchange sensitive documents and reports with Bitwise Security in your private workspace."}</p></div>
          <div className="assurance-strip" aria-label="Portal security protections">
            <span><i aria-hidden="true">01</i>Encrypted storage</span>
            <span><i aria-hidden="true">02</i>Malware screening</span>
            <span><i aria-hidden="true">03</i>Audited access</span>
          </div>
        </div>
        <nav className="portal-nav" aria-label="Portal sections">
          <a href="#workspace">Workspace</a>
          {auth.user.role === "ADMIN" ? <a href="#clients">Clients</a> : null}
          {auth.user.role === "ADMIN" ? <a href="#security">Security</a> : null}
        </nav>
        <FileTransferPanel role={auth.user.role} />
        {auth.user.role === "ADMIN" ? <AdminPanel /> : null}
        {auth.user.role === "ADMIN" ? <AuditPanel /> : null}
      </section>
    </main>
  );
}
