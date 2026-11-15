/* Public configuration only. Never put a REsimpli API key in this file.
 * HighLevel's public ID comes from the existing MaliHaus seller adapter.
 * Google IDs verified in the owning client accounts on November 15, 2026.
 */
window.MHIntegration = Object.freeze({
  // Keep public intake closed until the Zapier/REsimpli journey is verified.
  deliveryEnabled: false,
  measurementEnabled: true,
  allowedOrigins: ['https://www.malihaus.com','https://malihaus.com','https://getoffer.malihaus.com'],
  ghlTrackingId: 'tk_847f0db77c7948389132ba8dce6490a7',
  formId: 'malihaus-seller-enquiry',
  gtmContainerId: 'GTM-PBSJTR3X',
  ga4MeasurementId: 'G-C80CNLCS5Y',
  googleAdsConversion: 'AW-18565672610/xquSCJiP9bgdEKLd5pRF',
  downstreamResimpliVerified: false
});
