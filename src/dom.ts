// A small helper for building the page. Text goes in as textContent, never HTML, so scraped text can't inject markup.

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
