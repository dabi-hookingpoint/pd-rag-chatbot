const svg = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICONS: Record<string, string> = {
  home: svg('<path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" />'),
  chat: svg('<path d="M4 5h16v11H9l-4 4V5Z" /><path d="M8 9h8M8 12.5h5" />'),
  settings: svg(
    '<circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 13a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 6.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 2.6a1.7 1.7 0 0 0 1.04-1.56V1a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 2.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 6.9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.06Z" />'
  ),
  back: svg('<path d="M15 5 8 12l7 7" />'),
  chevron: svg('<path d="M9 5l7 7-7 7" />'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 6.5 8 6 8-6" />'),
  send: svg('<path d="M4 12 20 4l-5.5 16-3-6-6.5-2Z" stroke-linejoin="round" />'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />'),
  thumbsUp: svg('<path d="M7 11v9H4v-9h3Zm0 0 4-8 1 1v6h5a1.5 1.5 0 0 1 1.4 2L17 20H7v-9Z" />'),
  thumbsDown: svg('<path d="M17 13V4h3v9h-3Zm0 0-4 8-1-1v-6H7a1.5 1.5 0 0 1-1.4-2L7 4h10v9Z" />'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.35-4.35" />'),
  clapper: svg(
    '<path d="M3 10.5 19.5 6l1 3.5L4 14Z" /><path d="M3 10.5V19a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-8H3Z" /><path d="m7 10-2-3.5M12 9l-2-3.5M17 8l-2-3.5" />'
  ),
  bulb: svg(
    '<path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.44 1 1.16 1 1.94V17h5v-1.16c0-.78.4-1.5 1-1.94A6 6 0 0 0 12 3Z" />'
  ),
  wrench: svg(
    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z" />'
  ),
  scissors: svg(
    '<circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.5 8 19 19M19 5 8.5 16" />'
  ),
  sparkle: svg(
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" />'
  ),
  info: svg('<circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" />'),
  phone: svg(
    '<path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 9.7 9.7 0 0 0 3 .5 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 9.7 9.7 0 0 0 .5 3 1 1 0 0 1-.25 1Z" />'
  ),
  handshake: svg(
    '<path d="M3 11l4-3.5 4 3 3-3 3 2 3-2.5" /><path d="M8 11l3 3.5a2 2 0 0 0 3-2.6" /><path d="M13.5 13.5l2 2a1.8 1.8 0 0 0 2.5-2.5" /><path d="m3 11 3 5.5 2-1M21 10.5l-3 5.5-2.5-1.5" />'
  ),
  brand: svg('<path d="M12 3v13M8 8l4-5 4 5" /><circle cx="12" cy="18" r="3" />'),
};

export function iconEl(name: string): string {
  return ICONS[name] ?? '';
}

export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (!name || !ICONS[name]) return;
    el.innerHTML = ICONS[name];
  });
}
