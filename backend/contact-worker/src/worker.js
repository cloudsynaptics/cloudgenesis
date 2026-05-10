const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_BODY_BYTES = 24 * 1024;
const MAX_CHAT_MESSAGE_LENGTH = 500;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_REQUESTS = 5;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://cloudgenesis.in",
  "https://www.cloudgenesis.in",
];

const fieldLimits = {
  name: { min: 2, max: 80 },
  email: { min: 5, max: 120 },
  phone: { min: 7, max: 24 },
  subject: { min: 4, max: 140 },
  message: { min: 20, max: 2500 },
};

const CHAT_FALLBACK_ANSWER = "I can help with basic questions about CloudGenesis services, healthcare websites, mobile apps, secure platforms, pricing, and Doc AIde. For specific project requirements, please book a consultation or submit the Contact Us form.";

const CHAT_FAQ_ENTRIES = [
  {
    keywords: ["what is cloudgenesis", "cloudgenesis", "company", "who are you", "about cloudgenesis"],
    answer: "CloudGenesis is a premium software consulting company based in Chennai, India, focused on building modern websites, mobile apps, and secure digital platforms for doctors, clinics, and healthcare-focused businesses.",
  },
  {
    keywords: ["where is cloudgenesis", "location", "located", "chennai", "india", "based"],
    answer: "CloudGenesis is based in Chennai, India, and serves healthcare professionals across India, with future support for global healthcare-focused businesses.",
  },
  {
    keywords: ["what services", "services", "offer", "development", "healthcare digital solutions", "cloud consulting"],
    answer: "CloudGenesis offers healthcare website development, doctor portfolio websites, clinic websites, mobile app development, secure healthcare platforms, cloud consulting, and AI-enabled healthcare digital solutions.",
  },
  {
    keywords: ["doctor website", "clinic website", "websites for doctors", "build websites", "website", "hospital website"],
    answer: "Yes. CloudGenesis builds premium, responsive, and professional websites for doctors, clinics, hospitals, and healthcare-led businesses.",
  },
  {
    keywords: ["mobile app", "android", "ios", "app development", "build mobile", "mobile applications"],
    answer: "Yes. CloudGenesis builds Android and iOS applications for healthcare professionals and healthcare-focused businesses.",
  },
  {
    keywords: ["clinic management", "appointment system", "patient portal", "clinic dashboard", "workflow applications", "healthcare platform"],
    answer: "Yes. CloudGenesis can build secure healthcare platforms such as appointment systems, patient portals, clinic dashboards, and healthcare workflow applications based on the business requirement.",
  },
  {
    keywords: ["secure", "security", "healthcare platforms secure", "privacy", "access control", "reliability"],
    answer: "Yes. CloudGenesis follows a secure-first engineering approach with strong focus on privacy, access control, scalable architecture, and healthcare-grade reliability.",
  },
  {
    keywords: ["healthcare data privacy", "data privacy", "compliance", "compliance-minded", "privacy support"],
    answer: "Yes. CloudGenesis designs healthcare platforms with privacy, security, and compliance-minded architecture from the beginning.",
  },
  {
    keywords: ["doc aide", "doc aide app", "branded app", "app generation", "publishing automation"],
    answer: "Doc AIde is a future CloudGenesis product concept that helps doctors create branded Android and iOS applications through a self-service portal with custom branding, app generation, and publishing automation.",
  },
  {
    keywords: ["how much", "website cost", "pricing", "price", "cost", "package", "packages"],
    answer: "Pricing depends on the scope, number of pages, design complexity, integrations, and platform features. CloudGenesis offers packages for individual doctors, clinics, and secure healthcare platforms.",
  },
  {
    keywords: ["get pricing", "pricing quote", "quote", "estimate"],
    answer: "You can book a consultation or submit the contact form. CloudGenesis will review your requirement and suggest the right package.",
  },
  {
    keywords: ["how can i contact", "contact cloudgenesis", "contact", "email", "reach"],
    answer: "You can use the Contact Us form on the website or email contactus@cloudgenesis.in.",
  },
  {
    keywords: ["book consultation", "consultation", "book a consultation", "appointment", "talk to"],
    answer: "You can click the Book a Consultation button or submit the Contact Us form with your requirement.",
  },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, "") || "/";
    const isChatRequest = route === "/chat";
    const corsHeaders = getCorsHeaders(request, env, { allowNoOrigin: isChatRequest });

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

      if (isChatRequest) {
        return handleChatRequest(payload, corsHeaders);
      }

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

      notifyTelegram(env, normalized, {
        clientIp,
        userAgent,
        origin: request.headers.get("Origin") || "",
        spamScore,
      }, ctx);

      if (ctx && env.CONTACT_RATE_LIMIT && typeof env.CONTACT_RATE_LIMIT.put === "function") {
        ctx.waitUntil(markSuccessfulSend(env, clientIp));
      }

      return jsonResponse({ ok: true, message: "Thanks. Your inquiry has been sent." }, 200, corsHeaders);
    } catch (error) {
      if (isChatRequest) {
        return jsonResponse({ success: false, error: "Please enter a valid question." }, 400, corsHeaders);
      }

      return jsonResponse(
        { ok: false, message: "We could not send your inquiry right now. Please try again later." },
        500,
        corsHeaders,
      );
    }
  },
};

