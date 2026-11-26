/**
 * Wrap raw Markdown tables in a scroll container so wide tables never widen the
 * page on small screens. The wrapper itself is sized to the article column.
 */
export function wrapContentTables(html: string): string {
  return html
    .replace(/<table([^>]*)>/g, (_match, attributes: string) => `<div class="table-scroll"><table tabindex="0"${attributes}>`)
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<pre([^>]*)>/g, '<pre tabindex="0"$1>');
}
