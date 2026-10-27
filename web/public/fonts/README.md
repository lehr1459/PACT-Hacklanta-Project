# Existing PACT fonts, hosted locally

PACT already used DM Sans400–700 and Manrope400–800 through Google Fonts. The same families/weights now load from this application's origin so hosted sign-in does not contact a third party or relax its strict Content Security Policy. Files are unmodified upstream variable TrueType assets; browser `font-display: swap` behavior is preserved. No license is assigned to PACT's own code by adding these fonts.

| Asset | Pinned Google Fonts source | SHA256 |
| --- | --- | --- |
| `pact-dm-sans-variable.ttf` | [DM Sans at5b35b7208dd4100571326fdf37f030b32a524232](https://github.com/google/fonts/blob/5b35b7208dd4100571326fdf37f030b32a524232/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf) | `8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d` |
| `pact-manrope-variable.ttf` | [Manrope atb31870aff700ab7a1d74fa0c6887d95beb9e0037](https://github.com/google/fonts/blob/b31870aff700ab7a1d74fa0c6887d95beb9e0037/ofl/manrope/Manrope%5Bwght%5D.ttf) | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` |

Retrieved from `raw.githubusercontent.com/google/fonts` at those exact commits on2026-10-19. Retain the adjacent upstream copyright/license notices, [DM Sans OFL](DM-Sans-OFL.txt) and [Manrope OFL](Manrope-OFL.txt). Both use SIL Open Font License1.1. Owner-controlled public deployment remains separately authorized.
