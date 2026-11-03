// AgentX friendly errors — what a person reads when something fails.
//
// The copy and its classification are pure (brand/additions); the wiring is
// brand patch 100 (agent error updates carry a code, the side panel and
// Settings show the card). The provider error texts below are real: the built
// OpenAI-compatible provider of each target is pointed at a local mock
// gateway that answers the way LiteLLM and its upstreams do.
//
//   npm run brand:build && node test/agentx-friendly-errors.test.mjs
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  describeError,
  errorLanguage,
  retryAfterSeconds,
} from '../brand/additions/common/src/ui/agentx-error-copy.js';
import { errorCardElement, errorDetailsElement } from '../brand/additions/common/src/ui/agentx-error-card.js';
import { errorCode, textErrorCode } from '../brand/additions/common/src/agentx/telemetry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (target, rel) => path.join(ROOT, 'brand-dist', target, rel);
const load = (target, rel) => import(pathToFileURL(DIST(target, rel)).href);
const TARGETS = ['chrome', 'firefox'];

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

// ── the catalog ─────────────────────────────────────────────────────────────

// Every code WebMate can show, with whether Retry is offered (the shared
// catalog's "retry" column).
const CATALOG = {
  offline: true,
  network_error: true,
  timeout: true,
  rate_limited: true,
  quota_exceeded: false,
  auth_failed: false,
  model_unavailable: false,
  model_not_allowed: false,
  context_too_long: false,
  content_filtered: false,
  bad_request: true,
  overloaded: true,
  upstream_error: true,
  stream_interrupted: true,
  empty_response: true,
  license_required: false,
  license_expired: false,
  license_revoked: false,
  license_read_only: false,
  access_blocked: false,
  no_grantable_models: false,
  issuance_disabled: false,
  client_not_allowed: false,
  litellm_refused: false,
  loop_stopped: false,
  cost_limit: false,
  operation_failed: true,
};

await test('every catalog code has its own title and next step, in Vietnamese and in English', () => {
  const fallback = describeError({ code: 'operation_failed' }, 'vi');
  for (const [code, retry] of Object.entries(CATALOG)) {
    const vi = describeError({ code }, 'vi');
    const en = describeError({ code }, 'en');
    for (const [lang, said] of [['vi', vi], ['en', en]]) {
      assert.equal(said.code, code, `${code} ${lang}: keeps its code`);
      assert.ok(said.title.trim(), `${code} ${lang}: title`);
      assert.ok(said.hint.trim(), `${code} ${lang}: hint`);
      assert.equal(said.retry, retry, `${code} ${lang}: retry`);
      assert.doesNotMatch(`${said.title} ${said.hint}`, /\{\w+\}|undefined|null/, `${code} ${lang}: no placeholder left`);
      assert.doesNotMatch(said.title, /\b(?:[45]\d\d|Error|Exception)\b|[{}]/, `${code} ${lang}: no status, exception or JSON in the title`);
    }
    assert.notEqual(vi.title, en.title, `${code}: Vietnamese title is not the English one`);
    assert.notEqual(vi.hint, en.hint, `${code}: Vietnamese hint is not the English one`);
    if (code !== 'operation_failed') assert.notEqual(vi.title, fallback.title, `${code}: has its own words`);
  }
  assert.equal(describeError({ code: 'license_expired' }, 'vi').title, describeError({ code: 'license_revoked' }, 'vi').title);
  assert.equal(describeError({ code: 'client_not_allowed' }, 'en').hint, describeError({ code: 'issuance_disabled' }, 'en').hint);
});

await test('the catalog wording, word for word (WebMate keeps "model" in Vietnamese)', () => {
  const vi = (code, message) => describeError({ code, message }, 'vi');
  const en = (code, message) => describeError({ code, message }, 'en');
  assert.equal(vi('rate_limited').title, 'Đang có quá nhiều yêu cầu');
  assert.equal(vi('rate_limited').hint, 'Yêu cầu đang được gửi nhanh hơn mức cho phép. Đợi một lát rồi thử lại.');
  assert.equal(vi('timeout').title, 'Model phản hồi quá lâu');
  assert.equal(vi('upstream_error').hint, 'Lỗi ở phía nhà cung cấp model, không phải do bạn. Thử lại sau ít phút; nếu vẫn lỗi, hãy báo quản trị viên.');
  assert.equal(en('quota_exceeded').title, "You've used up your AI allowance");
  assert.equal(en('auth_failed').hint, "Your account's AI key has expired or been revoked. Sign out and sign back in; if that doesn't help, contact your administrator.");
  assert.equal(vi('operation_failed').details, 'Chi tiết');
  assert.equal(vi('operation_failed').codeLine, 'Mã lỗi: operation_failed');
  assert.equal(en('operation_failed').details, 'Details');
  assert.equal(en('timeout').codeLine, 'Error code: timeout');
  for (const code of Object.keys(CATALOG)) {
    assert.doesNotMatch(`${vi(code).title} ${vi(code).hint}`, /mô hình/i, `${code}: "model", not "mô hình"`);
  }
});