function getCorsHeaders(request, env, options = {}) {
  const origin = request.headers.get("Origin") || "";
  const configuredOrigins = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);

  if (!origin) {
    return options.allowNoOrigin ? JSON_HEADERS : null;
  }

  if (!allowedOrigins.has(origin)) {
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

function handleChatRequest(payload, corsHeaders) {
  const message = normalizeText(payload && payload.message);

  if (!message || message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return jsonResponse({ success: false, error: "Please enter a valid question." }, 400, corsHeaders);
  }

  return jsonResponse({
    success: true,
    answer: findChatAnswer(message),
  }, 200, corsHeaders);
}

function findChatAnswer(message) {
  const normalized = normalizeChatMessage(message);
  let bestMatch = null;

  for (const entry of CHAT_FAQ_ENTRIES) {
    const score = entry.keywords.reduce((total, keyword) => {
      const normalizedKeyword = normalizeChatMessage(keyword);

      if (!normalized.includes(normalizedKeyword)) {
        return total;
      }

      return total + (normalizedKeyword.includes(" ") ? 3 : 1);
    }, 0);

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { score, answer: entry.answer };
    }
  }

  return bestMatch ? bestMatch.answer : CHAT_FALLBACK_ANSWER;
}

function normalizeChatMessage(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePayload(payload) {
  return {
    name: normalizeText(payload.name),
    email: normalizeText(payload.email).toLowerCase(),
    phone: normalizeText(payload.phone),
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

  if (!/^\+?[0-9][0-9\s().-]{5,22}[0-9]$/.test(payload.phone)) {
    errors.push("Please enter a valid phone number.");
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

function notifyTelegram(env, payload, meta, ctx) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return;
  }

  const delivery = sendTelegramMessage(env, payload, meta).catch(() => {
    // Telegram is an optional notification channel; email delivery remains primary.
  });

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(delivery);
    return;
  }

  return delivery;
}

async function sendTelegramMessage(env, payload, meta) {
  const token = String(env.TELEGRAM_BOT_TOKEN).trim();
  const chatId = String(env.TELEGRAM_CHAT_ID).trim();

  if (!token || !chatId) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildTelegramMessage(payload, meta),
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error("Telegram rejected the request.");
  }
}

function buildTelegramMessage(payload, meta) {
  const lines = [
    "New CloudGenesis inquiry",
    "",
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Subject: ${payload.subject}`,
    "",
    "Message:",
    payload.message,
    "",
    "Request metadata:",
    `Origin: ${meta.origin}`,
    `IP: ${meta.clientIp}`,
    `Spam score: ${meta.spamScore}`,
  ];

  return lines.join("\n").slice(0, 3900);
}

function buildTextEmail(payload, meta) {
  return [
    "New CloudGenesis contact inquiry",
    "",
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
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
    <p><strong>Phone:</strong> ${escapeHtml(payload.phone)}</p>
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
