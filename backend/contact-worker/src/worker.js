const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_BODY_BYTES = 24 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_REQUESTS = 5;

const fieldLimits = {
  name: { min: 2, max: 80 },
  email: { min: 5, max: 120 },
  subject: { min: 4, max: 140 },
  message: { min: 20, max: 2500 },
};

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: corsHeaders ? 204 : 403,
        headers: corsHeaders || JSON_HEADERS,
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, message: "Method not allowed." }, 405, corsHeaders);
    }

    if (!corsHeaders) {
      return jsonResponse({ ok: false, message: "Origin is not allowed." }, 403);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse({ ok: false, message: "Unsupported content type." }, 415, corsHeaders);
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, message: "Request is too large." }, 413, corsHeaders);
    }

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const userAgent = request.headers.get("User-Agent") || "unknown";

    try {
      const payload = await readJson(request);
      const normalized = normalizePayload(payload);

      if (normalized.company) {
        return jsonResponse({ ok: true, message: "Thanks. Your inquiry has been received." }, 200, corsHeaders);
      }

      const errors = validatePayload(normalized);
      if (errors.length > 0) {
        return jsonResponse({ ok: false, message: errors[0] }, 400, corsHeaders);
      }

      if (normalized.submittedAt && Date.now() - normalized.submittedAt < 2500) {
        return jsonResponse({ ok: false, message: "Please review your message before sending." }, 400, corsHeaders);
      }

      const rateLimit = await checkRateLimit(env, clientIp);
      if (!rateLimit.allowed) {
        return jsonResponse(
          { ok: false, message: "Too many inquiries were sent recently. Please try again later." },
          429,
          corsHeaders,
          { "Retry-After": String(rateLimit.retryAfter) },
        );
      }

      if (env.TURNSTILE_SECRET_KEY) {
        const turnstileOk = await verifyTurnstile(env, normalized.turnstileToken, clientIp);
        if (!turnstileOk) {
          return jsonResponse({ ok: false, message: "Verification failed. Please try again." }, 400, corsHeaders);
        }
      }

      const spamScore = scoreSpam(normalized);
      if (spamScore >= 6) {
        return jsonResponse({ ok: false, message: "Your message could not be accepted." }, 400, corsHeaders);
      }

      await sendEmail(env, normalized, {
        clientIp,
        userAgent,
        origin: request.headers.get("Origin") || "",
        spamScore,
      });

      if (ctx && env.CONTACT_RATE_LIMIT && typeof env.CONTACT_RATE_LIMIT.put === "function") {
        ctx.waitUntil(markSuccessfulSend(env, clientIp));
      }

      return jsonResponse({ ok: true, message: "Thanks. Your inquiry has been sent." }, 200, corsHeaders);
    } catch (error) {
      return jsonResponse(
        { ok: false, message: "We could not send your inquiry right now. Please try again later." },
        500,
        corsHeaders,
      );
    }
  },
};

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!origin || !allowedOrigins.includes(origin)) {
    return null;
  }

  return {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function readJson(request) {
  const body = await request.text();

  if (body.length > MAX_BODY_BYTES) {
    throw new Error("Body too large");
  }

  return JSON.parse(body);
}

function normalizePayload(payload) {
  return {
    name: normalizeText(payload.name),
    email: normalizeText(payload.email).toLowerCase(),
    subject: normalizeText(payload.subject),
    message: normalizeText(payload.message),
    company: normalizeText(payload.company),
    submittedAt: Number(payload.submittedAt || 0),
    turnstileToken: normalizeText(payload.turnstileToken),
  };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function validatePayload(payload) {
  const errors = [];

  for (const [field, limits] of Object.entries(fieldLimits)) {
    const value = payload[field];
    if (value.length < limits.min) {
      errors.push(`${capitalize(field)} is too short.`);
    }
    if (value.length > limits.max) {
      errors.push(`${capitalize(field)} is too long.`);
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    errors.push("Please enter a valid email address.");
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(payload.message)) {
    errors.push("Message contains unsupported characters.");
  }

  return errors;
}

async function checkRateLimit(env, clientIp) {
  if (!env.CONTACT_RATE_LIMIT || typeof env.CONTACT_RATE_LIMIT.get !== "function") {
    return { allowed: true, retryAfter: 0 };
  }

  const key = `contact:${clientIp}`;
  const current = await env.CONTACT_RATE_LIMIT.get(key, "json");
  const now = Math.floor(Date.now() / 1000);
  const count = current && current.resetAt > now ? current.count : 0;

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.max(60, current.resetAt - now) };
  }

  return { allowed: true, retryAfter: 0 };
}

async function markSuccessfulSend(env, clientIp) {
  const key = `contact:${clientIp}`;
  const now = Math.floor(Date.now() / 1000);
  const current = await env.CONTACT_RATE_LIMIT.get(key, "json");
  const resetAt = current && current.resetAt > now ? current.resetAt : now + RATE_LIMIT_WINDOW_SECONDS;
  const count = current && current.resetAt > now ? current.count + 1 : 1;

  await env.CONTACT_RATE_LIMIT.put(
    key,
    JSON.stringify({ count, resetAt }),
    { expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 120 },
  );
}

async function verifyTurnstile(env, token, clientIp) {
  if (!token) {
    return false;
  }

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  formData.append("remoteip", clientIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return result.success === true;
}

function scoreSpam(payload) {
  let score = 0;
  const combined = `${payload.subject}\n${payload.message}`.toLowerCase();
  const linkCount = (combined.match(/https?:\/\//g) || []).length;

  if (linkCount > 2) score += 2;
  if (linkCount > 5) score += 3;
  if (/(crypto|casino|loan|viagra|betting|forex|adult|seo package)/i.test(combined)) score += 3;
  if (/(.)\1{7,}/.test(combined)) score += 2;
  if (payload.message.split(/\s+/).length < 8) score += 2;
  if (payload.name === payload.subject) score += 1;

  return score;
}

async function sendEmail(env, payload, meta) {
  const required = ["RESEND_API_KEY", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"];
  const missing = required.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  const subjectPrefix = env.SUBJECT_PREFIX || "CloudGenesis inquiry";
  const safeSubject = payload.subject.replace(/[\r\n]+/g, " ").slice(0, fieldLimits.subject.max);
  const emailPayload = {
    from: env.CONTACT_FROM_EMAIL,
    to: [env.CONTACT_TO_EMAIL],
    reply_to: payload.email,
    subject: `${subjectPrefix}: ${safeSubject}`,
    text: buildTextEmail(payload, meta),
    html: buildHtmlEmail(payload, meta),
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok) {
    throw new Error("Email provider rejected the request.");
  }
}

function buildTextEmail(payload, meta) {
  return [
    "New CloudGenesis contact inquiry",
    "",
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Subject: ${payload.subject}`,
    "",
    "Message:",
    payload.message,
    "",
    "Request metadata:",
    `Origin: ${meta.origin}`,
    `IP: ${meta.clientIp}`,
    `User agent: ${meta.userAgent}`,
    `Spam score: ${meta.spamScore}`,
  ].join("\n");
}

function buildHtmlEmail(payload, meta) {
  return `
    <h2>New CloudGenesis contact inquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(payload.subject)}</p>
    <h3>Message</h3>
    <p>${escapeHtml(payload.message).replace(/\n/g, "<br>")}</p>
    <hr>
    <p><strong>Origin:</strong> ${escapeHtml(meta.origin)}</p>
    <p><strong>IP:</strong> ${escapeHtml(meta.clientIp)}</p>
    <p><strong>User agent:</strong> ${escapeHtml(meta.userAgent)}</p>
    <p><strong>Spam score:</strong> ${meta.spamScore}</p>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse(body, status = 200, corsHeaders = null, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...(corsHeaders || {}),
      ...extraHeaders,
    },
  });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