await test('the language is the panel\'s: Vietnamese for vi, English for everything else', () => {
  assert.equal(errorLanguage('vi'), 'vi');
  assert.equal(errorLanguage('vi-VN'), 'vi');
  for (const locale of ['en', 'fr', 'zh', 'ja', '', undefined]) assert.equal(errorLanguage(locale), 'en');
  assert.equal(describeError({ code: 'timeout' }, 'fr').title, 'The model took too long to respond');
});

await test('a code the catalog has no words for reads as "something went wrong" but keeps its own code', () => {
  for (const code of ['observation_limit', 'max_steps', 'tool_error', 'device_revoked', 'weird']) {
    const said = describeError({ code, message: 'raw words' }, 'vi');
    assert.equal(said.code, code);
    assert.equal(said.title, 'Đã có lỗi xảy ra');
    assert.equal(said.codeLine, `Mã lỗi: ${code}`);
    assert.equal(said.raw, 'raw words');
    assert.equal(said.retry, true);
  }
});

await test('offline explains a failed connection; it never hides an answer the service gave', () => {
  for (const message of ['Failed to fetch', 'agentx-cloud Chat Completions stream transport error (terminated).', 'something odd']) {
    assert.equal(describeError({ message, online: false }, 'vi').code, 'offline', message);
  }
  assert.equal(describeError({ message: 'agentx-cloud error 401: Unauthorized', online: false }, 'vi').code, 'auth_failed');
  assert.equal(describeError({ code: 'license_expired', message: 'x', online: false }, 'vi').code, 'license_expired');
  assert.equal(describeError({ message: 'Failed to fetch', online: true }, 'vi').code, 'network_error');
});

await test('a license refusal keeps its own sentence as the next step, said once', () => {
  const sentence = 'Gói Pilot đã hết hạn ngày 31/12/2026. Liên hệ it@astralx.com.vn để được cấp lại hoặc gia hạn.';
  const said = describeError({ code: 'license_expired', message: sentence }, 'vi');
  assert.equal(said.title, 'Giấy phép AgentX không cho phép dùng AI lúc này');
  assert.equal(said.hint, sentence);
  assert.equal(said.raw, '', 'the details do not repeat the hint');
  assert.equal(said.retry, false);
  assert.equal(describeError({ code: 'license_required' }, 'en').hint, 'Contact your administrator to have it reissued or renewed.');
});

await test('wait times: Retry-After, "try again in …", "in N seconds"; whole seconds, minutes from two', () => {
  const cases = [
    ['agentx-cloud error 429: {"error":{}} (Retry-After: 20)', 20],
    ['retry-after: 7', 7],
    ['Rate limit reached. Please try again in 20s.', 20],
    ['Please try again in 1.2s', 2],
    ['please try again in 850ms', 1],
    ['Try again in 3 minutes.', 180],
    ['No deployments available for selected model, Try again in 60 seconds.', 60],
    ['cooling down, retry in 45 seconds', 45],
    ['Retry-After: 0', null],
    ['try again in 2 hours', null],
    ['Retry-After: 7200', null],
    ['no wait here', null],
  ];
  for (const [text, seconds] of cases) assert.equal(retryAfterSeconds(text), seconds, text);
  assert.equal(
    describeError({ code: 'rate_limited', message: 'Please try again in 20s.' }, 'vi').hint,
    'Yêu cầu đang được gửi nhanh hơn mức cho phép. Thử lại sau khoảng 20 giây.',
  );
  assert.equal(
    describeError({ code: 'rate_limited', message: 'Please try again in 1s.' }, 'en').hint,
    'Requests are arriving faster than allowed. Try again in about 1 second.',
  );
  const later = describeError({ code: 'rate_limited', message: '(Retry-After: 150)' }, 'vi');
  assert.equal(later.waitSeconds, 150);
  assert.equal(later.hint, 'Yêu cầu đang được gửi nhanh hơn mức cho phép. Thử lại sau khoảng 3 phút.');
  assert.equal(
    describeError({ message: 'agentx-cloud error 503: overloaded (Retry-After: 30)' }, 'en').hint,
    "It's in heavy demand right now. This isn't on your side — try again in about 30 seconds.",
  );
  assert.equal(describeError({ code: 'timeout', message: 'try again in 20s' }, 'vi').waitSeconds, null, 'only where waiting is the advice');
});

