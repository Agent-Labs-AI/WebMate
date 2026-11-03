/**
 * Operational metrics for completed agent turns; never prompts, page URLs or raw errors.
 *
 * A failed turn carries a stable `error_code` — the words AgentX Chat and
 * Workmate use too, so the SSO dashboard and the developers' alerts group
 * failures by what went wrong (AgentX-sso docs/dashboard.md, "Mã lỗi").
 */

/** Sent when nothing more precise is known. */
export const FALLBACK_CODE = "operation_failed";
/** What SSO accepts as a code: anything else is sent as the fallback. */
const CODE_SHAPE = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/;

/** Ended as asked, or stopped to ask the person for something only they can give: not a failure. */
const ANSWERED = new Set([
  "done",
  "plan_only_output",
  "clarify",
  "clarification_required",
  "captcha_manual_required",
  "read_scope_limited",
  "active_recipient_unverified",
  "authorized_recipient_missing",
  "prior_turn_verification_required",
]);
/** Stopped by the person, or paused to resume later: not reported at all. */
const NOT_REPORTED = new Set(["cancelled", "scheduled_resume"]);
/** A failed turn's own status, where Chat and Workmate have a word for it. */
const STATUS_CODES = {
  empty_output: "empty_response",
  placeholder_output: "empty_response",
  incomplete_output: "empty_response",
  delivery_required: "observation_limit",
};
/** WebMate's trace codes (Agent._traceErrorCodeFor) in the shared words. */
const TRACE_CODES = {
  COST_LIMIT: "cost_limit",
  INVALID_CREDENTIAL: "auth_failed",
  QUOTA: "quota_exceeded",
  RATE_LIMIT: "rate_limited",
  CONTEXT_WINDOW_EXCEEDED: "context_too_long",
  EMPTY_RESPONSE: "empty_response",
};
/** The keys service's refusals keep their names. */
const KEYS_CODES = new Set([
  "access_blocked",
  "client_not_allowed",
  "issuance_disabled",
  "no_grantable_models",
  "litellm_refused",
  "license_required",
  "license_expired",
  "license_revoked",
]);
/** A read-only license, by its state (license.js LICENSE_STATES). */
const LICENSE_CODES = {
  none: "license_required",
  scheduled: "license_required",
  expired: "license_expired",
  revoked: "license_revoked",
};

/**
 * The code of a turn that ended with `status`, or null when it is not a
 * failure. An "error" ending takes the code of the error that ended it.
 */
export function statusCode(status, errorCode = null) {
  if (ANSWERED.has(status) || NOT_REPORTED.has(status)) return null;
  if (status === "error") return errorCode || FALLBACK_CODE;
  if (STATUS_CODES[status]) return STATUS_CODES[status];
  return status !== "error" && CODE_SHAPE.test(String(status))
    ? String(status)
    : FALLBACK_CODE;
}

/**
 * What a provider's words say went wrong, first match wins. A phrase is more
 * precise than a status: a 400 that says `context_length_exceeded` is a
 * context problem, a 401 that says "not allowed to access model" is a model
 * grant. LiteLLM (the AgentX AI Gateway) names its exceptions in the text
 * (`RateLimitError`, `ContextWindowExceededError`, `BudgetExceededError`, …).
 */
