'use strict';
// Independently authored, fictional structure based only on attribute names and
// ancestor relationships in the user's two structural samples. No chat text,
// real identifiers, original extension code or account data is included.
const unit = (key, id, body) => `<div data-chatgpt-search-message-ids='["${id}"]' data-chatgpt-search-unit-key="unit-${key}" data-content-search-unit-key="content-${key}">${body}</div>`;
function sampledTurn(n = 1, {user = `虚构问题${n}`, answer = `<h2>虚构标题${n}</h2><p>虚构回答${n}</p><ol><li data-d-component="list-item">第一项</li><li data-d-component="list-item">第二项</li></ol>`, assistantId = `sample-answer-${n}`} = {}) {
  const userPart = unit(`user-${n}`, `sample-user-${n}`, `<div><div data-user-message-bubble><p>${user}</p></div><button>用户操作控件</button></div>`);
  const answerPart = unit(`answer-${n}`, assistantId, `<div><div data-chatgpt-selection-conversation-id="fake-conversation" data-chatgpt-selection-message-id="${assistantId}"><div data-selected-text-overlay-target data-markdown-text-style><div data-chatgpt-copy-reference data-dil-source-message-id="${assistantId}" data-markdown-copy><div data-theme="test"><div data-dil-message-id="${assistantId}" data-d-direction="ltr" data-d-inline-reveal>${answer}</div></div></div></div></div><button>助手操作控件</button></div>`);
  return `<div data-turn-key="sample-turn-${n}"><div data-content-search-turn-key="sample-turn-${n}"><div data-talvt-turn-state><div><section>${userPart}</section><section>${answerPart}</section></div></div></div></div>`;
}
module.exports = {sampledTurn};
