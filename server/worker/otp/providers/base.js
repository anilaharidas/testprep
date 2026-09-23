/**
 * OTP delivery provider interface.
 *
 * A provider is responsible only for *delivering* a code that the app has already
 * generated and stored. Generation, hashing, expiry, attempt-counting and locking
 * live in the app (see worker/otp/service.js) so they are identical across providers.
 *
 * Implement:
 *   name                             -> string
 *   async send(config, { whatsappNumber, code, purpose }) -> { deliveredAt, providerRef?, devCode? }
 *
 * `devCode` is optional and only used by non-production providers to surface the
 * code back to the client/UI. Real providers must never return it.
 */
export class OtpProvider {
  get name() {
    return 'base';
  }

  // eslint-disable-next-line no-unused-vars
  async send(config, { whatsappNumber, code, purpose }) {
    throw new Error('OtpProvider.send() not implemented');
  }
}
