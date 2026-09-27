import { ArrowRight, ExternalLink, Facebook, Globe, Instagram, Linkedin, MessageCircle, UserPlus, Youtube } from 'lucide-react';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  LANDING_MODES,
  LINK_KEYS,
  LINK_LABELS,
  buildVcard,
  hasVisibleLinks,
  isHttpsUrl,
  visibleLinks,
} from '../lib/tagContent';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { cn } from '../lib/utils';

export const LINK_ICONS = {
  website: Globe,
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Globe,
  linkedin: Linkedin,
  youtube: Youtube,
};

const PILL =
  'flex items-center gap-1.5 rounded-full bg-base px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-neu-flat-sm';

// Social + contact link pills. `interactive` renders real links (public
// page); otherwise plain spans (editor preview, so a click doesn't leave
// the unsaved form).
export function LinkPills({ profile, interactive = false }) {
  if (!hasVisibleLinks(profile)) return null;
  const links = visibleLinks(profile);
  const showContact = profile.contactEnabled && isHttpsUrl(profile.contactUrl?.trim());
  const Tag = interactive ? 'a' : 'span';
  const linkProps = (href) =>
    interactive ? { href, target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((k) => {
        const Icon = LINK_ICONS[k] || Globe;
        return (
          <Tag key={k} {...linkProps(profile[k].trim())} className={cn(PILL, interactive && 'hover:shadow-neu-pressed-sm')}>
            <Icon className="h-3.5 w-3.5" /> {LINK_LABELS[k]}
          </Tag>
        );
      })}
      {showContact && (
        <Tag {...linkProps(profile.contactUrl.trim())} className={cn(PILL, interactive && 'hover:shadow-neu-pressed-sm')}>
          <MessageCircle className="h-3.5 w-3.5" /> Contact
        </Tag>
      )}
    </div>
  );
}

function saveVcard(profile) {
  const blob = new Blob([buildVcard(profile)], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(profile.displayName || 'contact').trim().replace(/[^\w-]+/g, '_') || 'contact'}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The "profile" landing mode — a digital card. Rendered on the public page
// and, with preview=true, live inside both editors.
export function ProfileCard({ profile, onReport, preview = false }) {
  const name = profile.displayName?.trim();
  const bio = profile.bio?.trim();
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-2xl font-bold text-white">
        {(name || '?').charAt(0).toUpperCase()}
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{name || 'Your name'}</h2>
        {bio && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{bio}</p>}
      </div>
      <LinkPills profile={profile} interactive={!preview} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => !preview && saveVcard(profile)}
      >
        <UserPlus className="h-3.5 w-3.5" /> Save contact
      </Button>
      {onReport && (
        <button
          type="button"
          onClick={preview ? undefined : onReport}
          className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-pink-600"
        >
          Found this item? Report it <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// Live preview of what a tap shows, from current form state.
export function TapPreview({ profile }) {
  const mode = profile.landingMode || 'lostfound';
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Preview — what a tap shows
      </p>
      <div className="rounded-2xl bg-base p-5 shadow-neu-pressed-sm">
        {mode === 'redirect' ? (
          <p className="flex items-center justify-center gap-1.5 break-all text-center text-sm text-slate-600 dark:text-slate-300">
            <ExternalLink className="h-4 w-4 shrink-0" />
            {isHttpsUrl(profile.redirectUrl?.trim()) ? profile.redirectUrl.trim() : 'Enter a redirect URL'}
          </p>
        ) : mode === 'profile' ? (
          <ProfileCard profile={profile} preview onReport={profile.lostFoundEnabled ? () => {} : undefined} />
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Lost &amp; Found item page</p>
            <LinkPills profile={profile} />
            {profile.lostFoundEnabled === false && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Found-item reporting is off.</p>
            )}
          </div>
        )}
      </div>
      {mode !== 'lostfound' && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          When the item is marked lost, a tap always shows the Lost &amp; Found page instead.
        </p>
      )}
    </div>
  );
}

const BOX = 'rounded-xl bg-base p-3.5 shadow-neu-flat-sm';

// The tag content editor fields. Controlled: the parent owns profile/errors
// state and the save action (owner and admin save differently).
export function TagContentForm({ profile, setProfile, errors, setErrors }) {
  function set(key, value) {
    setProfile((p) => ({ ...p, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }
  const mode = profile.landingMode || 'lostfound';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>When someone taps the sticker</Label>
        <RadioGroup value={mode} onValueChange={(v) => set('landingMode', v)} className="gap-2">
          {LANDING_MODES.map((m) => (
            <label key={m.value} className={cn(BOX, 'flex cursor-pointer items-start gap-2.5')}>
              <RadioGroupItem value={m.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{m.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {mode === 'redirect' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="redirectUrl">Redirect URL</Label>
          <Input
            id="redirectUrl"
            placeholder="https://…"
            value={profile.redirectUrl || ''}
            onChange={(e) => set('redirectUrl', e.target.value)}
          />
          {errors.redirectUrl && <p className="text-xs text-red-500">{errors.redirectUrl}</p>}
        </div>
      )}

      {mode === 'profile' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              maxLength={DISPLAY_NAME_MAX}
              placeholder="e.g. Maria Santos or Acme Coffee"
              value={profile.displayName || ''}
              onChange={(e) => set('displayName', e.target.value)}
            />
            {errors.displayName && <p className="text-xs text-red-500">{errors.displayName}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bio">Short bio (optional)</Label>
            <Textarea
              id="bio"
              rows={2}
              maxLength={BIO_MAX}
              placeholder="One line about you or your business"
              value={profile.bio || ''}
              onChange={(e) => set('bio', e.target.value)}
            />
            {errors.bio && <p className="text-xs text-red-500">{errors.bio}</p>}
          </div>
        </div>
      )}

      {mode !== 'redirect' && (
        <>
          <div className={cn(BOX, 'flex items-center justify-between gap-3')}>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Lost &amp; Found reporting</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'profile'
                  ? 'Show a "Found this item? Report it" link on the card (claimed tags only).'
                  : 'Let finders report the item and message the owner.'}
              </p>
            </div>
            <Switch checked={profile.lostFoundEnabled} onCheckedChange={(v) => set('lostFoundEnabled', v)} />
          </div>

          <div className={BOX}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contact link</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Show a way to reach you beyond anonymous chat.</p>
              </div>
              <Switch checked={profile.contactEnabled} onCheckedChange={(v) => set('contactEnabled', v)} />
            </div>
            {profile.contactEnabled && (
              <div className="mt-3 flex flex-col gap-1.5">
                <Input
                  id="contactUrl"
                  aria-label="Contact link"
                  placeholder="https://wa.me/1555… or another contact link"
                  value={profile.contactUrl || ''}
                  onChange={(e) => set('contactUrl', e.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  A link, not a raw phone/email — e.g. a WhatsApp click-to-chat URL. Account phone/email
                  (Settings) is never shown publicly.
                </p>
                {errors.contactUrl && <p className="text-xs text-red-500">{errors.contactUrl}</p>}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {LINK_KEYS.map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={key}>{LINK_LABELS[key]}</Label>
                <Input
                  id={key}
                  placeholder="https://…"
                  value={profile[key] || ''}
                  onChange={(e) => set(key, e.target.value)}
                />
                {errors[key] && <p className="text-xs text-red-500">{errors[key]}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <TapPreview profile={profile} />
    </div>
  );
}
