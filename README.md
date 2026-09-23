# Test Prep Sign-Up Flow

Registration & login workflow for a high-school test-prep questionnaire app — **free mode only**.
Built from `Test Prep Sign-Up Flow.pdf` (Product Spec V1).

## What it does

- **Roles**: an account belongs to a **Parent** or a **Teacher**. Only the registering
  adult's details are collected (name, WhatsApp number, password).
- **Dependents**: children (Parent, max 2) / students (Teacher, max 5) are lightweight
  profiles — name + grade only.
- **WhatsApp OTP** verifies identity at sign-up and password reset. It is **not** used for
  everyday login — the password set at registration is the everyday credential.
- **Free-mode caps** are enforced at the "add child / student" step, not at registration,
  so an account can start with zero dependents.
- **MCQ practice**: from the dashboard, a parent/teacher picks a dependent, then narrows
  down subject → chapter → section(s) → difficulty, previews how many questions match,
  and takes a test with question-by-question navigation, instant grading, and a
  mistakes-only review. Attempt history is kept per dependent.
- **Shareable practice links**: a parent/teacher can copy a link per dependent
  (`/share/<token>`) and send it however they like (WhatsApp, SMS, email, ...) — the
  student opens it directly and gets the same subject → ... → results flow with no
  login required. One standing link per dependent; attempts still show up in the
  parent/teacher's own attempt history.

## MCQ question bank

