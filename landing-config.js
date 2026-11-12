/* MaliHaus paid-search landing pages: ONE configuration block.
   Used by /sell-your-house/florida/ and /sell-your-house/ohio/ only.
   Nothing here is a secret. CRM credentials live on the server
   (integration/resimpli-intake), never in this file. */
window.MH_LANDING = {
  /* ---- Phone ----
     Published business number, verified on www.malihaus.com 2026-11-12.
     Swap both values for a call-tracking number when one is issued. */
  phoneDigits: '4079173347',
  phoneDisplay: '407-917-3347',

  /* ---- Lead delivery (server side, direct to REsimpli) ----
     URL of the deployed intake handler in integration/resimpli-intake,
     for example 'https://leads.example.com'. No trailing slash.
     EMPTY = not connected. While empty the form refuses to report success
     and tells the visitor to call instead. */
  intakeBase: '',
  requestTimeoutMs: 20000,

  /* ---- Measurement ----
     Leave empty until the real IDs exist. Events always queue into
     window.dataLayer, so nothing is lost before a container is attached. */
  gtmId: '',                 /* 'GTM-XXXXXXX' */
  googleAdsId: '',           /* 'AW-XXXXXXXXXX', only used when gtmId is empty */
  googleAdsLeadLabel: '',    /* conversion label for lead_submitted */
  respectGlobalPrivacyControl: true,

  /* ---- Legal identity and links ----
     Identity line and address are the ones published on MaliHaus' own
     live pages. Policy links point at the only MaliHaus policy pages that
     currently load (the www links return 404, checked 2026-11-12). */
  legalLine: 'MaliHaus is a brand of Real Estate RE Marketing Inc.',
  addressLine: '1515 S Federal Hwy Ste 156, Boca Raton, FL 33432',
  privacyUrl: 'https://getoffer.malihaus.com/privacy-policy/',
  termsUrl: 'https://getoffer.malihaus.com/terms-of-use/',

  /* ---- Consent wording ----
     Copied verbatim from the wording already published on
     getoffer.malihaus.com (policy version 2026-10-06). Do not reword here;
     change it only when the business approves new wording. The HELP number
     is the A2P registered number and is deliberately not the public one. */
  consentVersion: '2026-10-06',
  consentCheckboxLabel: 'I agree to the Terms & Conditions and Privacy Policy.',
  consentDisclosure: 'I request a response about my property enquiry using the contact details I provide. Marketing permission is optional.',
  marketingConsentDisclosure: 'I agree to receive marketing calls and text messages, including calls using automated technology or an artificial or prerecorded voice, at the phone number I provide, from MaliHaus, a brand of Real Estate RE Marketing Inc. Consent is not a condition of purchasing any property, goods or services. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help at (321) 655-2099. We will not share or sell mobile data to third parties for promotional or marketing purposes.'
};
