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
- **MCQ practice**: from the dashboard, a parent/teacher picks a dependent, then subject
  (+ optional chapter) and takes a multiple-choice practice quiz, graded instantly with a
  per-question review. Attempt history is kept per dependent.

## MCQ question bank

Seeded from `server/seed/cbse-mcq.csv` (CBSE grades 6–10 · Maths/Mathematics, Science,
English, Social — ~29.5k questions) into a `mcq_question` table on first boot
(`server/src/mcq/seed.js`, auto-runs whenever the table is empty — safe to wipe
`server/data/` and restart). Two cleanups applied on import, everything else kept as-is:

- `Maths`/`Mathematics` subject spelling normalized to `Mathematics` (grade 10 used
  "Maths" in the source file, every other grade used "Mathematics" — same subject).
- A trailing generator artifact like `[Source gegp203.pdf, case 13362]` (~12% of rows)
  is stripped from the question text — not meant for students to see.

A grade+subject can have more than one chapter sharing the same chapter number (e.g. two
different "Chapter 1"s from different books) — the chapter picker and quiz API key on
**chapter number + chapter title together**, not the number alone.

API: `GET /api/mcq/subjects`, `GET /api/mcq/chapters`, `POST /api/mcq/quiz` (build, no
answers included), `POST /api/mcq/quiz/grade` (score + per-question correct/incorrect,
records an attempt), `GET /api/mcq/attempts` (history) — all under `requireAuth` and
scoped to a dependent the logged-in account owns.

## Stack

| Layer    | Tech                                            |
| -------- | ----------------------------------------------- |
| Frontend | React + Vite                                    |
| Backend  | Node + Express                                  |
| Storage  | SQLite (`better-sqlite3`), file at `server/data/app.db` |
| Auth     | bcrypt password hashes + httpOnly session cookie |
| OTP      | Pluggable provider — `mock` / `manual` / `whatsapp` |

## Run

```bash
npm run install:all
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:4000 (proxied from the client at `/api`)

## OTP delivery modes (`OTP_PROVIDER`)

| Mode | How the code reaches the user | Cost |
| --- | --- | --- |
| `mock` (default) | Returned by the API, shown in a dev banner + server log | free |
| `manual` | User is deep-linked to WhatsApp the **operator**; operator reads the code in the panel and replies by hand | free |
| `whatsapp` | Sent automatically via WhatsApp Cloud API authentication template | Meta per-message fee |

### `manual` mode — operator relay

1. `server/.env`:
   ```
   OTP_PROVIDER=manual
   OTP_MANUAL_OPERATOR_NUMBER=917510563991   # digits only, incl. country code
   ADMIN_PASSWORD=<something strong>
   ADMIN_PANEL_SLUG=<random>                 # blank = auto-generated, printed on boot
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

Set in `server/.env`:

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
> `server/src/notify/telegram.js` to just "new request — open panel".

> Security note: because the code is a fixed function of the phone number, anyone who
> knows the formula can compute any number's code. The practical control is that the
> user still has to reach the operator and the operator still has to reply. Add a
> rotating salt to the formula (`OTP_FORMULA_ADD` per day, or extend `formulaCode`) if
> that matters.

### `whatsapp` mode — going live with Cloud API

The real provider is implemented at `server/src/otp/providers/whatsapp.js`. It sends the
code through a pre-approved **AUTHENTICATION-category message template** in the client's
WhatsApp Business Account (WhatsApp does not allow free-form OTP text).

1. Provision Cloud API **in the client's Meta Business Portfolio** (see
   `docs/whatsapp-cloud-api-setup.md`).
2. Create an authentication template (e.g. `otp_verification`) with a COPY_CODE or
   ONE_TAP button.
3. Fill `server/.env`:
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