// ── real provider errors from a mock gateway ────────────────────────────────

const json = (status, body, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const litellm = (message, code, type = null) => ({ error: { message, type, param: null, code: String(code) } });
const SCENARIOS = {
  rate429: json(429, litellm('litellm.RateLimitError: RateLimitError: OpenAIException - Rate limit reached for requests', 429, 'throttling_error'), { 'Retry-After': '20' }),
  rate429text: json(429, litellm('litellm.RateLimitError: No deployments available for selected model, Try again in 60 seconds. Passed model=agentx-glm', 429)),
  context400: json(400, litellm("litellm.ContextWindowExceededError: litellm.BadRequestError: OpenAIException - This model's maximum context length is 128000 tokens. However, your messages resulted in 131072 tokens.", 400)),
  budget400: json(400, litellm('Budget has been exceeded! Current cost: 10.02, Max budget: 10.0', 400, 'budget_exceeded')),
  keyBudget400: json(400, litellm('ExceededTokenBudget: Current spend for token: 5.1; Max Budget for Token: 5.0', 400, 'budget_exceeded')),
  auth401: json(401, litellm('Authentication Error, Invalid proxy server token passed. valid_token=None.', 401, 'auth_error')),
  modelGrant401: json(401, litellm("Authentication Error - key not allowed to access model. This key can only access models=['agentx-glm']. Tried to access agentx-gpt", 401, 'key_model_access_denied')),
  notFound404: json(404, litellm('litellm.NotFoundError: OpenAIException - The model `agentx-old` does not exist', 404)),
  content400: json(400, litellm('litellm.ContentPolicyViolationError: AzureException - The response was filtered due to the prompt triggering content management policy.', 400)),
  badRequest400: json(400, litellm('litellm.BadRequestError: OpenAIException - Invalid image format: image/tiff', 400)),
  overloaded503: json(503, litellm('litellm.ServiceUnavailableError: AnthropicException - Overloaded', 503)),
  upstream500: json(500, litellm('litellm.InternalServerError: OpenAIException - Internal error', 500)),
  html502: {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
    body: '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n',
  },
};
const EXPECTED = {
  rate429: 'rate_limited',
  rate429text: 'rate_limited',
  context400: 'context_too_long',
  budget400: 'quota_exceeded',
  keyBudget400: 'quota_exceeded',
  auth401: 'auth_failed',
  modelGrant401: 'model_not_allowed',
  notFound404: 'model_unavailable',
  content400: 'content_filtered',
  badRequest400: 'bad_request',
  overloaded503: 'overloaded',
  upstream500: 'upstream_error',
  html502: 'upstream_error',
};

const server = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const scenario = req.url.split('/')[1];
    if (scenario === 'slow') {
      setTimeout(() => {
        if (!res.destroyed) res.end('{}');
      }, 7000);
      return;
    }
    if (scenario === 'midstream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Đây là phần đầu"}}]}\n\n');
      setTimeout(() => res.socket.destroy(), 30);
      return;
    }
    if (scenario === 'streamerror') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n');
      res.end('data: {"error":{"message":"Internal server error","code":"500"}}\n\n');
      return;
    }
    if (scenario === 'ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
      return;
    }
    const answer = SCENARIOS[scenario.replace(/^stream-/, '')];
    if (!answer) {
      res.writeHead(500);
      res.end('unknown scenario');
      return;
    }
    res.writeHead(answer.status, answer.headers);
    res.end(answer.body);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const PORT = server.address().port;
