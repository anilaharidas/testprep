/**
 * OTP delivery provider interface.
 *
 * A provider is responsible only for *delivering* a code that the app has already
 * generated and stored. Generation, hashing, expiry, attempt-counting and locking
 * live in the app (see worker/otp/service.js) so they are identical across providers.
 *
 * Implement:
 *   name                          -> string
 *   async send(ctx, { whatsappNumber, code, purpose }) -> { deliveredAt, providerRef?, devCode? }
 *
 * `ctx` is `{ db, config, waitUntil }` — providers that kick off background work
 * (e.g. a Telegram push) after replying must hand that promise to `ctx.waitUntil()`,
 * since the Workers runtime can kill un-awaited work once the response is sent.
 *
 * `devCode` is optional and only used by non-production providers to surface the
 * code back to the client/UI. Real providers must never return it.
 */
export class OtpProvider {
  get name() {
    return 'base';
  }

  // eslint-disable-next-line no-unused-vars
  async send(ctx, { whatsappNumber, code, purpose }) {
    throw new Error('OtpProvider.send() not implemented');
  }
}