const PHRASES = [
  [
    "context_too_long",
    /context[_\s-]*length[_\s-]*exceeded|contextwindowexceeded|context[_\s-]*window[_\s-]*(?:exceeded|is too)|maximum (?:context|prompt) length|exceed(?:s|ed)? (?:the )?(?:model'?s? )?(?:available |maximum )?context|exceed_context_size|greater than the context length|exceeds the maximum number of tokens|prompt is too long|input is too long|too many (?:input )?tokens|reduce the length of the messages|request entity too large/,
  ],
  [
    "quota_exceeded",
    /budget[_\s-]*exceeded|budget has been exceeded|exceeded (?:your |the )?budget|max[_\s-]*budget|insufficient[_\s-]*quota|exceeded your current quota|quota[_\s-]*exceeded|insufficient[_\s-]*(?:funds|credits?|balance)|credit balance is too low|billing[_\s-]*(?:hard[_\s-]*)?limit/,
  ],
  [
    "content_filtered",
    /content[_\s-]*filter|content[_\s-]*policy|contentpolicyviolation|content management policy|responsible ai policy|safety (?:filter|system)/,
  ],
  [
    "rate_limited",
    /ratelimiterror|rate[_\s-]*limit|too many requests|requests per minute|tokens per minute/,
  ],
  [
    "model_not_allowed",
    /not allowed to access (?:this )?model|can only access models|model not allowed/,
  ],
  [
    "auth_failed",
    /authenticationerror|permissiondeniederror|invalid[_\s-]*api[_\s-]*key|incorrect api key|invalid (?:proxy server )?token|unauthorized|api key (?:has )?(?:expired|been revoked)/,
  ],
  [
    "model_unavailable",
    /notfounderror|model[_\s-]*not[_\s-]*found|(?:model|deployment) [^.]{0,80}does not exist|no such model|invalid model name|unknown model/,
  ],
  [
    "stream_interrupted",
    /stream transport error|stream ended before|disconnected mid-stream|before (?:its )?terminal event|missing_response_completed|stream returned malformed json|stream returned no readable body|could not open its response body/,
  ],
  ["timeout", /\btimed? ?out\b|timeout/],
  [
    "network_error",
    /apiconnectionerror|network ?error|failed to fetch|could not reach|econnrefused|enotfound|econnreset|load failed|internet_disconnected/,
  ],
  ["upstream_error", /serviceunavailableerror|internalservererror|\bstream error:/],
];
/** openai.js keeps the HTTP status only in its text: "… error 429: …", "… stream error 503: …". */
const TEXT_STATUS = /(?:\berror|\bstatus(?:\s*code)?|\bhttp)\s*:?\s*([45]\d\d)\b/;

function statusErrorCode(status) {
  if (status === 404) return "model_unavailable";
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 402) return "quota_exceeded";
  if (status === 413) return "context_too_long";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "upstream_error";
  if (status >= 400 && status <= 499) return "bad_request";
  return null;
}

function phraseErrorCode(message) {
  for (const [code, pattern] of PHRASES) if (pattern.test(message)) return code;
  return null;
}

function textStatusErrorCode(message) {
  const status = TEXT_STATUS.exec(message);
  return status ? statusErrorCode(Number(status[1])) : null;
}

/**
 * The code an error's text alone gives — its phrases, else the HTTP status
 * written in it — or null when it says nothing recognisable. The agent's
 * context-overflow check reads it; the side panel's error card reads
 * `errorCode`, which builds on the same words.
 */
export function textErrorCode(text) {
  const message = String(text || "").toLowerCase();
  return phraseErrorCode(message) || textStatusErrorCode(message);
}

/**
 * The stable code of an error a turn ended with: the keys service's or the
 * license's own code; else what the provider's words say; else `traceCode`,
 * the agent's own classification; else the HTTP status (on the error, or
 * written in its text) and name. Never the error's text is sent.
 */
export function errorCode(error, traceCode = null) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "license_read_only")
    return LICENSE_CODES[error?.license?.state] || "license_read_only";
  if (KEYS_CODES.has(code)) return code;
  if (traceCode === "COST_LIMIT") return TRACE_CODES.COST_LIMIT;
  const name = String(error?.name || "");
  if (name === "TimeoutError") return "timeout";
  const message = String(error?.message || "").toLowerCase();
  const phrase = phraseErrorCode(message);
  if (phrase) return phrase;
  if (TRACE_CODES[traceCode]) return TRACE_CODES[traceCode];
  const status =
    statusErrorCode(Number(error?.status)) || textStatusErrorCode(message);
  if (status) return status;
  if (name === "TypeError" && /fetch|network/.test(message))
    return "network_error";
  return FALLBACK_CODE;
}

