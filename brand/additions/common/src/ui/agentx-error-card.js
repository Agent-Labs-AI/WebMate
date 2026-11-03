/**
 * The error card: one icon, a title, the next step, and — folded under
 * "Chi tiết" — the error code and the provider's raw words for an
 * administrator. Built from text nodes only: the raw text is the provider's,
 * never markup. Survives the side panel's chat-history restore (it is plain
 * markup; `<details>` needs no script).
 *
 * `describeError` (agentx-error-copy.js) decides what it says.
 */

const ICON_PATHS = ['M12 8v5', 'M12 16.5v.01'];

function icon(doc) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('agentx-error-icon');
  const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '9');
  svg.appendChild(circle);
  for (const d of ICON_PATHS) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function textElement(doc, tag, className, text) {
  const el = doc.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/** The folded "Chi tiết": the error code, then the raw text when it adds anything. */
export function errorDetailsElement(doc, described) {
  const details = doc.createElement('details');
  details.className = 'agentx-error-details';
  details.appendChild(textElement(doc, 'summary', 'agentx-error-details-summary', described.details));
  details.appendChild(textElement(doc, 'p', 'agentx-error-code', described.codeLine));
  if (described.raw) details.appendChild(textElement(doc, 'pre', 'agentx-error-raw', described.raw));
  return details;
}

/**
 * The whole card. `context` is an optional line above the title (a scheduled
 * task's name); `actions` are buttons for the row that also holds "Chi tiết".
 */
export function errorCardElement(doc, described, { context = '', actions = [] } = {}) {
  const card = doc.createElement('div');
  card.className = 'agentx-error';
  card.dataset.agentxErrorCode = described.code;
  if (context) card.appendChild(textElement(doc, 'p', 'agentx-error-context', context));
  const head = doc.createElement('div');
  head.className = 'agentx-error-head';
  head.append(icon(doc), textElement(doc, 'p', 'agentx-error-title', described.title));
  card.appendChild(head);
  card.appendChild(textElement(doc, 'p', 'agentx-error-hint', described.hint));
  const row = doc.createElement('div');
  row.className = 'agentx-error-actions';
  row.append(...actions.filter(Boolean), errorDetailsElement(doc, described));
  card.appendChild(row);
  return card;
}
