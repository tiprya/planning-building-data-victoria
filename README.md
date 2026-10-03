# Planning and Building data - Victoria

A public, shareable view of how much planning and building data we hold for
each of Victoria's 79 local government areas.

**Live site:** https://tiprya.github.io/planning-building-data-victoria/

## What it shows

- An interactive map of Victoria — coverage by council, approval rates,
  planning applications and building events.
- Records collected at each stage of the pipeline.
- Approval and matching rates, and planning/building activity by year.

## What this repository is

A published artefact only. It contains the built site: `index.html`, its
styles and scripts, and the generated data under `data/`. The library files
(Leaflet, Chart.js) are vendored so nothing is fetched from a CDN at runtime.

The pipeline that produces the data is in a separate, private repository. The
data here is regenerated from its published summary products by
`scripts/build_coverage_site.R` and copied across on update.

## Important

Every figure is **research only**. These are not official statistics, and no
single council's figures are a statewide result. See the "How to read these
figures" section on the site.

## Local preview

Open `index.html` directly — the data is embedded as scripts, so no server is
needed. Or:

```sh
python3 -m http.server 8080
```