Seeded from `server/seed/cbse-mcq.csv` (CBSE grades 6–10 · Maths/Mathematics, Science,
English, Social — 29,557 raw rows) into D1's `mcq_question` table via a one-time
offline import (`npm run seed`, see Deploy below — D1 has no request-time filesystem
access, so this can't auto-run at boot the way a local SQLite file could).
**Question, options, correct answer, and difficulty are imported byte-for-byte from
the CSV — never rewritten, reordered, or filtered.** What
import *does* clean up is all about *which rows exist / how they're labelled*, never
their content:

- `Maths`/`Mathematics` subject spelling normalized to `Mathematics` (grade 10 used
  "Maths" in the source file, every other grade used "Mathematics" — same subject).
- A trailing generator artifact like `[Source gegp203.pdf, case 13362]` (~12% of rows)
  is stripped from the question text — not meant for students to see.
- **Duplicate rows are collapsed to one.** The source generator asks the same question
  with the same 4 answer texts many times over (e.g. grade 8 Maths' "A ratio compares:"
  40 times in one chapter) — distinguishable, pre-strip, only by the `[Source]` tag's
  case id. Import keeps one row per (grade, subject, chapter, question, answer-set),
  ignoring which letter the correct answer landed on. 29,557 → **27,158** rows; verified
  zero cases where duplicates disagreed on the correct answer. Quiz generation also
  over-fetches and drops any repeat by question text before returning results, so the
  rare cross-chapter duplicate (question legitimately listed under two chapters, ~18
  cases) still can't produce the same question twice in one test.
- **Chapter title spelling canonicalized** within one (grade, subject, chapter number) —
  3 chapters had a spelling variant (e.g. "A Square and A Cube" vs "...a Cube", or a
  curly vs straight apostrophe) that would otherwise split one chapter's questions across
  two picker entries and make some of them unreachable by exact-title filtering.
- **Sections grouped by section number**, not number+title — a handful of section titles
  are truncated versions of a fuller title under the same number (a source artifact); the
  picker shows one entry per number (using the longest title on record) and selecting it
  still matches every row under that number regardless of which text variant it has.

A grade+subject can have more than one chapter sharing the same chapter number (e.g. two
different "Chapter 1"s from different books) — the chapter picker and quiz API key on
**chapter number + chapter title together**, not the number alone.

**Scoring**: 1 mark per correct answer, no partial or negative marking — a test's score
is exactly the count of correctly-answered questions; the setup and results screens say
so explicitly.

### Selection → test flow

Modelled on a reference build (`questa-practice-test.babu-c-appunny.workers.dev`):

1. **Subject** → **Chapter** (single choice, searchable — some subjects have 30+) →
   **Section(s)** (multi-select; skipped automatically when a chapter has only one) →
   **Difficulty** (Level 1–5, live count per level, zero-count levels disabled).
2. **Test preview** — shows the total matching question count and **Begin Test** /
   **Change Selection** (restarts from Subject).
3. **Test** — a numbered palette jumps to any question; **Previous**/**Next**; **Submit
   Test** works with any number answered — a confirmation shows the answered/unanswered
   split first if any are unanswered (they score zero).
4. **Results** — score, percentage, **Review Mistakes** (cycles only the wrong/unanswered
   ones, each showing your answer vs. the correct one), **Practice Again** (same
   selection, fresh random set), **Choose Another Section** (back to the section step).

API: `GET /api/mcq/subjects`, `GET /api/mcq/chapters`, `GET /api/mcq/sections`,
`GET /api/mcq/difficulty`, `POST /api/mcq/quiz` (build, no answers included),
`POST /api/mcq/quiz/grade` (takes the full question-id list + a sparse answers map, so
unanswered ones are gradeable; records an attempt), `GET /api/mcq/attempts` (history) —
all under `requireAuth` and scoped to a dependent the logged-in account owns.

### Shareable practice links

`GET /api/mcq/share-link?dependentId=` (get-or-create) and
`POST /api/mcq/share-link/regenerate` (rotates the token, invalidating the old link)
are `requireAuth`'d, same as the routes above. The public side is a parallel,
unauthenticated route tree at `/api/share/:token/...` (`/`, `/subjects`, `/chapters`,
`/sections`, `/difficulty`, `POST /quiz`, `POST /quiz/grade`, `/attempts`) — the token
itself is the authorization, resolved server-side to exactly one dependent
(`server/worker/mcq/shareLinks.js`); nothing on that side can reach any other
dependent or the owning account's details. One standing link per dependent
(`dependent_share_link` table, `UNIQUE` on `dependent_id`) rather than one-shot or
time-limited, so a parent/teacher can keep re-sharing it for ongoing practice.

## Stack

| Layer    | Tech                                                        |
| -------- | ------------------------------------------------------------ |
| Frontend | React + Vite, served as Cloudflare Pages static assets       |
| Backend  | Hono, running as a Cloudflare Pages Function (`functions/api/[[path]].js`, app in `server/worker/`) |
| Storage  | Cloudflare D1                                                 |
| Auth     | bcryptjs password hashes + httpOnly session cookie             |
| OTP      | Pluggable provider — `mock` / `manual` / `whatsapp`            |

Cloudflare's Workers runtime has no native addons and no filesystem, so this is a
genuine Workers-native backend (async D1 calls, no Express) rather than a Node
server — there's exactly one backend, used both for local dev and for what's
actually deployed.

## Run

```bash
npm run install:all
cp .dev.vars.example .dev.vars   # fill in at least OTP_PROVIDER (mock is fine to start)
npm run dev
```

- Client: http://localhost:5173 (Vite, hot-reloading)
- API: http://localhost:8788 (`wrangler pages dev` running the real Hono/D1 worker
  locally via Miniflare, proxied from the client at `/api`)

First time only, apply the schema to the local D1 database and seed the question
bank (see Deploy below for the same commands with `--remote` for production):

```bash
npx wrangler d1 execute testprep-db --local --file=server/migrations/0001_init.sql
npm run seed   # CSV -> server/seed/sql/*.sql (gitignored)
for f in server/seed/sql/*.sql; do
  npx wrangler d1 execute testprep-db --local --file="$f"
done
```

## Deploy (Cloudflare Pages + Functions + D1)

### First-time setup

```bash
npx wrangler login                    # one-time browser auth
npx wrangler d1 create testprep-db    # copy the printed database_id into wrangler.toml
npx wrangler d1 execute testprep-db --remote --file=server/migrations/0001_init.sql

npm run seed                          # CSV -> server/seed/sql/*.sql (gitignored, ~55 files)
for f in server/seed/sql/*.sql; do
  npx wrangler d1 execute testprep-db --remote --file="$f"
done

npx wrangler pages project create testprep --production-branch=main
```

Then set the same variables `.dev.vars.example` documents as **Pages environment
variables/secrets** (dashboard → the project → Settings → Environment variables, or
`npx wrangler pages secret put NAME --project-name=testprep`) — `CLIENT_ORIGIN` (the
Pages URL), `OTP_PROVIDER`, `ADMIN_PASSWORD`, `ADMIN_PANEL_SLUG` (must be set
explicitly — no filesystem to auto-generate one), and the Telegram/WhatsApp vars if
used. `wrangler pages secret put` only writes the **production** environment.

### Deploying

Push to `main` — the Pages project is connected to this GitHub repo (Settings →
Builds & deployments) and auto-deploys on every push, build command
`npm run install:all && npm run build` (installs `client/`'s and `server/`'s own
dependencies too, not just the root's), output directory `client/dist`. To deploy
by hand instead: `npm run deploy`. Attach a custom domain from the dashboard
(Custom domains) whenever you're ready — that's what replaces the default
`*.pages.dev` URL with a stable one of your own.

## OTP delivery modes (`OTP_PROVIDER`)

| Mode | How the code reaches the user | Cost |
| --- | --- | --- |
| `mock` (default) | Returned by the API, shown in a dev banner + server log | free |
| `manual` | User is deep-linked to WhatsApp the **operator**; operator reads the code in the panel and replies by hand | free |
| `whatsapp` | Sent automatically via WhatsApp Cloud API authentication template | Meta per-message fee |

### `manual` mode — operator relay

1. `.dev.vars` locally / Pages environment variables in production:
   ```
   OTP_PROVIDER=manual
   OTP_MANUAL_OPERATOR_NUMBER=917510563991   # digits only, incl. country code
   ADMIN_PASSWORD=<something strong>
   ADMIN_PANEL_SLUG=<something unguessable>  # must be set explicitly — no filesystem to auto-generate one
   ```
2. Code is **deterministic**, varied by purpose and resend count:
   `OTP = (N × 7919 + 104729 + 2749·[reset] + 3517·seq) mod 10000`
   — N = national number typed, `seq` = 0 on a fresh send and +1 per resend. So a
   password-reset code differs from the register code, and every **Resend** gives a new
   code. A first register send is still exactly `(N × 7919 + 104729) mod 10000`.
   Config: `OTP_FORMULA_MUL`, `OTP_FORMULA_ADD`, `OTP_FORMULA_PURPOSE_STEP`,
   `OTP_FORMULA_RESEND_STEP`. 4 digits.
3. User clicks **Request code on WhatsApp** → their WhatsApp opens with a short
   prefilled message to the operator (the operator sees who sent it from the WhatsApp
   chat; the number + code are also in the operator panel and the Telegram push).
4. Operator opens **`/panel/<slug>`**, signs in with the password, sees the request +
   its code, taps **Reply on WhatsApp** to send it.
5. The panel auto-refreshes every 4s and shows status (pending / verified / expired /
   locked) and wrong-attempt counts. It also **chimes** on a new request while open, and
   badges the tab title with the pending count.

#### Telegram push (so the operator isn't tied to the panel)

Set in `.dev.vars` locally / Pages environment variables in production:

```
TELEGRAM_BOT_TOKEN=...     # @BotFather -> /newbot
TELEGRAM_CHAT_ID=...       # node scripts/tg-chat-id.js after messaging the bot
```

On each request the operator gets a Telegram message with the number, the code, and
inline buttons: **Reply on WhatsApp** and **Open operator panel**. It's fire-and-forget —
a Telegram outage never blocks sign-up.

- Find your chat id: `cd server && node scripts/tg-chat-id.js`
- Test it: `cd server && node scripts/tg-test.js`

> Telegram's servers see the number and code. If that's a concern, trim the message in
> `server/worker/notify/telegram.js` to just "new request — open panel".

> Security note: because the code is a fixed function of the phone number, anyone who
> knows the formula can compute any number's code. The practical control is that the
> user still has to reach the operator and the operator still has to reply. Add a
> rotating salt to the formula (`OTP_FORMULA_ADD` per day, or extend `formulaCode`) if
> that matters.

### `whatsapp` mode — going live with Cloud API

The real provider is implemented at `server/worker/otp/providers/whatsapp.js`. It sends
the code through a pre-approved **AUTHENTICATION-category message template** in the
client's WhatsApp Business Account (WhatsApp does not allow free-form OTP text).

1. Provision Cloud API **in the client's Meta Business Portfolio** (see
   `docs/whatsapp-cloud-api-setup.md`).
2. Create an authentication template (e.g. `otp_verification`) with a COPY_CODE or
   ONE_TAP button.
3. Fill `.dev.vars` locally / Pages environment variables in production:
   ```
   OTP_PROVIDER=whatsapp
   WHATSAPP_PHONE_NUMBER_ID=…
   WHATSAPP_TOKEN=…            # permanent System User token
   WHATSAPP_TEMPLATE_NAME=otp_verification
   WHATSAPP_TEMPLATE_LANG=en_US
   ```
4. Smoke-test one message before switching the app over:
   ```bash
   cd server && node scripts/wa-test.js +9198XXXXXXXX
   ```

Everything else (code generation, expiry, 3-attempt lock, resend cooldown, verification
tokens) is provider-independent and does not change.

## Flows implemented

1. **Registration** — role → WhatsApp number → OTP verify → name + password → add
   dependents loop (capped) → dashboard. Already-registered numbers are routed to Login.
2. **Login** — WhatsApp number + password. Unknown number → Register. Repeated wrong
   passwords → temporary lock + Forgot-password.
3. **Password reset** — Forgot password → number → OTP → new password → back to login.
4. **Dashboard** — view account, add/remove dependents up to the role cap.

## Open questions (from the spec — defaults chosen here)

| Question | Default used |
| -------- | ------------ |
| Grade range | **6–10** |
| WhatsApp OTP provider | mock (swappable) |
| One number = one role, ever | assumed yes (enforced) |
| Edit/remove a dependent | remove is allowed and **frees a slot** |
| Incomplete sign-up | OTP verification tokens expire after 24h |
