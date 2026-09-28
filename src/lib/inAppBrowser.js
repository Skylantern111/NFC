// Browsers built into other apps (Messenger, Facebook, Instagram, TikTok,
// LINE, WeChat). A TagBack link shared in a chat app opens here, not in
// Chrome. They matter for two reasons (UI_UX_IMPROVEMENT_PLAN.md BUG4/BUG5):
// - they keep their own storage, so a finder's token (lib/finderSession.js)
//   from Chrome isn't there, and
// - they are known to stall Firestore's streaming connection, so
//   firebase/config.js switches them to long polling.
const IN_APP_UA = /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|Instagram|Line\/|MicroMessenger|musical_ly|Bytedance|TikTok/i;

export function isInAppBrowser() {
  return typeof navigator !== 'undefined' && IN_APP_UA.test(navigator.userAgent || '');
}
