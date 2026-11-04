# Build: `ai-chat`, a basic chat interface on top of `ai-connector`

## Role
You are a senior front-end engineer with the same standards as before: framework-agnostic, dependency-free code, delivered as complete working files with no placeholders.

## Context
I've attached `ai-connector.js`, built in a previous step. It is a drop-in side-menu item that manages connections to Claude (Anthropic), ChatGPT (OpenAI), and Gemini (Google), and exposes a unified API as `window.AIConnector` and as a default export.

Rules for using it:
- Read it before writing anything.
- Use ONLY its public API. Do not call provider APIs directly, read its storage keys, or duplicate its settings UI.
- If the file is not attached, ask me for it before writing any code.
- If you find a bug, or a gap you need filled, tell me and propose a minimal patch. Don't silently work around it.

The connector API you will use:
- `AIConnector.getProviders()`, `isReady(id?)`, `getDefaultProvider()`, `listModels(id, {refresh})`, `setModel(id, model)`, `openSettings(id?)`
- `AIConnector.stream({ provider, model, system, messages, temperature, maxTokens, signal })` returns a handle. The handle is async-iterable over `{type:'start'|'delta'|'done'|'error'}` events and also has `.abort()` and `.result`.
- Aborting resolves with the partial text and `stopReason: 'stopped'`; it does not throw.
- Errors are `AIConnectorError` objects with `code`, `message` (safe to show), and `retryable`.
- Events arrive via `AIConnector.on('provider-change' | 'default-change', fn)` and as `aic:*` events on `window`.

## Goal
A clean, basic chat interface, like a minimal Claude.ai or ChatGPT clone, that:
- works as a standalone page, AND
- drops into the same SPAs as the connector as a single custom element, `<ai-chat>`.

The user picks Claude, ChatGPT, or Gemini (whichever are connected) and can switch provider mid-conversation without losing context.

## Deliverables
1. `ai-chat.js`: the `<ai-chat>` custom element in Shadow DOM. No dependencies. It must work as an ES module and via a script tag.
2. `chat.html`: a fake SPA shell.
   - A left sidebar holds a few nav items plus `<ai-connector-menu>`.
   - The main area is filled by `<ai-chat>`.
   - It loads both scripts.
   - It includes a dev-only "Render test" button that injects a fake assistant message containing markdown edge cases and XSS payloads.
3. A README section covering embedding, attributes, methods, events, and theming.

## Layout
```
┌───────────────┬───────────────────────────────────────────────┐
│ + New chat    │ [Claude ▾] [model ▾]                [⚙] [⋯]  │
│               ├───────────────────────────────────────────────┤
│ Conversations │                                               │
│  · Today      │   messages (centered column, max ~760px)      │
│  · Yesterday  │                                               │
│               ├───────────────────────────────────────────────┤
│               │  [ auto-growing composer ...      ] [Send/■] │
└───────────────┴───────────────────────────────────────────────┘
```
Below 768px, the conversations list becomes a drawer and the header gets a menu button.

## Must have

**Data and storage**
- Conversation shape: `{ id, title, createdAt, updatedAt, system, temperature, maxTokens, messages }`.
- Message shape: `{ id, role, content, createdAt, provider?, model?, status: 'complete'|'streaming'|'stopped'|'error', error?, usage? }`.
- Store in localStorage under the `storage-namespace` attribute (default `aichat:v1`): one index key plus one key per conversation.
- Wrap every storage call in try/catch. If the quota is exceeded, show a notice and offer to delete the oldest conversations.
- Write to storage when a message completes and about once per second while streaming. Never write on every token.
- On reload, any message still marked `streaming` becomes `stopped`.
- Set the title from the first user message, truncated to about 40 characters. Do not make an extra API call for it.

**Sending**
- Build `messages` from the conversation using only `{role, content}`. Exclude error bubbles and empty assistant messages.
- Provider and model are metadata. They are shown in the UI and never sent to the API.
- Context budget: honour `maxContextChars` (default 400000). Drop the oldest turns first. Show a divider reading "Earlier messages aren't being sent" where the cut happens.
- Allow one in-flight request per conversation. Switching conversation or provider while streaming stops the current stream first.

**Streaming and rendering**
- Append deltas and batch renders with `requestAnimationFrame`.
- Show a blinking caret while a message is streaming.
- Auto-scroll only when the user is within about 80px of the bottom. Otherwise show a "↓ New messages" pill.
- Stop is instant, and the partial answer is kept and labelled "Stopped".

**Markdown**
- Use a built-in minimal renderer that escapes ALL HTML first, then adds formatting.
- Support: paragraphs, line breaks, headings, bold, italic, inline code, fenced code blocks (with a language label and a Copy button), lists (one nesting level), blockquotes, simple GFM tables, and links.
- Allow only `http:`, `https:`, and `mailto:` links, with `target="_blank" rel="noopener noreferrer"`.
- Never insert unsanitized model output via `innerHTML`.
- Handle unclosed code fences gracefully while a message is still streaming.
- Expose a `renderMarkdown` override hook, so a host can plug in marked + DOMPurify.
- Render user messages as plain text with line breaks preserved.

