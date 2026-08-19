// Public, non-secret configuration for AppGPT.
// Do NOT put bot tokens, API keys, payment-provider secrets, or private credentials here.
export const DONATION_CONFIG = {
  // Example: "YourBotName" (without @). Used as a fallback deep-link for Stars donations.
  botUsername: "",

  // Recommended Stars flow: a backend endpoint that receives {amount, initData}
  // and returns {invoiceUrl}. The endpoint should call Telegram's Bot API securely.
  starsEndpoint: "",

  // Public TON receiving address. Safe to publish because it is only a receiving address.
  tonAddress: "",

  // External card/support page, e.g. Stripe Payment Link, Ko-fi, Buy Me a Coffee, etc.
  // This should be a public checkout/support URL, never a secret API endpoint.
  cardDonationUrl: "",

  starAmounts: [50, 100, 250, 500],
  tonAmounts: [0.5, 1, 5]
};
