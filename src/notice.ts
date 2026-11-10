// A short message along the bottom of the screen, such as "Saved." after tapping a star.

import { element } from "./dom.ts";

let notice: HTMLElement | undefined;
let noticeTimer: number | undefined;

/** A short message along the bottom of the screen, with an optional link. Replaces any message already showing. */
export function showNotice(text: string, link?: { label: string; href: string }): void {
  if (notice === undefined) {
    notice = element("div", "fixed inset-x-4 bottom-4 z-30 mx-auto max-w-prose rounded-sm bg-brand px-4 py-3 text-on-brand", "");
    notice.setAttribute("role", "status");
    document.body.append(notice);
  }
  notice.replaceChildren(text);
  if (link) {
    const anchor = element("a", "ml-2 font-semibold underline underline-offset-3", link.label);
    anchor.href = link.href;
    notice.append(anchor);
  }
  notice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    if (notice) {
      notice.hidden = true;
    }
  }, 6000);
}
