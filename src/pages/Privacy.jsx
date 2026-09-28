import AmbientBackground from '../components/AmbientBackground';
import TopNav from '../components/nav/TopNav';
import GlassCard from '../components/GlassCard';
import PageHeader from '../components/PageHeader';

// Plain-language privacy note (SYSTEM_AUDIT_ROUND4.md C1). Keep in step with
// firestore.rules and lib/account.js#deleteMyAccount.
const SECTIONS = [
  {
    title: 'Owners (account holders)',
    items: [
      'Your sign-in email and display name — private, never shown to finders.',
      'Your items: name, category, lost message and reward. Anyone who taps the tag can see these.',
      "Your tag's public page content: display name, bio and links you choose to add.",
      'Which tags are yours — private; only you and TagBack admins can see it.',
    ],
  },
  {
    title: 'Finders (no account)',
    items: [
      'A random ID stored in your browser, so you can come back to your chat. It is not linked to your name, email or phone.',
      "Your report and chat messages, visible to the item's owner and to TagBack admins if a chat is reported.",
      'Your location, only if you choose to share it, rounded to about 10 meters. It is removed when the owner marks the item recovered.',
    ],
  },
  {
    title: 'Everyone',
    items: [
      'A tap counter per tag (time and which page was shown) — no identity.',
      'Error reports from the app (the error message, page address and browser) to help fix problems. These can include your account ID if you are signed in.',
    ],
  },
];

export default function Privacy() {
  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" />
        <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-5 py-8">
          <PageHeader
            title="Privacy"
            description="TagBack is built so the owner and the finder never see each other's name, phone, email or address. This page lists what is stored."
          />
          {/* UI_UX_IMPROVEMENT_PLAN.md C.14: the short answer first. */}
          <GlassCard>
            <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">In short</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-800 dark:text-slate-100">What we store</dt>
                <dd className="text-slate-700 dark:text-slate-300">Your account, your items, and the chats about them.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800 dark:text-slate-100">Who sees it</dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  Finders see only the item page. Owners see only what finders send.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-800 dark:text-slate-100">How to delete it</dt>
                <dd className="text-slate-700 dark:text-slate-300">Release a tag, or delete your account in Settings.</dd>
              </div>
            </dl>
          </GlassCard>
          {SECTIONS.map((s) => (
            <GlassCard key={s.title}>
              <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">{s.title}</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
                {s.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </GlassCard>
          ))}
          <GlassCard>
            <h2 className="mb-2 font-bold text-slate-800 dark:text-slate-100">How long, and deleting it</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>
                Data stays until you remove it. Releasing a tag deletes its reports, chats and alerts. Reported chats
                are kept for TagBack&apos;s moderation review.
              </li>
              <li>
                <strong>Delete my account</strong> (Settings) deletes your account, items, tag pages, and every report,
                chat and alert on your tags. It can&apos;t be undone.
              </li>
              <li>
                Finders can&apos;t delete their own reports yet. Ask the item&apos;s owner to release the tag, or contact
                TagBack.
              </li>
            </ul>
          </GlassCard>
        </main>
      </div>
    </>
  );
}
