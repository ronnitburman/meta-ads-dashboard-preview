# Vendored libraries

Bundled so the app works offline and makes no third-party requests. The libraries are MIT licensed; the font is under the SIL Open Font License 1.1 (`fonts/LICENSE-Inter.txt`).

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `papaparse.min.js` | Papa Parse | 5.4.1 | https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js | MIT, (c) Matthew Holt, https://github.com/mholt/PapaParse |
| `fonts/inter-*-wght-normal.woff2` | Inter (variable, latin + latin-ext subsets) | 4.x via @fontsource-variable/inter 5.1.0 | https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.1.0/files/ | OFL-1.1, (c) The Inter Project Authors, https://github.com/rsms/inter |
| `chart.umd.min.js` | Chart.js | 4.4.1 | https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js | MIT, (c) Chart.js Contributors, https://github.com/chartjs/Chart.js |

To upgrade, download the new minified build to the same file name, update this table, and bump `SHELL` in `sw.js` so installed apps pick it up.