**Header**
- The provider select lists all three providers.
  - Unconnected ones appear disabled with "(set up)". Choosing one calls `AIConnector.openSettings(id)`.
  - It updates live when connector events fire, with no reload.
- The model select is filled from `listModels()` and shows a loading state.
- Each conversation remembers the provider and model it last used. New conversations use the connector's default.

**Composer**
- Auto-grows up to about 8 lines.
- Enter sends and Shift+Enter adds a newline. Do not send while an IME composition is in progress (check `isComposing`).
- Esc stops generation.
- The Send button becomes Stop while streaming.
- Keep a draft per conversation.
- When no provider is connected, disable the composer and show a hint.

**Message actions**
- Actions appear on hover and focus, and are always visible on touch devices:
  - Copy (copies the markdown source).
  - Regenerate (last assistant message only), with a submenu: "Regenerate with Claude / ChatGPT / Gemini".
  - Edit (last user message only): edit inline and resend. This removes the messages after it.
  - Delete.
- Each assistant message shows a small badge, for example "Claude · <model-id>". Token usage shows on hover.

**Errors**
- Show an inline error bubble under the failed turn, with the connector's friendly message and an action that fits the error:

| Error code | Action |
|---|---|
| `no_key`, `invalid_key` | "Open settings" |
| `rate_limited`, `overloaded`, `server`, `cors_or_network`, `timeout` | "Retry" |
| `context_too_long` | "Start new chat" |
| `blocked`, or stop reason `safety` | A plain explanation |

- If an error arrives mid-stream, keep the partial text and mark it incomplete.

**Empty states**
- No provider connected: show a centered card with a "Connect a model" button that calls `openSettings()`.
- Connected but the conversation is empty: show a greeting and 3–4 generic example-prompt chips.

**Conversations sidebar**
- Sort by `updatedAt`, grouped into Today, Yesterday, and Older.
- Support New, inline rename, and delete. Delete shows a 5-second undo toast instead of a confirm dialog.
- `show-history="false"` hides the sidebar entirely.

**Per-conversation settings (⚙ popover)**
- A system prompt textarea.
- A temperature slider with a "Default" option; while it is on Default, temperature is not sent.
- Max tokens.

**Accessibility**
- The message list uses `role="log"`.
- Announce each completed assistant message once, through a visually hidden polite live region. Never announce token by token.
- Label every control, and show visible focus rings.
- Return focus to the composer after Send or Stop.
- The full flow must work keyboard-only.
- Respect `prefers-reduced-motion` and meet AA contrast.

**Responsive layout**
- Support widths from 320px up.
- Use `100dvh` for full height and safe-area insets for iOS.
- The composer stays pinned to the bottom.
- The page never scrolls horizontally; code blocks and tables scroll inside themselves.

**Theming**
- Reuse the connector's `--aic-*` variables so the two components match.
- Add `--aic-chat-user-bg`, `--aic-chat-assistant-bg`, and `--aic-chat-max-width`.
- Switch light and dark automatically, or via the `theme` attribute.

## Element API
- Attributes: `provider`, `model`, `system-prompt` (the default for new chats), `storage-namespace`, `show-history`, `placeholder`, `theme`.
- Methods: `send(text)`, `stop()`, `newConversation()`, `openConversation(id)`, `setProvider(id, model?)`, `clearAll()`.
- Events (bubbling, composed `CustomEvent`s): `ai-chat:send`, `ai-chat:response` (detail is the ChatResult), `ai-chat:error`, `ai-chat:conversation-change`.
- Robustness:
  - Guard `customElements.define`.
  - On disconnect, abort any in-flight request and remove all listeners.
  - Two instances with different namespaces must not interfere with each other.

## Nice to have (only if the core stays solid)
- Conversation search.
- Export a conversation as Markdown.
- Shortcut Ctrl/Cmd+Shift+O for a new chat.
- A per-conversation token count total.

## Out of scope
File and image uploads, tool calling, web search, voice, server-side history, authentication, and cost tracking.

## Acceptance criteria
- [ ] In a fresh browser, the empty state appears. "Connect a model" opens the connector panel, and once a key is added, chat enables with no reload.
- [ ] Responses stream smoothly on all three providers.
- [ ] Stop works instantly and keeps the partial answer.
- [ ] A chat started on Claude continues on Gemini and then ChatGPT with full context.
- [ ] "Regenerate with" a different provider replaces the last answer.
- [ ] In the Render test, `<script>`, `<img onerror>`, and `javascript:` links all render as inert text, and markdown edge cases render correctly.
- [ ] Reloading mid-stream keeps the conversation intact, with the last message marked Stopped.
- [ ] The full flow works keyboard-only, and a screen reader announces each completed reply once.
- [ ] There are no console errors, and repeated mount and unmount is safe.

## Output format
1. Start with your assumptions, in 10 bullets or fewer, plus any connector patches you need.
2. Then give each file in full, in its own code block, headed by its filename.
3. End with a short manual test checklist.