export function createUsageReporter({
  cloud,
  api,
  fetchImpl = globalThis.fetch,
  now = () => performance.now(),
  uuid = () => crypto.randomUUID(),
  userAgent = globalThis.navigator?.userAgent || "",
}) {
  const runs = new Map();
  let pending = 0;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : "Other";
  function begin(key, mode) {
    if (runs.has(key)) return;
    if (runs.size >= 256) runs.delete(runs.keys().next().value);
    const identity = Promise.resolve()
      .then(() => cloud.telemetrySession())
      .catch(() => null);
    runs.set(key, { started: now(), mode, identity, code: null });
  }
  /** The error a run is ending with, told just before its end (the agent's error endings). */
  function failure(key, error, traceCode = null) {
    const run = runs.get(key);
    if (run) run.code = errorCode(error, traceCode);
  }
  async function end(key, status) {
    const run = runs.get(key);
    if (!run) return false;
    runs.delete(key);
    if (NOT_REPORTED.has(status)) return false;
    return report(run, statusCode(status, run.code));
  }
  /**
   * A turn the person asked for and could not have because their AgentX
   * license is read-only: refused before the run starts, so never begun.
   */
  function refused(error) {
    const run = {
      started: now(),
      mode: "ask",
      identity: Promise.resolve()
        .then(() => cloud.telemetrySession())
        .catch(() => null),
    };
    return report(run, errorCode(error));
  }
  async function report(run, code) {
    if (pending >= 128) return false;
    pending += 1;
    try {
      const manifest = api.runtime.getManifest();
      if (manifest.browser_specific_settings?.gecko) {
        const permissions = await api.permissions?.getAll();
        if (!permissions?.data_collection?.includes("technicalAndInteraction"))
          return false;
      }
      const first = await run.identity;
      if (!first?.user?.subject) return false;
      const current = await cloud.telemetrySession();
      if (!current?.accessToken || current.user?.subject !== first.user.subject)
        return false;
      const issuer = new URL(current.issuer);
      if (
        issuer.protocol !== "https:" &&
        !["127.0.0.1", "localhost"].includes(issuer.hostname)
      )
        return false;
      const platform = await api.runtime.getPlatformInfo();
      const os =
        { win: "Windows", mac: "macOS", linux: "Linux", android: "Android" }[
          platform.os
        ] || "Other";
      const failed = code !== null;
      const event = {
        product: "agentx-webmate",
        event_id: uuid(),
        occurred_at: new Date().toISOString(),
        // Act and dev are the action modes (Agent._isActionMode); ask is a chat turn.
        feature: ["act", "dev"].includes(run.mode) ? "agent.run" : "chat.turn",
        outcome: failed ? "failure" : "success",
        version: manifest.version,
        os,
        browser,
        duration_ms: Math.min(
          3600000,
          Math.max(0, Math.round(now() - run.started)),
        ),
        ...(failed
          ? { error_code: CODE_SHAPE.test(code) ? code : FALLBACK_CODE }
          : {}),
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetchImpl(
            `${issuer.origin}/sso/api/analytics/events`,
            {
              method: "POST",
              credentials: "omit",
              redirect: "error",
              headers: {
                Authorization: `Bearer ${current.accessToken}`,
                "Content-Type": "application/json",
                "X-SSO-Request": "1",
              },
              body: JSON.stringify({ events: [event] }),
              signal: AbortSignal.timeout(3000),
            },
          );
          if (response.status === 202) return true;
          if (response.status < 500 && response.status !== 429) return false;
        } catch {
          /* a retry keeps the same event UUID */
        }
        if (attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, (attempt + 1) * 1000),
          );
      }
    } catch {
      /* operational metrics must never change a run result */
    } finally {
      pending -= 1;
    }
    return false;
  }
  return { begin, end, failure, refused };
}
