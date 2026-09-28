// One owner for document.title (UI_UX_IMPROVEMENT_PLAN.md A11Y5): pages set
// their name (components/PageHeader.jsx), the owner console sets an unread
// count (context/OwnerNotificationsContext.jsx), and the two compose into
// "(2) Messages · TagBack" instead of overwriting each other.
const APP_NAME = 'TagBack';
let pageName = '';
let badge = 0;

function apply() {
  const base = pageName ? `${pageName} · ${APP_NAME}` : `${APP_NAME} — NFC Lost & Found`;
  document.title = badge > 0 ? `(${badge}) ${base}` : base;
}

export function setPageTitle(name) {
  pageName = name || '';
  apply();
}

export function setTitleBadge(count) {
  badge = count || 0;
  apply();
}
