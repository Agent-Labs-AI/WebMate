/**
 * What WebMate tells a person when something fails, in Vietnamese and English.
 *
 * AgentX Chat and Workmate say the same things (the shared friendly-error
 * catalog): a short title in everyday words, one or two sentences of cause
 * and next step that name who can help, a wait time when the provider gave
 * one, Retry only where retrying can help, and the raw text with its code
 * folded away for an administrator. Codes are the telemetry vocabulary
 * (`telemetry.js`, AgentX-sso docs/dashboard.md "Mã lỗi"), plus two kinds
 * only shown here: `offline` (the device has no network) and `overloaded`
 * (an upstream error that says the model is over capacity).
 *
 * WebMate's house style keeps "model" in Vietnamese.
 */

import { errorCode } from '../agentx/telemetry.js';
import { licenseReinstateSentence } from './agentx-license-copy.js';

/** Codes that share another code's words. */
const SAME_WORDS = {
  license_required: 'license',
  license_expired: 'license',
  license_revoked: 'license',
  license_read_only: 'license',
  client_not_allowed: 'issuance_disabled',
  litellm_refused: 'issuance_disabled',
};

/** Where trying the same thing again can help. */
const RETRYABLE = new Set([
  'offline',
  'network_error',
  'timeout',
  'rate_limited',
  'bad_request',
  'overloaded',
  'upstream_error',
  'stream_interrupted',
  'empty_response',
  'operation_failed',
]);

/** What `navigator.onLine === false` explains better than the error does. */
const OFFLINE_EXPLAINS = new Set(['network_error', 'timeout', 'stream_interrupted', 'operation_failed']);

/** An upstream error that is the model being over capacity. */
const OVERLOADED = /overloaded|over capacity|at capacity|\b529\b|\b503\b/i;

