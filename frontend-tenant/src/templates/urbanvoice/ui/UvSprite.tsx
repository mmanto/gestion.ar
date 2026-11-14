/* Símbolos de shared/icons.js (demo UrbanVoice). */
const DEFS = `
  <defs>
    <symbol id="o-logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="currentColor"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M9.6 11.2c3.6 1.6 3.6 8 0 9.6M22.4 11.2c-3.6 1.6-3.6 8 0 9.6" fill="none" stroke="#fff" stroke-width="2"/></symbol>
    <symbol id="o-home" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></symbol>
    <symbol id="o-club" viewBox="0 0 24 24"><path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01"/></symbol>
    <symbol id="o-cash" viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></symbol>
    <symbol id="o-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></symbol>
    <symbol id="o-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></symbol>
    <symbol id="o-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></symbol><symbol id="o-up2" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></symbol><symbol id="o-inbox" viewBox="0 0 24 24"><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 3h5L16 13h5"/></symbol>
    <symbol id="o-bell" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></symbol>
    <symbol id="o-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
    <symbol id="o-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="o-cal" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></symbol>
    <symbol id="o-up" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></symbol>
    <symbol id="o-dn" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></symbol>
    <symbol id="o-bars" viewBox="0 0 24 24"><path d="M5 20V12M12 20V5M19 20v-9"/></symbol>
    <symbol id="o-pie" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></symbol>
    <symbol id="o-pulse" viewBox="0 0 24 24"><path d="M3 12h4l3-7 4 14 3-7h4"/></symbol>
    <symbol id="o-list" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></symbol>
    <symbol id="o-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></symbol>
    <symbol id="o-mega" viewBox="0 0 24 24"><path d="M3 10v4h4l7 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6M7 14v5h3"/></symbol>
    <symbol id="o-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01"/></symbol>
    <symbol id="o-handshake" viewBox="0 0 24 24"><path d="M2 11l4-4 4 1 3-2 3 1 6 5"/><path d="M6 7L2 11l7 7c.8.8 2 .8 2.8 0l.7-.7"/><path d="M11 13l2.3 2.3M13 11.2l2.6 2.6M15.4 9.8l2.4 2.4M22 12.5l-7 6.7c-.7.7-1.8.7-2.5 0"/></symbol>
    <symbol id="o-team" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 3.5 6"/></symbol>
    <symbol id="o-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="o-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></symbol>
    <symbol id="o-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
    <symbol id="o-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
    <symbol id="o-left" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></symbol>
    <symbol id="o-right" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
    <symbol id="o-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
    <symbol id="o-wa" viewBox="0 0 24 24"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.6c0 3.5 2.9 6.4 6.4 6.4l1.1-1.5-2-1-1 .9c-1-.4-2.3-1.6-2.7-2.7l.9-1-1-2z" fill="currentColor" stroke="none"/></symbol>
    <symbol id="o-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></symbol>
    <symbol id="o-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/></symbol>
    <symbol id="o-pause" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></symbol>
    <symbol id="o-play" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/></symbol>
    <symbol id="o-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></symbol>
    <symbol id="o-alert" viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/></symbol>
    <symbol id="o-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
    <symbol id="o-out" viewBox="0 0 24 24"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/></symbol>
    <symbol id="o-down" viewBox="0 0 24 24"><path d="M12 4v12M6 11l6 6 6-6M4 20h16"/></symbol>
    <symbol id="o-city" viewBox="0 0 24 24"><path d="M3 21h18M5 21V9l5-3v15M10 21V4l9 4v13"/><path d="M13 10h3M13 14h3M13 18h3M7 12h1M7 16h1"/></symbol>
    <symbol id="o-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></symbol>
  </defs>
`;

export function UvSprite() {
  return <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: DEFS }} />;
}