// A port nobody listens on: bind one, then close it.
const closed = createServer();
await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
const CLOSED_PORT = closed.address().port;
await new Promise((resolve) => closed.close(resolve));

const providers = {};
for (const target of TARGETS) {
  const { OpenAICompatibleProvider } = await load(target, 'src/providers/openai.js');
  providers[target] = (scenario, port = PORT) => new OpenAICompatibleProvider({
    providerName: 'agentx-cloud',
    baseUrl: `http://127.0.0.1:${port}/${scenario}/v1`,
    apiKey: 'sk-test-not-real',
    model: 'agentx-glm',
  });
}
const failureOf = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to fail');
};
const chatError = (target, scenario, port) => failureOf(providers[target](scenario, port).chat([{ role: 'user', content: 'hi' }]));
const streamError = (target, scenario, port) => failureOf((async () => {
  // eslint-disable-next-line no-unused-vars
  for await (const _ of providers[target](scenario, port).chatStream([{ role: 'user', content: 'hi' }])) { /* drain */ }
})());

// The texts the agent really receives, for the agent tests below.
const recorded = {};

await test('a real timeout from each build reads as "the model took too long"', async () => {
  // The provider's first-byte timeout comes from Settings; 5 s is its floor.
  globalThis.chrome = { storage: { local: { get: async () => ({ requestTimeoutMs: 5000 }) } } };
  try {
    const errors = await Promise.all(TARGETS.map((target) => chatError(target, 'slow')));
    for (const [index, error] of errors.entries()) {
      assert.match(error.message, /timed out after 5000ms/, TARGETS[index]);
      assert.equal(errorCode(error), 'timeout');
      assert.equal(describeError({ message: error.message }, 'vi').title, 'Model phản hồi quá lâu');
      recorded.timeout = error.message;
    }
  } finally {
    delete globalThis.chrome;
  }
});

await test('real gateway answers (LiteLLM shapes, an nginx 502) are told apart, chat and stream, in both builds', async () => {
  for (const target of TARGETS) {
    for (const [scenario, expected] of Object.entries(EXPECTED)) {
      for (const [kind, call] of [['chat', chatError], ['stream', streamError]]) {
        const error = await call(target, kind === 'stream' ? `stream-${scenario}` : scenario);
        const label = `${target} ${kind} ${scenario}: ${error.message.slice(0, 160)}`;
        assert.equal(describeError({ message: error.message }, 'vi').code, expected, label);
        // What the agent attaches to its error update (telemetry's classifier).
        const shared = expected === 'overloaded' ? 'upstream_error' : expected;
        assert.equal(errorCode(error), shared, label);
        if (target === 'chrome' && kind === 'chat') recorded[scenario] = error.message;
      }
    }
  }
  assert.match(recorded.rate429, /^agentx-cloud error 429: .*\(Retry-After: 20\)$/s, 'the header reaches the text');
  assert.equal(describeError({ message: recorded.rate429 }, 'vi').waitSeconds, 20);
  assert.equal(describeError({ message: recorded.rate429text }, 'en').waitSeconds, 60);
  assert.equal(describeError({ message: recorded.html502 }, 'vi').raw, recorded.html502.trim(), 'the raw page stays in the details');
});

await test('connection refused, a stream cut mid-answer and an in-stream error event', async () => {
  for (const target of TARGETS) {
    const refused = await chatError(target, 'refused', CLOSED_PORT);
    assert.match(refused.message, /network error — could not reach/);
    assert.equal(describeError({ message: refused.message }, 'vi').code, 'network_error', refused.message);
    assert.equal(describeError({ message: refused.message, online: false }, 'vi').code, 'offline');
    const refusedStream = await streamError(target, 'refused', CLOSED_PORT);
    assert.equal(describeError({ message: refusedStream.message }, 'vi').code, 'network_error', refusedStream.message);

    const cut = await streamError(target, 'midstream');
    assert.equal(describeError({ message: cut.message }, 'vi').code, 'stream_interrupted', cut.message);
    assert.equal(errorCode(cut), 'stream_interrupted');

    const event = await streamError(target, 'streamerror');
    assert.match(event.message, /Chat Completions stream error: Internal server error/);
    assert.equal(describeError({ message: event.message }, 'vi').code, 'upstream_error', event.message);
    if (target === 'chrome') {
      recorded.refused = refused.message;
      recorded.midstream = cut.message;
      recorded.streamerror = event.message;
    }
  }
});

