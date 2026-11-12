#!/usr/bin/env python3
"""Render the paid-search landing pages.

    python3 tools/build_landing.py        # run from the repo root

Builds:
    sell-your-house/florida/index.html
    sell-your-house/ohio/index.html

Both pages share one template, landing.css, landing.js and landing-config.js.
State copy lives in tools/landing_data.py. The pages are deliberately
"noindex" and are NOT added to sitemap.xml: they are paid-traffic pages.

Static text that also lives in landing-config.js (phone, legal line, address,
policy links) is read from that file at build time so the no-JavaScript
fallback can never drift from the configured values.
"""

import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from landing_data import (ROOT, BENEFITS, FORM_NOTE, AFTER_SUBMIT, TRUST_FACTS, STEPS,
                          STEPS_NOTE, SITUATIONS, WHY_INTRO, ROUTES, ROUTES_NOTE, FINAL_H2,
                          FINAL_COPY, TESTIMONIALS, FOLLOWUP_QUESTIONS, US_STATES, STATES)

ASSET_V = 1
R = "../../"


def e(t):
    return html.escape(str(t), quote=True)


def cfg(key):
    """Read one string value out of landing-config.js."""
    src = open(os.path.join(REPO, "landing-config.js"), encoding="utf-8").read()
    m = re.search(r"\b" + re.escape(key) + r":\s*'((?:[^'\\]|\\.)*)'", src)
    if not m:
        raise SystemExit(f"landing-config.js: missing {key}")
    return m.group(1)


PHONE = cfg("phoneDisplay")
TEL = "tel:+1" + cfg("phoneDigits")
LEGAL = cfg("legalLine")
ADDRESS = cfg("addressLine")
PRIVACY = cfg("privacyUrl")
TERMS = cfg("termsUrl")

PHONE_SVG = ('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
             '<path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 '
             '11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 '
             '1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>')
CHECK_SVG = ('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">'
             '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" '
             'stroke-linejoin="round" d="M4.5 12.5l4.8 4.8L19.5 7"/></svg>')


def call_link(loc, cls, label=None):
    """label: None = "Call <number>", PHONE = the number alone, anything else = fixed text."""
    number = f'<span data-phone>{PHONE}</span>'
    text = f"Call {number}" if label is None else (number if label == PHONE else label)
    return (f'<a class="{cls}" data-call data-loc="{loc}" href="{TEL}">{PHONE_SVG}'
            f'<span>{text}</span></a>')


def head(s):
    canonical = f"{ROOT}/sell-your-house/{s['slug']}/"
    img = f"{ROOT}/{s['hero_img']}-1440.webp"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(s['title'])}</title>
<meta name="description" content="{e(s['meta'])}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MaliHaus">
<meta property="og:title" content="{e(s['title'])}">
<meta property="og:description" content="{e(s['meta'])}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{img}">
<link rel="canonical" href="{canonical}">
<link rel="icon" href="{R}img/cropped-Untitled-1-270x270.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Karla:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="{R}landing.css?v={ASSET_V}">
<link rel="preload" as="image" href="{R}{s['hero_img']}-640.webp" imagesrcset="{R}{s['hero_img']}-640.webp 640w, {R}{s['hero_img']}-1440.webp 1440w" imagesizes="(min-width: 960px) 520px, 100vw">
</head>
"""


def header():
    return f"""<a class="lp-skip" href="#offer-form">Skip to the offer request form</a>
<header class="lp-header">
  <div class="lp-wrap lp-header-in">
    <span class="lp-logo"><img src="{R}img/logo-copper.png" alt="MaliHaus" width="731" height="250"></span>
    <div class="lp-header-act">
      <a class="lp-tel" data-call data-loc="header" href="{TEL}" aria-label="Call MaliHaus on {PHONE}">{PHONE_SVG}<span class="lp-tel-num" data-phone>{PHONE}</span><span class="lp-tel-short">Call</span></a>
      <a class="lp-btn lp-btn-solid lp-btn-sm" data-cta data-loc="header" href="#offer-form">Request My Offer</a>
    </div>
  </div>
