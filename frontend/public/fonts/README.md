# Self-hosted Phase 9A fonts

Inter and Geist Mono are the verified families in https://ampliflow.in/about public metadata. Font files here are licensed Google Fonts distributions, not copied Ampliflow assets. SIL Open Font License 1.1 texts are retained unchanged in inter-OFL.txt and geistmono-OFL.txt.

Downloaded 21 November 2026 from the Google Fonts CSS API:
https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&family=Geist+Mono:wght@100..900&display=swap

Latin / Latin-ext WOFF2 subsets, variable weight 100-900:
- inter-latin.woff2: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2
- inter-latin-ext.woff2: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2
- inter-latin-italic.woff2: https://fonts.gstatic.com/s/inter/v20/UcC53FwrK3iLTcvneQg7Ca725JhhKnNqk6L5UUM.woff2
- geist-mono-latin.woff2: https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmg.woff2
- geist-mono-latin-ext.woff2: https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrkdmgPn.woff2

Licenses:
https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt
https://github.com/google/fonts/blob/main/ofl/geistmono/OFL.txt

The CSS preserves the upstream unicode ranges, including INR through Latin-ext. Inter has a genuine italic face; Geist Mono uses normal style only. Latin-only italic is appropriate to current English editorial emphasis; other script coverage requires an explicit font/subset review. Do not claim support for scripts the shipped subsets do not cover.

styles/fonts.css references these files locally. Serve the public fonts directory with the app; no browser connection to Google Fonts is needed. Only normal Latin Inter is preloaded. No package or lockfile change was made.
