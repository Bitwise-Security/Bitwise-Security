const MAX_BODY_BYTES = 16_384;

type ContactRequest = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  service?: unknown;
  message?: unknown;
  website?: unknown;
};

type Contact = {
  name: string;
  email: string;
  company: string;
  service: string;
  message: string;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function field(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length > maxLength) return null;
  return normalized;
}

function parseContact(input: ContactRequest): Contact | null {
  const name = field(input.name, 120);
  const email = field(input.email, 254);
  const company = field(input.company ?? "", 160);
  const service = field(input.service, 120);
  const message = field(input.message, 5_000);

  if (!name || !email || company === null || !service || !message) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return { name, email, company, service, message };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function emailBody(contact: Contact): { html: string; text: string } {
  const name = escapeHtml(contact.name);
  const email = escapeHtml(contact.email);
  const company = escapeHtml(contact.company || "—");
  const service = escapeHtml(contact.service);
  const message = escapeHtml(contact.message).replace(/\r?\n/g, "<br>");

  return {
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0ea5e9">New Security Inquiry</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;font-weight:bold">Name:</td><td style="padding:8px">${name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">Email:</td><td style="padding:8px">${email}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">Company:</td><td style="padding:8px">${company}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">Service:</td><td style="padding:8px">${service}</td></tr>
      </table>
      <h3 style="color:#0ea5e9">Message:</h3>
      <p style="background:#f5f5f5;padding:16px;border-radius:8px">${message}</p>
    </div>`,
    text: [
      "New Security Inquiry",
      `Name: ${contact.name}`,
      `Email: ${contact.email}`,
      `Company: ${contact.company || "—"}`,
      `Service: ${contact.service}`,
      "",
      contact.message,
    ].join("\n"),
  };
}

export const onRequestPost: PagesFunction<Cloudflare.Env> = async ({
  request,
  env,
}) => {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== requestOrigin) {
    return json({ error: "Invalid request origin" }, 403);
  }

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Request is too large" }, 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Request is too large" }, 413);
  }

  let input: ContactRequest;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return json({ error: "Invalid JSON object" }, 400);
    }
    input = parsed as ContactRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof input.website === "string" && input.website.trim()) {
    return json({ success: true });
  }

  const contact = parseContact(input);
  if (!contact) {
    return json({ error: "Invalid contact form fields" }, 400);
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.CONTACT_EMAIL) {
    console.error(JSON.stringify({
      event: "contact_email_configuration_missing",
      ray: request.headers.get("CF-Ray"),
    }));
    return json({ error: "Contact form is temporarily unavailable" }, 503);
  }

  const body = emailBody(contact);
  let resendResponse: Response;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "User-Agent": "bitwise-security-contact/1.0",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [env.CONTACT_EMAIL],
        reply_to: contact.email,
        subject: `Security Inquiry from ${contact.name.replace(/[\r\n]+/g, " ")}`,
        html: body.html,
        text: body.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error(JSON.stringify({
      event: "contact_email_request_failed",
      ray: request.headers.get("CF-Ray"),
    }));
    return json({ error: "Failed to send email" }, 502);
  }

  if (!resendResponse.ok) {
    console.error(JSON.stringify({
      event: "contact_email_send_failed",
      ray: request.headers.get("CF-Ray"),
      status: resendResponse.status,
    }));
    return json({ error: "Failed to send email" }, 502);
  }

  console.log(JSON.stringify({
    event: "contact_email_sent",
    ray: request.headers.get("CF-Ray"),
  }));
  return json({ success: true });
};
