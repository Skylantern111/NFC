# Project docs

Plans, audits and change logs, oldest first within each group. The code
and the two root files ([`../README.md`](../README.md),
[`../ARCHITECTURE.md`](../ARCHITECTURE.md)) describe the current system;
these files record how it got there. For the current end-to-end workflows
(register → claim → report → chat → recover → release → moderate) s
[`../ARCHITECTURE.md` §8](../ARCHITECTURE.md#8-system-workflows). Code comments cite these files by
name (e.g. "SYSTEM_AUDIT_ROUND2.md A0").

## Setup
| File | What it is |
|---|---|
| [FIREBASE_SETUP.md](FIREBASE_SETUP.md) | Firebase project setup, deploy, first admin, console settings, backups, smoke test |

## Design
| File | Status |
|---|---|
| [REDESIGN_PLAN.md](REDESIGN_PLAN.md) | Original dark redesign spec — superseded by the light theme below; its feature list is mostly implemented |
| [REDESIGN_CHANGES.md](REDESIGN_CHANGES.md) | Change log of the design pass — done |
| [LIGHT_NEUMORPHIC_REDESIGN_PLAN.md](LIGHT_NEUMORPHIC_REDESIGN_PLAN.md) | Current design system — implemented |
| [UI_UX_IMPROVEMENT_PLAN.md](UI_UX_IMPROVEMENT_PLAN.md) | UI/UX audit, tester bug fixes and improvement plan — implemented in code; phone/browser checks pending |
| [UI_UX_IMPROVEMENT_ROUND2.md](UI_UX_IMPROVEMENT_ROUND2.md) | Round 2: finder page, NFC scan states, chat, Lost Mode, privacy copy — Parts A and B implemented; real NFC hardware, TalkBack and VoiceOver checks pending |

## Features and improvement rounds
| File | Status |
|---|---|
| [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) | Rounds 1–15 — implemented except Round 10 #9 (PWA) |
| [MOCK_DATA_LAYER_PLAN.md](MOCK_DATA_LAYER_PLAN.md) | Frontend-only mock layer — superseded: preview mode uses inline mocks behind `firebaseReady` (see ARCHITECTURE.md §4) |
| [NFC_REARCHITECTURE_PLAN.md](NFC_REARCHITECTURE_PLAN.md) | Hardware-identity NFC registration — implemented (commit `ed8e74d`) |
| [MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md](MAIN_FUNCTIONS_IMPROVEMENT_PLAN.md) | Rounds 1–2 — implemented except §2.2/§5.2/§6.1 and R2.2 (push notifications) |
| [NFC_WRITE_DATA_ADMIN_PLAN.md](NFC_WRITE_DATA_ADMIN_PLAN.md) | Tag content (sticker holds only a link) — implemented |
| [TAG_CONTENT_BEYOND_STICKERS_PLAN.md](TAG_CONTENT_BEYOND_STICKERS_PLAN.md) | QR/link tags — **not implemented** (cancelled) |

## Audits
| File | Status |
|---|---|
| [SYSTEM_AUDIT_PLAN.md](SYSTEM_AUDIT_PLAN.md) | Round 1 — implemented |
| [SYSTEM_AUDIT_ROUND2.md](SYSTEM_AUDIT_ROUND2.md) | Round 2 (incl. A0: owners blocked) — implemented; B7 reverted, then re-applied for passcode admins (EMAIL_OWNERSHIP_PLAN.md) |
| [SYSTEM_AUDIT_ROUND3.md](SYSTEM_AUDIT_ROUND3.md) | Round 3 (A1: owners saw no tags) — implemented |
| [SYSTEM_AUDIT_ROUND4.md](SYSTEM_AUDIT_ROUND4.md) | Round 4 (release process, data integrity, privacy, ops) — implemented; merge to `main` and the live pass are yours; staging postponed |
| [SYSTEM_AUDIT_ROUND4_IMPLEMENTATION_PLAN.md](SYSTEM_AUDIT_ROUND4_IMPLEMENTATION_PLAN.md) | Round 4 implementation plan — implemented |
| [EMAIL_OWNERSHIP_PLAN.md](EMAIL_OWNERSHIP_PLAN.md) | Wrong-email sign-ups: admins must verify, type email twice, change email before verifying — implemented; §5 cleanup and live checks are yours |