await test('the text classifier: browser, fetch and gateway wordings', () => {
  const cases = [
    ['Failed to fetch', 'network_error'],
    ['NetworkError when attempting to fetch resource.', 'network_error'],
    ['litellm.APIConnectionError: Connection error.', 'network_error'],
    ['litellm.Timeout: Request timed out', 'timeout'],
    ['litellm.BadRequestError: ContextWindowExceededError: prompt is too long: 210000 tokens > 200000 maximum', 'context_too_long'],
    ['The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).', 'context_too_long'],
    ['the request exceeds the available context size, try increasing it', 'context_too_long'],
    ['agentx-cloud error 413: Request Entity Too Large', 'context_too_long'],
    ['You exceeded your current quota, please check your plan and billing details.', 'quota_exceeded'],
    ['agentx-cloud error 402: payment required', 'quota_exceeded'],
    ['Responses stream incomplete (missing_response_completed).', 'stream_interrupted'],
    ['agentx-cloud Chat Completions stream ended before the [DONE] sentinel.', 'stream_interrupted'],
    ['agentx-cloud Chat Completions stream was blocked by the provider content filter.', 'content_filtered'],
    ['agentx-cloud error 422: unprocessable', 'bad_request'],
    ['something nobody has seen before', null],
  ];
  for (const [text, code] of cases) assert.equal(textErrorCode(text), code, text);
});

// ── the agent ───────────────────────────────────────────────────────────────

for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[name] = globalThis[name] || class {};

function quietAgent(Agent, provider, tabId) {
  const agent = new Agent({ getActive: () => provider, getVisionProvider: async () => null });
  agent.planBeforeAct = false;
  agent.maxSteps = 3;
  agent._permissionMode = 'bypass';
  agent._hydrate = async () => {};
  agent._manageContext = async () => {};
  agent._enrichUserMessageWithCurrentPage = async (_tabId, _messages, content) => ({ role: 'user', content });
  agent._maybeReinjectAdapter = async () => {};
  agent._ensureProgressSessionForCurrentTask = async () => ({ mode: 'inactive' });
  agent._persist = () => {};
  agent._persistNow = async () => true;
  agent._startTraceRun = async () => null;
  agent.conversationModes.set(tabId, 'ask');
  agent.conversations.set(tabId, [{ role: 'system', content: 'sys' }]);
  return agent;
}

async function turn(agent, tabId, { streaming = false } = {}) {
  const updates = [];
  const onUpdate = (type, data) => updates.push({ type, data });
  let result;
  let thrown = null;
  try {
    result = streaming
      ? await agent.processMessageStream(tabId, 'Xin chào', onUpdate, 'ask')
      : await agent.processMessage(tabId, 'Xin chào', onUpdate, 'ask');
  } catch (error) {
    thrown = error;
  }
  return { updates, result, thrown, errors: updates.filter((u) => u.type === 'error').map((u) => u.data) };
}

await test('regression: only a real context overflow is trimmed and retried (not a budget, a key or a 503)', async () => {
  for (const target of TARGETS) {
    const { Agent } = await load(target, 'src/agent/agent.js');
    const agent = new Agent({});
    for (const scenario of ['budget400', 'keyBudget400', 'auth401', 'modelGrant401', 'overloaded503', 'rate429', 'html502']) {
      assert.equal(agent._isContextOverflow(recorded[scenario]), false, `${target} ${scenario}: ${recorded[scenario]}`);
      assert.equal(agent._isContextOverflow({ message: recorded[scenario] }), false, `${target} ${scenario} (error)`);
    }
    for (const overflow of [
      recorded.context400,
      'context window exceeded',
      'Error: context_length_exceeded',
      'exceed_context_size_error',
      "This model's maximum context length is 8192 tokens",
      'prompt is too long: 210000 tokens > 200000 maximum',
    ]) {
      assert.equal(agent._isContextOverflow(overflow), true, `${target}: ${overflow}`);
    }
    // The upstream trace classifier keeps its contract on the fixed check.
    assert.equal(agent._traceErrorCodeFor({ message: 'context window exceeded' }), 'CONTEXT_WINDOW_EXCEEDED');
    assert.equal(agent._traceErrorCodeFor({ message: 'connection reset' }), 'TRANSPORT');
    assert.equal(agent._traceErrorCodeFor({ message: recorded.overloaded503 }), 'TRANSPORT', `${target}: a 503 is not a context problem`);
  }
});

