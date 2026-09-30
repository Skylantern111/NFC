// Admin guided tour. Imported only by AdminLayout, which renders it after
// AdminGate has confirmed admin access — so this text never ships in the
// owner dashboard's code, and the tour can't open anything the admin
// routes wouldn't already allow. See userTour.js for how steps work.
export const ADMIN_TOUR = {
  id: 'admin',
  storageKey: 'tagback_admin_tutorial_completed',
  autoStartPath: '/admin/inventory',
  steps: [
    {
      route: '/admin/inventory',
      targets: ['admin-nav'],
      title: 'Welcome to the Admin Console',
      body: 'This area is for TagBack administrators. Use the menu to manage NFC tags, what a tap shows, reported chats and owners.',
    },
    {
      route: '/admin/inventory',
      targets: ['inventory-table', 'inventory-header'],
      title: 'NFC inventory',
      body: 'Every registered sticker, newest first. Search by TagBack ID or physical UID, copy a tag link, retry a failed write, or blacklist a tag.',
    },
    {
      route: '/admin/inventory',
      targets: ['inventory-status', 'inventory-header'],
      title: 'Tag status',
      body: 'These counts show how many tags are registered, claimed by an owner, or blacklisted.',
    },
    {
      route: '/admin/nfc-register',
      targets: ['nfc-register', 'nfc-register-header'],
      title: 'Register a new tag',
      body: 'Start a scan and hold a blank sticker against an Android phone in Chrome. TagBack reads it and gives it a new TagBack ID.',
    },
    {
      route: '/admin/nfc-register',
      targets: ['nfc-register', 'nfc-register-header'],
      title: 'Write the tag',
      body: 'After registering, tap Write NFC tag to put the TagBack link on the sticker. If a write fails, retry it later from Inventory.',
    },
    {
      route: '/admin/tags',
      targets: ['tag-content-header'],
      title: 'Tag content',
      body: 'Choose what a tap shows: the Lost & Found page, a profile card, or a redirect. Changes apply on the next tap, with no rewrite.',
    },
    {
      route: '/admin/moderation',
      targets: ['moderation-header'],
      title: 'Moderation',
      body: 'Conversations that someone reported land here. Read the chat, mark it reviewed, or ban a finder who is abusing TagBack.',
    },
    {
      route: '/admin/owners',
      targets: ['owners-search', 'owners-header'],
      title: 'Owners',
      body: 'Paste a TagBack ID to see which account holds it and their other tags. You can disable an abusive owner from here.',
    },
    {
      route: '/admin/errors',
      targets: ['errors-header'],
      title: 'Error log',
      body: 'Crashes reported from people’s browsers. You can also reach this from Settings › Maintenance.',
    },
    {
      route: '/admin/settings',
      targets: ['admin-settings-help', 'admin-settings-header'],
      title: 'Admin settings',
      body: 'Your admin account, the admin sign-up passcode, maintenance and developer tools. Start this tour again from Help at any time.',
    },
  ],
};
