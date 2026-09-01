(function () {
  const measurementId = 'G-C6F5VQ98EG';
  const qaTransportAudit = new URLSearchParams(location.search).get('tst001_transport_audit') === '1';
  if (qaTransportAudit) {
    const records = [];
    const publish = () => {
      let output = document.getElementById('tst001-qa-network-audit');
      if (!output) {
        output = document.createElement('pre');
        output.id = 'tst001-qa-network-audit';
        output.hidden = true;
        document.documentElement.append(output);
      }
      output.textContent = JSON.stringify(records);
    };
    const record = (transport, url, body = '', headers = '') => {
      records.push({ transport, url:String(url), body:String(body ?? ''), headers:String(headers ?? '') });
      publish();
    };
    const originalBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalBeacon) navigator.sendBeacon = (url, data) => { record('beacon', url, data); return originalBeacon(url, data); };
    const originalFetch = window.fetch?.bind(window);
    if (originalFetch) window.fetch = (input, init = {}) => { record('fetch', input?.url || input, init.body, JSON.stringify(init.headers || {})); return originalFetch(input, init); };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this.__tst001Url = url; return originalOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (body) { record('xhr', this.__tst001Url, body); return originalSend.apply(this, arguments); };
    publish();
  }
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