await test('a failed turn (real provider, both builds, streaming and not) is one error update carrying its code', async () => {
  const runs = [];
  for (const target of TARGETS) {
    const { Agent } = await load(target, 'src/agent/agent.js');
    for (const [scenario, code] of [['budget400', 'quota_exceeded'], ['rate429', 'rate_limited'], ['overloaded503', 'upstream_error']]) {
      for (const streaming of [false, true]) {
        const tabId = runs.length + 100;
        const provider = providers[target](scenario);
        runs.push(turn(quietAgent(Agent, provider, tabId), tabId, { streaming }).then((outcome) => ({ target, scenario, code, streaming, outcome })));
      }
    }
  }
  for (const { target, scenario, code, streaming, outcome } of await Promise.all(runs)) {
    const label = `${target} ${streaming ? 'stream' : 'chat'} ${scenario}`;
    assert.equal(outcome.thrown, null, `${label}: ${outcome.thrown?.message}`);
    assert.equal(outcome.errors.length, 1, `${label}: ${JSON.stringify(outcome.errors)}`);
    assert.equal(outcome.errors[0].code, code, label);
    assert.match(outcome.errors[0].message, new RegExp(`^agentx-cloud (?:stream )?error \\d{3}:`), label);
    assert.ok(
      !outcome.updates.some((u) => u.type === 'thinking' && /Context too large/.test(u.data?.note || '')),
      `${label}: not trimmed as a context overflow`,
    );
  }
});

await test('a license refusal at run start is the license card; a run that throws says why with its code', async () => {
  for (const target of TARGETS) {
    const { Agent } = await load(target, 'src/agent/agent.js');
    for (const streaming of [false, true]) {
      const tabId = streaming ? 201 : 200;
      const agent = quietAgent(Agent, providers[target]('ok'), tabId);
      const sentence = 'Gói Pilot đã hết hạn ngày 31/12/2026. Liên hệ quản trị viên để được cấp lại hoặc gia hạn.';
      agent.setRunStartGuard(async () => {
        throw Object.assign(new Error(sentence), { code: 'license_read_only', status: 403, license: { state: 'expired' } });
      });
      const refused = await turn(agent, tabId, { streaming });
      assert.equal(refused.thrown?.message, sentence, `${target}: still thrown`);
      assert.deepEqual(refused.errors, [{ message: sentence, code: 'license_expired' }], `${target} streaming=${streaming}`);
      assert.equal(agent.isRunning(tabId), false);

      agent.setRunStartGuard(async () => {
        throw new Error('A run is already active for this tab.');
      });
      const busy = await turn(agent, tabId, { streaming });
      assert.ok(busy.thrown);
      assert.deepEqual(busy.errors, [], `${target}: other refusals stay as they were`);

      agent.setRunStartGuard(null);
      // Thrown inside the run, outside the model call's own handling.
      agent._readWindowLimits = () => {
        throw new Error('agentx-cloud error 401: Unauthorized');
      };
      const broken = await turn(agent, tabId, { streaming });
      assert.equal(broken.thrown?.message, 'agentx-cloud error 401: Unauthorized');
      assert.deepEqual(broken.errors, [{ message: 'agentx-cloud error 401: Unauthorized', code: 'auth_failed' }], `${target} streaming=${streaming}`);
    }
  }
});

await test('a failed context-only answer is the error card alone, not also the raw text as the reply', async () => {
  for (const target of TARGETS) {
    const { Agent } = await load(target, 'src/agent/agent.js');
    const agent = quietAgent(Agent, providers[target]('ok'), 300);
    const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Tóm tắt' }];
    agent._generateContextOnlyResponse = async () => {
      throw new Error(recorded.rate429);
    };
    const updates = [];
    const result = await agent._completeResponseOnlyTurn(300, messages, (type, data) => updates.push({ type, data }), null, null);
    assert.equal(result.status, 'error');
    assert.deepEqual(updates.map((u) => u.type), ['thinking', 'error'], `${target}: ${JSON.stringify(updates)}`);
    assert.deepEqual(updates[1].data, { message: recorded.rate429, code: 'rate_limited' });
    assert.match(messages.at(-1).content, /^I could not generate the requested response:/, 'the model still sees what happened');

    agent._generateContextOnlyResponse = async () => '';
    const emptyUpdates = [];
    await agent._completeResponseOnlyTurn(300, messages, (type, data) => emptyUpdates.push({ type, data }), null, null);
    assert.deepEqual(emptyUpdates.map((u) => u.type), ['thinking', 'error']);
    assert.equal(emptyUpdates[1].data.code, 'empty_response');

    agent._generateContextOnlyResponse = async () => 'Câu trả lời';
    const fine = [];
    await agent._completeResponseOnlyTurn(300, messages, (type, data) => fine.push({ type, data }), null, null);
    assert.deepEqual(fine.map((u) => u.type), ['thinking', 'text']);
  }
});

