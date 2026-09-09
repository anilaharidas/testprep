# WhatsApp Cloud API — setup in the client's account

Goal: the OTP number, WhatsApp Business Account (WABA), billing, and verification all
live in **the client's** Meta Business Portfolio from day one. You operate as an invited
admin during the build; at handoff you're removed and the token is rotated. Nothing is
transferred, and no charges ever land on your card.

Do all remaining feature work on `OTP_PROVIDER=mock`. Only run this checklist near
delivery. Budget ~1 hour of clicking + 1–10 business days waiting on Business Verification.

Graph API version referenced here: **v21.0** (stable as of 2026; bump `WHATSAPP_API_VERSION`
if you want a newer one). On-Premises API is dead — Cloud API only.

---

## 0. What the client provides

- A **dedicated phone number** not currently active on the WhatsApp / WhatsApp Business
  consumer apps (delete it from there first if it is). Must receive one SMS or voice call.
- A **payment card** for the WABA (conversation charges — ~₹0.115 per OTP in India).
- **Legal business details + one document** for Meta Business Verification (registration
  certificate, GST certificate, utility bill, or bank statement showing the business name).
- Access to their Meta Business account (or they create one at business.facebook.com).

## 1. Get access to the client's business

Client does: **business.facebook.com → Business settings → Users → People → Add** →
your email → role **Admin** (needed for system users + tokens; downgrade or remove at
handoff).

You accept the email invite, then perform every step below logged in as yourself, with
the client's business selected in the top-left business switcher.

---

## 2. Create the Meta app

1. Go to **developers.facebook.com** → log in.
2. If this is your first app: complete developer registration (verify phone/email, accept
   terms).
3. **My Apps → Create App**.
4. **App name**: e.g. `TestPrep OTP`. **Contact email**: yours. Click Next.
5. **Use case**: pick **"Other"** → Next → **App type: Business** → Next.
   *(Meta sometimes shows "Authenticate and request data from users with WhatsApp"
   directly — that's fine too, pick it and skip to step 7.)*
6. **Business portfolio**: select the **client's** portfolio (not "No business portfolio",
   not your own). → **Create app** → re-enter your Facebook password.

## 3. Add the WhatsApp product

7. On the app **Dashboard**, find **WhatsApp** in the product list → **Set up**.
8. Select the client's **Business portfolio** again if asked → **Continue**.
9. Meta auto-creates:
   - a **WhatsApp Business Account (WABA)**,
   - a **test phone number** (free, for dev).

## 4. API Setup page — verify the pipe works

Left nav: **WhatsApp → API Setup**.

10. You'll see a **temporary access token** (24h) — ignore it, we mint a permanent one later.
11. Under **Send and receive messages**:
    - **From** = the test number. Note its **Phone number ID** (long number under the
      dropdown).
    - **To** = click **Manage phone number list** → add **your own** WhatsApp number →
      enter the code Meta sends you.
12. Click **Send message** to fire the sample `hello_world` template to yourself. If it
    arrives, the app ↔ WhatsApp connection works.
13. Copy the **WhatsApp Business Account ID** shown near the top of this page → keep as
    `WHATSAPP_WABA_ID` (used for template management / debugging).

## 5. Add the real business phone number

14. **API Setup → From** dropdown → **Add phone number**.
15. **Business profile**: enter the **display name** (this goes through Meta review — must
    relate to the business, no URLs/promo text), pick a **category**, add a short
    description. → Next.
16. Enter the **phone number** with country code → choose **Text message** or **Phone
    call** → enter the 6-digit verification code.
17. The number now appears in the **From** list. Note **its** **Phone number ID** — this
    is the real one → `WHATSAPP_PHONE_NUMBER_ID`.
18. The **display-name review** runs in the background (usually approved in a few hours to
    a day). You can keep going.

## 6. Add a payment method