</header>
"""


def form(s):
    opts = "".join(
        f'<option value="{c}"{" selected" if c == s["state_code"] else ""}>{e(n)}</option>'
        for c, n in US_STATES)
    follow = ""
    for key, label, choices in FOLLOWUP_QUESTIONS:
        o = '<option value="">Choose one (optional)</option>' + "".join(
            f'<option>{e(c)}</option>' for c in choices)
        follow += (f'        <div class="lp-field"><label for="fu-{key}">{e(label)}</label>'
                   f'<select id="fu-{key}" name="{key}">{o}</select></div>\n')
    return f"""<div class="lp-card" id="offer-form" tabindex="-1">
  <form id="lp-form" novalidate data-variant="{s['slug']}">
    <h2 class="lp-card-h" id="lp-form-title">Request your offer</h2>
    <p class="lp-progress" id="lp-progress" aria-live="polite">Step 1 of 2: the property</p>

    <div class="lp-alert" id="lp-form-error" role="alert" hidden></div>

    <fieldset class="lp-step" id="lp-step-1">
      <legend class="lp-vh">Property address</legend>
      <div class="lp-field">
        <label for="street">Property street address</label>
        <input id="street" name="street" type="text" autocomplete="address-line1" autocapitalize="words" required aria-describedby="street-err">
        <p class="lp-err" id="street-err" hidden></p>
      </div>
      <div class="lp-field">
        <label for="city">City</label>
        <input id="city" name="city" type="text" autocomplete="address-level2" autocapitalize="words" required aria-describedby="city-err">
        <p class="lp-err" id="city-err" hidden></p>
      </div>
      <div class="lp-row">
        <div class="lp-field">
          <label for="state">State</label>
          <select id="state" name="state" autocomplete="address-level1" required aria-describedby="state-err">{opts}</select>
          <p class="lp-err" id="state-err" hidden></p>
        </div>
        <div class="lp-field">
          <label for="zip">ZIP code</label>
          <input id="zip" name="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="10" required aria-describedby="zip-err">
          <p class="lp-err" id="zip-err" hidden></p>
        </div>
      </div>
      <button type="button" class="lp-btn lp-btn-solid lp-btn-block" id="lp-continue">Continue</button>
      <p class="lp-note">{e(FORM_NOTE)}</p>
    </fieldset>

    <fieldset class="lp-step" id="lp-step-2" hidden>
      <legend class="lp-vh">Your contact details</legend>
      <p class="lp-summary" id="lp-address-summary"></p>
      <div class="lp-field">
        <label for="name">Your name</label>
        <input id="name" name="name" type="text" autocomplete="name" autocapitalize="words" required aria-describedby="name-err">
        <p class="lp-err" id="name-err" hidden></p>
      </div>
      <div class="lp-field">
        <label for="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required aria-describedby="phone-err phone-hint">
        <p class="lp-hint" id="phone-hint">We use this to contact you about the property.</p>
        <p class="lp-err" id="phone-err" hidden></p>
      </div>
      <div class="lp-field">
        <label for="email">Email <span class="lp-opt">(optional)</span></label>
        <input id="email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" aria-describedby="email-err">
        <p class="lp-err" id="email-err" hidden></p>
      </div>
      <div class="lp-hp" aria-hidden="true">
        <label for="company-website">Leave this field empty</label>
        <input id="company-website" name="company_website" type="text" tabindex="-1" autocomplete="off">
      </div>

      <div class="lp-consents">
        <label class="lp-check" for="consent">
          <input id="consent" name="consent" type="checkbox" required aria-describedby="consent-err">
          <span id="lp-consent-text"></span>
        </label>
        <p class="lp-err" id="consent-err" hidden></p>
        <label class="lp-check" for="marketing">
          <input id="marketing" name="marketing" type="checkbox">
          <span><b>Optional marketing permission.</b> <span id="lp-marketing-text"></span></span>
        </label>
      </div>

      <button type="submit" class="lp-btn lp-btn-solid lp-btn-block" id="lp-submit">Request My Offer</button>
      <button type="button" class="lp-back" id="lp-back">Back to the property address</button>
      <p class="lp-note">{e(AFTER_SUBMIT)} Requesting an offer does not commit you to selling.</p>
    </fieldset>
  </form>

  <div class="lp-result" id="lp-failure" role="alert" tabindex="-1" hidden>
    <h2 class="lp-card-h" id="lp-failure-title">Your request was not sent</h2>
    <p id="lp-failure-text"></p>
    <div class="lp-result-act">
      <button type="button" class="lp-btn lp-btn-solid" id="lp-retry">Try again</button>
      {call_link("form_failure", "lp-btn lp-btn-line")}
    </div>
    <button type="button" class="lp-back" id="lp-edit">Check my details</button>
  </div>

  <div class="lp-result" id="lp-success" tabindex="-1" hidden>
    <p class="lp-ok">{CHECK_SVG}<span>Request received</span></p>
    <h2 class="lp-card-h" id="lp-success-title">Thank you. We have your request.</h2>
    <p><b>What happens next.</b> {e(AFTER_SUBMIT)} You do not need to do anything else.</p>
    <p>Would you rather talk now? {call_link("form_success", "lp-inline-tel", PHONE)}</p>
    <form id="lp-followup" novalidate>
      <h3 class="lp-follow-h">Three optional questions</h3>
      <p class="lp-hint">These help us prepare. Your request is already in, so skip them if you prefer.</p>
{follow}      <button type="submit" class="lp-btn lp-btn-line lp-btn-block" id="lp-followup-send">Add these details</button>
      <p class="lp-follow-status" id="lp-followup-status" role="status" aria-live="polite"></p>
    </form>
  </div>

  <noscript><p class="lp-noscript">The online form needs JavaScript. Please call us on <a href="{TEL}">{PHONE}</a> instead.</p></noscript>