server.close();

// ── the card ────────────────────────────────────────────────────────────────

// Just enough DOM to build the card — and no innerHTML at all, so the raw
// provider text can only ever arrive as text.
class FakeNode {
  constructor(tag, ns = null) {
    this.tagName = tag;
    this.ns = ns;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this._text = '';
    this.classList = { add: (...names) => { this.className = [this.className, ...names].filter(Boolean).join(' '); } };
  }
  set innerHTML(_) { throw new Error('innerHTML is not used'); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const hit = child.find(predicate);
      if (hit) return hit;
    }
    return null;
  }
}
const fakeDocument = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag, ns),
};

await test('the card: icon, title, next step, actions, and the folded code + raw text as text nodes', () => {
  const raw = '<img src=x onerror="alert(1)"> agentx-cloud error 429: {"error":{}} (Retry-After: 20)';
  const described = describeError({ message: raw }, 'vi');
  const retry = new FakeNode('button');
  const card = errorCardElement(fakeDocument, described, { context: 'Tác vụ theo lịch “Báo cáo”', actions: [retry, null] });
  assert.equal(card.dataset.agentxErrorCode, 'rate_limited');
  const byClass = (name) => card.find((n) => n.className.split(' ').includes(name));
  assert.equal(byClass('agentx-error-context').textContent, 'Tác vụ theo lịch “Báo cáo”');
  assert.equal(byClass('agentx-error-title').textContent, 'Đang có quá nhiều yêu cầu');
  assert.equal(byClass('agentx-error-hint').textContent, 'Yêu cầu đang được gửi nhanh hơn mức cho phép. Thử lại sau khoảng 20 giây.');
  assert.equal(byClass('agentx-error-icon').ns, 'http://www.w3.org/2000/svg');
  const row = byClass('agentx-error-actions');
  assert.equal(row.children[0], retry, 'Retry first, then the details');
  assert.equal(row.children[1].tagName, 'details');
  assert.equal(byClass('agentx-error-details-summary').tagName, 'summary');
  assert.equal(byClass('agentx-error-details-summary').textContent, 'Chi tiết');
  assert.equal(byClass('agentx-error-code').textContent, 'Mã lỗi: rate_limited');
  assert.equal(byClass('agentx-error-raw').textContent, raw);
  assert.equal(card.find((n) => n.tagName === 'img'), null);

  const license = errorDetailsElement(fakeDocument, describeError({ code: 'license_revoked', message: 'Giấy phép đã bị thu hồi.' }, 'vi'));
  assert.equal(license.children.length, 2, 'no raw block when the hint already says it');
});