19. Go to **business.facebook.com/wa/manage/** (WhatsApp Manager) → select the client's
    WABA in the top-left.
20. **Settings → Billing & payments → Payment settings → Add payment method**.
21. Enter the **client's** card, set it as the active method for this WABA.
22. Until this is done you can only message the test recipients from step 11.

## 7. Start Business Verification (do this early — it's the long pole)

23. **business.facebook.com → Business settings → Business info → Start verification**
    (or **Security Center → Start verification**).
24. Fill legal business name, address, phone, website. Upload the document from step 0.
25. Submit. Review takes **1–10 business days**. Keep building meanwhile.
26. Verification unlocks higher messaging limits and is required for Advanced Access.

## 8. Create the OTP message template

WhatsApp forbids free-form OTP text — an authentication template is mandatory.

27. **WhatsApp Manager → Templates → Create template**.
28. **Category: Authentication**.
29. **Name**: `otp_verification`  →  `WHATSAPP_TEMPLATE_NAME`
    **Language**: `English (US)`  →  `WHATSAPP_TEMPLATE_LANG=en_US`
30. **Body**: tick **Add security recommendation** ("For your security, do not share this
    code").
31. **Footer**: tick **Add expiry time** → **5 minutes** (match `OTP_TTL_SECONDS=300`).
32. **Buttons**: choose **Copy code** (simplest). *(One-tap autofill needs your Android
    app's signing hash — skip unless you have a native Android app.)*
33. **Submit**. Authentication templates usually approve in minutes–hours.

## 9. Mint the permanent access token (System User)

Never use your personal token or the 24h one in the server.

34. **business.facebook.com → Business settings → Users → System users → Add**.
35. **Name**: `otp-service`. **Role**: **Admin**. → Create.
36. Select it → **Assign assets**:
    - **Apps** → your app → **Full control** (Manage app) → Save.
    - **WhatsApp accounts** → your WABA → **Full control** → Save.
37. Click **Generate new token**.
    - **App**: your app.
    - **Token expiration**: **Never**.
    - **Permissions**: tick **`whatsapp_business_messaging`** and
      **`whatsapp_business_management`**.
    - **Generate token** → **copy it immediately** (shown once) → `WHATSAPP_TOKEN`.

## 10. (Optional) Webhook for delivery/failure status

The app doesn't need inbound webhooks to *send* OTPs, but they're useful for diagnosing
failed deliveries.

38. **App → WhatsApp → Configuration → Webhook → Edit**.
39. **Callback URL**: `https://<your-server>/api/whatsapp/webhook`
    **Verify token**: any random string (also set it in your server config).
40. **Verify and save** → **Manage** → subscribe to the **`messages`** field.

## 11. App Review / go live

41. **App Dashboard → App Review → Permissions and Features**.
42. Request **Advanced Access** for **`whatsapp_business_messaging`** (needs Business
    Verification complete).
43. Top bar: flip the app **Development → Live**.
44. Note: because the number sits in the client's own WABA with a Full-control system
    user, **Standard Access often already messages any number**. Test after go-live; only
    chase Advanced Access if you hit `recipient not in allowed list` (error code 131030).

---

## 12. Wire the app

`server/.env`:

```
OTP_PROVIDER=whatsapp
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=<step 17>
WHATSAPP_TOKEN=<step 37>
WHATSAPP_TEMPLATE_NAME=otp_verification
WHATSAPP_TEMPLATE_LANG=en_US
```

Smoke-test one real message before switching the whole app:

```bash
cd server
node scripts/wa-test.js +9198XXXXXXXX          # your own WhatsApp number
```

Then restart the API. Registration and password-reset now send real WhatsApp codes; the
dev-code banner disappears automatically (the provider returns `devCode: null`).

### Values you must end up with

| Value | From | Env var |
|-------|------|---------|
| Phone number ID (real number) | step 17 | `WHATSAPP_PHONE_NUMBER_ID` |
| Permanent System User token | step 37 | `WHATSAPP_TOKEN` |
| Template name | step 29 | `WHATSAPP_TEMPLATE_NAME` |
| Template language | step 29 | `WHATSAPP_TEMPLATE_LANG` |
| WABA ID | step 13 | (debugging only) |

## 13. Handoff

1. Client: Business settings → Users → People → **remove you**.
2. Rotate the System User token (generate a new one, update the deployment secret).
3. WABA, number, templates, billing, and verification stay exactly where they are.

## Common send errors

| Code | Meaning | Fix |
|------|---------|-----|
| 131030 | Recipient not in allowed list | App still in Development, or add the number under API Setup → To |
| 132001 | Template does not exist / wrong name or language | Match `WHATSAPP_TEMPLATE_NAME` / `_LANG` exactly; template must be **approved** |
| 132000 | Template param count mismatch | Body expects exactly one variable (the code); button param present |
| 190 | Access token invalid/expired | Regenerate the System User token with **Never** expiry |
| 100 (subcode 33) | Phone number ID not found / no access | System user lacks Full control on the WABA |
| 131049 | Per-user marketing limit / quality pause | Not applicable to auth normally; check number quality in WhatsApp Manager |

## Cost note

Authentication-category messages are billed **per message** (~₹0.115 in India; varies by
country). No platform/subscription fee on the direct Cloud API. Consider a per-number
send cap in `sendOtp` before launch if abuse is a concern.

## References

- Meta — [WhatsApp Cloud API Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/)
- Meta — [Authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates/)
- Meta — [WhatsApp Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts)
- Meta — [Cloud API error codes](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/)