const COPY = {
  vi: {
    offline_title: 'Bạn đang ngoại tuyến',
    offline_hint: 'Kiểm tra Wi-Fi hoặc kết nối mạng, rồi thử lại.',
    network_error_title: 'Không kết nối được tới AgentX',
    network_error_hint: 'Mạng có thể đang chập chờn, hoặc máy chủ AgentX tạm thời không truy cập được. Thử lại sau ít phút; nếu vẫn lỗi, hãy báo quản trị viên.',
    timeout_title: 'Model phản hồi quá lâu',
    timeout_hint: 'Yêu cầu đã chờ quá thời gian cho phép. Thử lại; nếu yêu cầu dài hoặc kèm nhiều tệp, hãy chia nhỏ.',
    rate_limited_title: 'Đang có quá nhiều yêu cầu',
    rate_limited_hint: 'Yêu cầu đang được gửi nhanh hơn mức cho phép. Đợi một lát rồi thử lại.',
    rate_limited_hint_wait: 'Yêu cầu đang được gửi nhanh hơn mức cho phép. Thử lại sau khoảng {wait}.',
    quota_exceeded_title: 'Bạn đã dùng hết hạn mức AI',
    quota_exceeded_hint: 'Hạn mức chi tiêu của tài khoản đã hết cho kỳ này. Liên hệ quản trị viên để được cấp thêm, hoặc chờ sang kỳ mới.',
    auth_failed_title: 'Quyền dùng AI của bạn không còn hợp lệ',
    auth_failed_hint: 'Khoá AI của tài khoản đã hết hạn hoặc bị thu hồi. Đăng xuất rồi đăng nhập lại; nếu vẫn lỗi, liên hệ quản trị viên.',
    model_unavailable_title: 'Model này hiện không dùng được',
    model_unavailable_hint: 'Model có thể đã bị gỡ hoặc đang tạm ngừng. Chọn model khác rồi thử lại.',
    model_not_allowed_title: 'Tài khoản của bạn chưa được dùng model này',
    model_not_allowed_hint: 'Chọn model khác, hoặc nhờ quản trị viên cấp quyền.',
    context_too_long_title: 'Cuộc trò chuyện đã quá dài',
    context_too_long_hint: 'Nội dung vượt quá lượng model đọc được trong một lần. Bắt đầu cuộc trò chuyện mới, rút gọn tin nhắn hoặc bớt tệp đính kèm.',
    content_filtered_title: 'Yêu cầu bị bộ lọc nội dung chặn',
    content_filtered_hint: 'Nhà cung cấp model từ chối xử lý nội dung này. Hãy diễn đạt lại rồi gửi lại.',
    bad_request_title: 'Model không xử lý được yêu cầu này',
    bad_request_hint: 'Có thể do tệp đính kèm hoặc tuỳ chọn mà model không hỗ trợ. Thử lại với nội dung khác, hoặc chọn model khác.',
    overloaded_title: 'Model đang quá tải',
    overloaded_hint: 'Nhiều người đang dùng cùng lúc. Lỗi ở phía nhà cung cấp, không phải do bạn — thử lại sau ít phút.',
    overloaded_hint_wait: 'Nhiều người đang dùng cùng lúc. Lỗi ở phía nhà cung cấp, không phải do bạn — thử lại sau khoảng {wait}.',
    upstream_error_title: 'Dịch vụ AI đang gặp sự cố',
    upstream_error_hint: 'Lỗi ở phía nhà cung cấp model, không phải do bạn. Thử lại sau ít phút; nếu vẫn lỗi, hãy báo quản trị viên.',
    stream_interrupted_title: 'Câu trả lời bị ngắt giữa chừng',
    stream_interrupted_hint: 'Kết nối bị gián đoạn khi model đang trả lời. Thử lại để tạo câu trả lời mới.',
    empty_response_title: 'Model không trả lời',
    empty_response_hint: 'Model kết thúc mà không đưa ra nội dung nào. Thử lại, hoặc chọn model khác.',
    license_title: 'Giấy phép AgentX không cho phép dùng AI lúc này',
    access_blocked_title: 'Tài khoản đang bị tạm dừng dùng AI',
    access_blocked_hint: 'Quản trị viên đã tạm dừng quyền dùng AI của tài khoản này. Liên hệ quản trị viên để mở lại.',
    no_grantable_models_title: 'Tài khoản chưa được cấp model nào',
    no_grantable_models_hint: 'Nhờ quản trị viên gán ít nhất một model cho tài khoản của bạn.',
    issuance_disabled_title: 'Chưa cấp được quyền dùng AI',
    issuance_disabled_hint: 'Hệ thống AgentX chưa cấp khoá AI cho tài khoản này. Liên hệ quản trị viên.',
    loop_stopped_title: 'WebMate dừng vì đang lặp lại một thao tác',
    loop_stopped_hint: 'Hãy nói rõ hơn bước tiếp theo bạn muốn, rồi gửi lại.',
    cost_limit_title: 'Đã chạm giới hạn chi phí của lượt này',
    cost_limit_hint: 'Tăng giới hạn trong Cài đặt, hoặc chia nhỏ yêu cầu.',
    operation_failed_title: 'Đã có lỗi xảy ra',
    operation_failed_hint: 'Thử lại. Nếu lỗi lặp lại, gửi chi tiết bên dưới cho quản trị viên.',
    details: 'Chi tiết',
    codeLine: 'Mã lỗi: {code}',
    second: '{count} giây',
    seconds: '{count} giây',
    minutes: '{count} phút',
  },
  en: {
    offline_title: "You're offline",
    offline_hint: 'Check your Wi-Fi or network connection, then try again.',
    network_error_title: "Couldn't reach AgentX",
    network_error_hint: 'Your connection may be unstable, or the AgentX server is briefly unreachable. Try again in a minute; if it keeps happening, tell your administrator.',
    timeout_title: 'The model took too long to respond',
    timeout_hint: 'The request timed out. Try again; if your request is long or has many files, split it into smaller parts.',
    rate_limited_title: 'Too many requests right now',
    rate_limited_hint: 'Requests are arriving faster than allowed. Wait a moment, then try again.',
    rate_limited_hint_wait: 'Requests are arriving faster than allowed. Try again in about {wait}.',
    quota_exceeded_title: "You've used up your AI allowance",
    quota_exceeded_hint: "Your account's spending limit for this period is used up. Ask your administrator for more, or wait for the next period.",
    auth_failed_title: 'Your AI access is no longer valid',
    auth_failed_hint: "Your account's AI key has expired or been revoked. Sign out and sign back in; if that doesn't help, contact your administrator.",
    model_unavailable_title: "This model isn't available right now",
    model_unavailable_hint: 'It may have been removed or paused. Pick another model and try again.',
    model_not_allowed_title: "Your account can't use this model",
    model_not_allowed_hint: 'Pick another model, or ask your administrator for access.',
    context_too_long_title: 'This conversation is too long',
    context_too_long_hint: "It's more than the model can read at once. Start a new conversation, shorten your message, or attach fewer files.",
    content_filtered_title: 'Blocked by a content filter',
    content_filtered_hint: 'The model provider declined this content. Rephrase it and send again.',
    bad_request_title: "The model couldn't process this request",
    bad_request_hint: 'An attachment or option may not be supported by this model. Try different content, or pick another model.',
    overloaded_title: 'The model is overloaded',
    overloaded_hint: "It's in heavy demand right now. This isn't on your side — try again in a few minutes.",
    overloaded_hint_wait: "It's in heavy demand right now. This isn't on your side — try again in about {wait}.",
    upstream_error_title: 'The AI service ran into a problem',
    upstream_error_hint: "The error is on the model provider's side, not yours. Try again in a few minutes; if it keeps happening, tell your administrator.",
    stream_interrupted_title: 'The reply was cut off',
    stream_interrupted_hint: 'The connection dropped while the model was answering. Try again for a fresh reply.',
    empty_response_title: "The model didn't reply",
    empty_response_hint: 'It finished without producing anything. Try again, or pick another model.',
    license_title: "Your AgentX license doesn't allow AI right now",
    access_blocked_title: 'AI is paused for your account',
    access_blocked_hint: 'An administrator has paused AI for this account. Contact them to turn it back on.',
    no_grantable_models_title: 'No model is assigned to your account',
    no_grantable_models_hint: 'Ask your administrator to assign at least one model to your account.',
    issuance_disabled_title: "AI access couldn't be set up",
    issuance_disabled_hint: "AgentX hasn't issued an AI key for this account. Contact your administrator.",
    loop_stopped_title: 'WebMate stopped because it was repeating itself',
    loop_stopped_hint: 'Say more precisely what the next step should be, then send again.',
    cost_limit_title: 'This run hit its cost limit',
    cost_limit_hint: 'Raise the limit in Settings, or split the request.',
    operation_failed_title: 'Something went wrong',
    operation_failed_hint: 'Try again. If it keeps happening, send the details below to your administrator.',
    details: 'Details',
    codeLine: 'Error code: {code}',
    seconds: '{count} seconds',
    second: '{count} second',
    minutes: '{count} minutes',
  },
};