await test('Settings → AgentX account: a failed connection test is the same words, the raw answer folded', async () => {
  const { renderAgentXCloudPanel } = await import('../brand/additions/common/src/ui/agentx-cloud-ui.js');
  const signedIn = {
    signedIn: true,
    connected: true,
    user: { email: 'k@example.test' },
    provider: { model: 'agentx-glm', models: ['agentx-glm'] },
  };
  const raw = 'agentx-cloud error 429: {"error":{"message":"<b>Rate limit</b>"}} (Retry-After: 20)';
  const markup = renderAgentXCloudPanel({ ...signedIn, error: { code: 'gateway_test_failed', message: raw } }, 'vi');
  assert.match(markup, /<strong>Đang có quá nhiều yêu cầu<\/strong>/);
  assert.match(markup, /Thử lại sau khoảng 20 giây\./);
  assert.match(markup, /<summary class="agentx-error-details-summary">Chi tiết<\/summary>/);
  assert.match(markup, /Mã lỗi: rate_limited/);
  assert.match(markup, /&lt;b&gt;Rate limit&lt;\/b&gt;/, 'the raw answer is escaped');
  assert.doesNotMatch(markup, /<b>Rate limit<\/b>/);
  assert.doesNotMatch(markup, /Không kết nối được Cloud/, 'not the generic "could not connect" line');
  const sentence = 'Gói Pilot đã hết hạn ngày 31/12/2026. Liên hệ quản trị viên để được cấp lại hoặc gia hạn.';
  const refused = renderAgentXCloudPanel({ ...signedIn, error: { code: 'license_read_only', message: sentence } }, 'en');
  assert.match(refused, /<strong>Your AgentX license doesn&#39;t allow AI right now<\/strong>/);
  assert.match(refused, new RegExp(sentence.replaceAll('.', '\\.')));
  const other = renderAgentXCloudPanel({ ...signedIn, error: { code: 'litellm_unavailable', message: 'x' } }, 'vi');
  assert.match(other, /LiteLLM tạm thời chưa sẵn sàng/, 'every other error keeps its own notice');
});

// ── the built extension ─────────────────────────────────────────────────────

await test('brand patch 100 is in both builds: panel, Settings, provider, agent', async () => {
  for (const target of TARGETS) {
    const read = (rel) => fs.readFile(DIST(target, rel), 'utf8');
    const panel = await read('src/ui/sidepanel.js');
    assert.match(panel, /import \{ describeError \} from '\.\/agentx-error-copy\.js';/);
    assert.match(panel, /import \{ errorCardElement \} from '\.\/agentx-error-card\.js';/);
    assert.doesNotMatch(panel, /t\('sp\.error_prefix'/, `${target}: no raw "Lỗi: …" bubble left`);
    assert.doesNotMatch(panel, /t\('sp\.scheduled\.failed', \{ title, msg: job\.lastError/, `${target}: scheduled failures go through the card`);
    assert.match(panel, /function renderAgentErrorUpdate[\s\S]*?addAgentXErrorMessage\(\{ code: data\?\.code, message \}/);
    assert.match(panel, /function addAgentXErrorMessage[\s\S]*?describeError\(\{ \.\.\.error, online: navigator\.onLine \}, getLocale\(\)\)[\s\S]*?retryPayload: described\.retry \? retryPayload : null/);
    assert.match(panel, /!textEl\.textContent\.trim\(\) && !returnedErrorUpdate\)/, `${target}: the raw reply text is not shown under a card`);
    assert.match(panel, /continuationFailed = Array\.isArray\(res\?\.updates\)/);
    assert.match(panel, /function renderPlannerRequestFailure[\s\S]*?code: data\.errorCode[\s\S]*?described\.retry && configureRetryButton/);
    assert.match(panel, /!suppressTimedOutPlanTerminal && data\.status !== 'failed'\)/, `${target}: run_complete keeps a failed run's raw text out of the reply`);
    assert.match(await read('src/ui/sidepanel.html'), /<link rel="stylesheet" href="agentx-error-card\.css">/);
    assert.match(await read('src/ui/settings.html'), /<link rel="stylesheet" href="agentx-error-card\.css">/);
    const settings = await read('src/ui/settings.js');
    assert.match(settings, /setProviderTestFailure\(id, \{ code: res\.code, message: res\.error \}\)/);
    assert.match(settings, /setProviderTestFailure\(id, \{ code: e\.code, message: e\.message \}\)/);
    assert.match(settings, /Object\.assign\(new Error\(response\.error\), code\)/);
    assert.match(await read('src/providers/openai.js'), /function retryAfterNote\(res\)/);
    if (target === 'chrome') {
      // Chrome sends every POST through the offscreen document: it relays Retry-After too.
      assert.match(await read('src/offscreen/offscreen.js'), /retryAfter: res\.headers\.get\('retry-after'\) \|\| ''/);
      assert.match(await read('src/providers/fetch-with-fallback.js'), /msg\.retryAfter \? \{ 'Retry-After': String\(msg\.retryAfter\) \}/);
    }
    for (const file of ['src/ui/agentx-error-copy.js', 'src/ui/agentx-error-card.js', 'src/ui/agentx-error-card.css']) {
      await fs.access(DIST(target, file));
    }
  }
});

console.log(`AgentX friendly errors: ${passed}/${passed} passed`);
