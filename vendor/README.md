# Vendored libraries

Bundled so the app works offline and makes no third-party requests. Both are MIT licensed.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `papaparse.min.js` | Papa Parse | 5.4.1 | https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js | MIT, (c) Matthew Holt, https://github.com/mholt/PapaParse |
| `chart.umd.min.js` | Chart.js | 4.4.1 | https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js | MIT, (c) Chart.js Contributors, https://github.com/chartjs/Chart.js |

To upgrade, download the new minified build to the same file name, update this table, and bump `SHELL` in `sw.js` so installed apps pick it up.
