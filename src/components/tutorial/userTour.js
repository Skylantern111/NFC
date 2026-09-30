// Owner guided tour. Only owner pages (/dashboard/*) — nothing here may
// point at the admin console. Each step opens `route`, then highlights the
// first element found from `targets` (data-tour="…" attributes on the real
// UI). If none is on screen (say, no items yet), the card shows centred.
export const USER_TOUR = {
  id: 'user',
  storageKey: 'tagback_user_tutorial_completed',
  // Only the first visit to Home starts the tour on its own.
  autoStartPath: '/dashboard',
  steps: [
    {
      route: '/dashboard',
      targets: ['dashboard-header'],
      title: 'Welcome to TagBack',
      body: 'This is your Home page. It shows anything that needs you, your items at a glance, and recent activity.',
    },
    {
      route: '/dashboard/items',
      targets: ['items-list', 'items-empty', 'items-header'],
      title: 'My Items',
      body: 'Every belonging with a TagBack tag is listed here. Use the ⋮ menu on an item to edit it, change its tap page, or preview what finders see.',
    },
    {
      route: '/dashboard/items/claim',
      targets: ['claim-find', 'claim-header'],
      title: 'Claim an NFC tag',
      body: 'Connect a TagBack sticker to your account. Scan it with your phone, or type the TagBack ID printed on it. You need a verified email to claim.',
    },
    {
      route: '/dashboard/items/claim',
      targets: ['claim-details', 'claim-header'],
      title: 'Describe the item',
      body: 'Give it a name and a category so a finder knows what they found. Finders never see your email.',
    },
    {
      route: '/dashboard/items',
      targets: ['lost-mode', 'items-empty', 'items-header'],
      title: 'Lost Mode',
      body: 'Lost something? Tap Report lost on the item. Its tag page then shows it as lost, with your message, so a finder can contact you through TagBack. While it’s on, you can edit the message or tap I have it back.',
    },
    {
      route: '/dashboard',
      targets: ['dashboard-status', 'dashboard-header'],
      title: 'Finder reports',
      body: 'When someone taps your tag and reports it found, it shows up here with a button to reply (and a map, if the finder shared their location). You also get an alert.',
    },
    {
      route: '/dashboard/messages',
      targets: ['messages-list', 'messages-empty', 'messages-header'],
      title: 'Private messages',
      body: 'Chat with the finder here to arrange the return. Your email is never shown to the finder.',
    },
    {
      route: '/dashboard/messages',
      targets: ['messages-filters', 'messages-header'],
      title: 'Mark it recovered',
      body: 'Got it back? Open the chat and tap Mark as recovered. This also turns Lost Mode off. Recovered chats stay under the Recovered filter.',
    },
    {
      route: '/dashboard/settings',
      targets: ['settings-help', 'settings-header'],
      title: 'Settings',
      body: 'Manage your account, name and privacy here. You can start this tour again from Help at any time.',
    },
  ],
};
