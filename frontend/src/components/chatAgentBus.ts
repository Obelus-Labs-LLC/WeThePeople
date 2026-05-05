/**
 * Tiny event bus for opening the ChatAgent without forcing a sync
 * import of the (~30 KB) component module. GlobalSearch imports
 * `openChatAgent` from here so the click handler is wired without
 * pulling the chat bundle into the initial paint critical path —
 * the actual ChatAgent component is React.lazy-loaded.
 */

const chatEvents = new EventTarget();

export function openChatAgent(): void {
  chatEvents.dispatchEvent(new Event("open"));
}

export function subscribeToChatOpen(handler: () => void): () => void {
  chatEvents.addEventListener("open", handler);
  return () => chatEvents.removeEventListener("open", handler);
}
