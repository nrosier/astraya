/**
 * @module ui/totp-qr
 * @purpose Turns the `otpauth://` URI of a TOTP enrolment (#1500) into an SVG QR code as a `data:` URL, for an `<img>`.
 * @conventions The only importer of `uqr` (MIT, no dependencies). It is loaded with a dynamic `import()` from `TotpEnrolmentPanel.tsx` only, so it is its own chunk and never in the eager bundle (`scripts/check-bundle-size.mjs` asserts it). Pure: no storage, no logging; the URI is not kept after the call.
 * @exports qrDataUrl
 */
import { renderSVG } from 'uqr';

/** The QR code for `text` as an SVG `data:` URL, drawn black on white so any authenticator app can read it in either theme. */
export function qrDataUrl(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(text))}`;
}