</div>
"""


def hero(s):
    benefits = "".join(
        f'      <li>{CHECK_SVG}<span><b>{e(t)}.</b> {e(d)}</span></li>\n' for t, d in BENEFITS)
    img = R + s["hero_img"]
    return f"""<section class="lp-hero" aria-labelledby="lp-h1">
  <div class="lp-wrap lp-hero-grid">
    <div class="lp-hero-copy">
      <p class="lp-kicker">{e(s['kicker'])}</p>
      <h1 id="lp-h1">{e(s['h1'])}</h1>
      <p class="lp-sub">{e(s['sub'])}</p>
    </div>
    <div class="lp-hero-form">
{form(s)}      <p class="lp-prefer">Prefer to talk it through? {call_link("hero", "lp-inline-tel", PHONE)}</p>
    </div>
    <div class="lp-hero-more">
      <ul class="lp-benefits">
{benefits}      </ul>
      <figure class="lp-photo">
        <img src="{img}-640.webp" srcset="{img}-640.webp 640w, {img}-1440.webp 1440w"
          sizes="(min-width: 960px) 520px, 100vw" width="1440" height="810"
          alt="{e(s['hero_alt'])}" fetchpriority="high" decoding="async">
        <figcaption>{e(s['hero_caption'])}</figcaption>
      </figure>
    </div>
  </div>
</section>
"""


def trust(s):
    facts = "".join(f'      <div><dt>{e(t)}</dt><dd>{e(d)}</dd></div>\n' for t, d in TRUST_FACTS)
    return f"""<section class="lp-sec lp-trust" aria-labelledby="lp-trust-h">
  <div class="lp-wrap lp-trust-grid">
    <div class="lp-id">
      <h2 id="lp-trust-h">Who you are dealing with</h2>
      <address>
        <b>MaliHaus</b><br>
        <span data-address>{e(ADDRESS)}</span><br>
        <a data-call data-loc="identity" href="{TEL}"><span data-phone>{PHONE}</span></a>
      </address>
      <p class="lp-legal" data-legal>{e(LEGAL)}</p>
      <p>{e(s['identity_note'])}</p>
    </div>
    <dl class="lp-facts">
{facts}    </dl>
  </div>
</section>
"""


def testimonials():
    if not TESTIMONIALS:
        return ""
    items = ""
    for t in TESTIMONIALS:
        src = (f'<a href="{e(t["url"])}" rel="noopener" target="_blank">{e(t["source"])}</a>'
               if t.get("url") else e(t["source"]))
        items += (f'    <figure class="lp-quote"><blockquote><p>{e(t["quote"])}</p></blockquote>'
                  f'<figcaption>{e(t["name"])}, {src}</figcaption></figure>\n')
    return f"""<section class="lp-sec lp-quotes" aria-labelledby="lp-quotes-h">
  <div class="lp-wrap">
    <h2 id="lp-quotes-h">What sellers have said</h2>
{items}  </div>
</section>
"""


def steps():
    items = "".join(
        f'      <li><span class="lp-num" aria-hidden="true">{i}</span><div><h3>{e(t)}</h3><p>{e(d)}</p></div></li>\n'
        for i, (t, d) in enumerate(STEPS, 1))
    return f"""<section class="lp-sec lp-light" aria-labelledby="lp-steps-h">
  <div class="lp-wrap">
    <h2 id="lp-steps-h">How it works, in three steps</h2>
    <ol class="lp-steps">
{items}    </ol>
    <p class="lp-callout">{e(STEPS_NOTE)}</p>
  </div>
</section>
"""


def situations():
    items = "".join(f'      <div><dt>{e(t)}</dt><dd>{e(d)}</dd></div>\n' for t, d in SITUATIONS)
    return f"""<section class="lp-sec" aria-labelledby="lp-sit-h">
  <div class="lp-wrap lp-split">
    <div>
      <h2 id="lp-sit-h">Properties we are often asked about</h2>
      <p class="lp-lead">Whatever the reason you are thinking of selling, the first step is the same: tell us about the property.</p>
    </div>
    <dl class="lp-list">
{items}    </dl>
  </div>