/** Vietnamese for a Vietnamese UI, English for every other language. */
export function errorLanguage(locale) {
  return String(locale || '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

function say(lang, key, params = {}) {
  let value = COPY[lang][key] ?? COPY.en[key];
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

/**
 * The wait the provider asked for, in whole seconds, or null: a
 * `Retry-After` (openai.js writes the header into the error's text),
 * "try again in 20s", "in 30 seconds". Nothing outside (0 s, 1 h].
 */
export function retryAfterSeconds(text) {
  const message = String(text || '');
  let seconds = null;
  const header = /retry[- ]after[:\s]+(\d+)/i.exec(message);
  const phrase = /try again in (\d+(?:\.\d+)?)\s*(ms|milliseconds?|seconds?|secs?|s|minutes?|mins?|m)\b/i.exec(message);
  const plain = /\bin (\d+) seconds\b/i.exec(message);
  if (header) {
    seconds = Number(header[1]);
  } else if (phrase) {
    const unit = phrase[2].toLowerCase();
    const scale = unit === 'ms' || unit.startsWith('milli') ? 0.001 : unit.startsWith('m') ? 60 : 1;
    seconds = Number(phrase[1]) * scale;
  } else if (plain) {
    seconds = Number(plain[1]);
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) return null;
  return Math.ceil(seconds);
}

function waitWords(lang, seconds) {
  if (seconds >= 120) return say(lang, 'minutes', { count: Math.ceil(seconds / 60) });
  return say(lang, seconds === 1 ? 'second' : 'seconds', { count: seconds });
}

/**
 * What to tell the person about an error: `{ code, retry, title, hint,
 * waitSeconds, details, codeLine, raw }`. `code` is the error's own when it
 * has one (the agent attaches it), else read from `message`; `online` false
 * means the device itself is offline. `raw` is the original text for the
 * folded details, '' when the hint already says it word for word.
 */
export function describeError({ code = '', message = '', online = true } = {}, locale = 'vi') {
  const lang = errorLanguage(locale);
  const raw = String(message || '').trim();
  let kind = typeof code === 'string' && code.trim() ? code.trim() : errorCode({ message: raw });
  if (kind === 'upstream_error' && OVERLOADED.test(raw)) kind = 'overloaded';
  if (online === false && OFFLINE_EXPLAINS.has(kind)) kind = 'offline';
  const words = SAME_WORDS[kind] || kind;
  const known = COPY.en[`${words}_title`] !== undefined;
  const copyKey = known ? words : 'operation_failed';
  const waitSeconds = ['rate_limited', 'overloaded'].includes(kind) ? retryAfterSeconds(raw) : null;
  let hint;
  if (copyKey === 'license') {
    // The license refusal is already the license screen's own sentence.
    hint = raw || licenseReinstateSentence(null, lang);
  } else if (waitSeconds) {
    hint = say(lang, `${copyKey}_hint_wait`, { wait: waitWords(lang, waitSeconds) });
  } else {
    hint = say(lang, `${copyKey}_hint`);
  }
  return {
    code: kind,
    retry: RETRYABLE.has(copyKey),
    title: say(lang, `${copyKey}_title`),
    hint,
    waitSeconds,
    details: say(lang, 'details'),
    codeLine: say(lang, 'codeLine', { code: kind }),
    raw: raw === hint ? '' : raw,
  };
}
