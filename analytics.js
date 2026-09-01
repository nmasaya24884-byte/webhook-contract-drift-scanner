(function () {
  const measurementId = 'G-C6F5VQ98EG';
  const allowed = new Set([
    'sample_loaded', 'scanner_viewed', 'scan_started', 'scan_completed',
    'scan_error', 'fixture_generated', 'test_copy', 'test_download',
    'paid_plan_viewed', 'paid_cta_clicked', 'github_cta_clicked',
    'client_error', 'unhandled_rejection'
  ]);

  window.tst001Track = function (name) {
    if (!allowed.has(name)) return;
    window.dispatchEvent(new CustomEvent('tst001:event', { detail: { name } }));
    if (window.TST001_CONFIG?.analyticsEnabled && typeof window.gtag === 'function') {
      // Event name only: no payload, path, value, fixture, test, or error text.
      window.gtag('event', name);
    }
  };

  if (!window.TST001_CONFIG?.analyticsEnabled) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ads_data_redaction: true
  });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(tag);

  window.addEventListener('error', () => window.tst001Track('client_error'));
  window.addEventListener('unhandledrejection', () => window.tst001Track('unhandled_rejection'));
}());
