# Deploying TagBack

Production: https://nfc-lost-and-found.web.app (Firebase project
`nfc-lost-and-found`). There is **no staging project yet**
(`docs/SYSTEM_AUDIT_ROUND4_IMPLEMENTATION_PLAN.md`, Phase 5 postponed), so
every deploy goes straight to production. These rules exist because two
production outages were rules deploys.

## Rules

1. **Deploy only from `main`,** up to date with GitHub and with a clean
   working tree. Other branches may be missing security fixes; deploying
   one puts old holes back on the live site.
2. **CI must be green** for that commit (GitHub → Actions: build + all
   tests).
3. **Deploy rules, indexes and hosting together.** The app and the rules
   change in step.
4. **Right after deploying, run the smoke test** (`docs/FIREBASE_SETUP.md`
   §9). Roll back if anything is off.

## Deploy

```bash
git checkout main ; git pull
git status            # must be clean
npm ci
npm test              # optional locally; CI already ran it
npm run build
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

## Roll back

**Hosting** (the website), to the previous release:

```bash
firebase hosting:releases:list            # find the previous version id
firebase hosting:clone nfc-lost-and-found:<version-id> nfc-lost-and-found:live
```

Or use Firebase Console → Hosting → Release history → ⋮ → Rollback.

**Rules** have no one-click rollback. Check out the last good commit's
`firestore.rules` and redeploy it:

```bash
git checkout <good-commit> -- firestore.rules
firebase deploy --only firestore:rules
git checkout HEAD -- firestore.rules      # back to the branch version
```

Firebase Console → Firestore → Rules also keeps a history you can publish
from.

## Keep an eye on

- **Firestore usage** (Console → Firestore → Usage), weekly during the
  pilot. The free Spark plan stops reads at 50k/day until the daily reset,
  and without billing enabled there are no usage alerts.
- **Admin → Errors**: crashes reported from users' browsers.