</section>
"""


def why():
    intro = "".join(f"      <p>{e(p)}</p>\n" for p in WHY_INTRO)
    routes = "".join(
        f'      <li><span class="lp-route-n" aria-hidden="true">0{i}</span><div><h3>{e(t)}</h3><p>{e(d)}</p></div></li>\n'
        for i, (t, d) in enumerate(ROUTES, 1))
    return f"""<section class="lp-sec lp-why" aria-labelledby="lp-why-h">
  <div class="lp-wrap lp-split">
    <div>
      <h2 id="lp-why-h">Why consider MaliHaus?</h2>
{intro}    </div>
    <div>
      <ol class="lp-routes">
{routes}      </ol>
      <p class="lp-callout lp-callout-dark">{e(ROUTES_NOTE)}</p>
    </div>
  </div>
</section>
"""


def area(s):
    items = "".join(f"        <li>{e(a)}</li>\n" for a in s["areas"])
    img = R + s["area_img"]
    return f"""<section class="lp-sec lp-light" aria-labelledby="lp-area-h">
  <div class="lp-wrap lp-area">
    <div>
      <h2 id="lp-area-h">{e(s['area_h2'])}</h2>
      <p>{e(s['area_intro'])}</p>
      <ul class="lp-areas">
{items}      </ul>
      <p>{e(s['area_note'])}</p>
      <a class="lp-btn lp-btn-dark" data-cta data-loc="area" href="#offer-form">Check my address</a>
    </div>
    <figure class="lp-photo lp-photo-light">
      <img src="{img}-640.webp" srcset="{img}-640.webp 640w, {img}-1440.webp 1440w"
        sizes="(min-width: 960px) 480px, 100vw" width="1440" height="810"
        alt="{e(s['area_alt'])}" loading="lazy" decoding="async">
      <figcaption>Illustrative image.</figcaption>
    </figure>
  </div>
</section>
"""


def faqs(s):
    items = "".join(
        f'      <details><summary><span>{e(q)}</span></summary><p>{e(a)}</p></details>\n'
        for q, a in s["faqs"])
    return f"""<section class="lp-sec" aria-labelledby="lp-faq-h">
  <div class="lp-wrap lp-narrow">
    <h2 id="lp-faq-h">Practical questions</h2>
    <div class="lp-faq">
{items}    </div>
  </div>
</section>
"""


def final():
    return f"""<section class="lp-sec lp-final" id="lp-final" aria-labelledby="lp-final-h">
  <div class="lp-wrap lp-narrow">
    <h2 id="lp-final-h">{e(FINAL_H2)}</h2>
    <p>{e(FINAL_COPY)}</p>
    <div class="lp-final-act">
      <a class="lp-btn lp-btn-dark" data-cta data-loc="final" href="#offer-form">Request My Offer</a>
      {call_link("final", "lp-btn lp-btn-darkline")}
    </div>
  </div>
</section>
"""


def footer():
    return f"""<footer class="lp-footer">
  <div class="lp-wrap">
    <img class="lp-footer-logo" src="{R}img/logo-copper.png" alt="MaliHaus" width="731" height="250" loading="lazy">
    <p><b>MaliHaus</b> &middot; <span data-address>{e(ADDRESS)}</span> &middot; <a data-call data-loc="footer" href="{TEL}"><span data-phone>{PHONE}</span></a></p>
    <p data-legal>{e(LEGAL)}</p>
    <p>This page is a request for a property review. It is not an appraisal, a listing or an offer to buy. Any offer depends on a review of the property and a separate written agreement. Areas named on this page are places where MaliHaus reviews properties. They are not MaliHaus offices.</p>
    <p class="lp-footer-links"><a data-privacy href="{e(PRIVACY)}">Privacy Policy</a> <span aria-hidden="true">&middot;</span> <a data-terms href="{e(TERMS)}">Terms &amp; Conditions</a></p>
  </div>
</footer>

<div class="lp-bar" id="lp-bar" hidden>
  <a class="lp-btn lp-btn-solid" data-cta data-loc="sticky_bar" href="#offer-form">Request My Offer</a>
  {call_link("sticky_bar", "lp-btn lp-btn-line", "Call")}
</div>
"""


def page(s):
    out = head(s)
    out += (f'<body data-lp-variant="{s["slug"]}" data-lp-id="{s["page_id"]}" '
            f'data-lp-state="{s["state_code"]}">\n')
    out += header()
    out += "<main>\n" + hero(s) + trust(s) + testimonials() + steps() + situations()
    out += why() + area(s) + faqs(s) + final() + "</main>\n" + footer()
    out += f'<script src="{R}landing-config.js?v={ASSET_V}"></script>\n'
    out += f'<script src="{R}landing.js?v={ASSET_V}"></script>\n</body>\n</html>\n'
    return out


def main():
    for slug, s in STATES.items():
        d = os.path.join(REPO, "sell-your-house", slug)
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, "index.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(page(s))
        print("wrote", os.path.relpath(path, REPO))


if __name__ == "__main__":
    main()
