# WxTiles Explorer (Modern Rebuild)

This workspace is a modernized rebuild of the public WxTiles Leaflet demo:
https://metoceanapi.github.io/wxtiles-leaflet/

## What this includes

- Leaflet basemap with weather overlay support via `@metoceanapi/wxtiles-leaflet`
- A redesigned, responsive interface with modern typography and controls
- Dataset, variable, and optional time-step controls
- Live cursor longitude/latitude readout

## Run locally

This is a static site, so you can open `index.html` directly, or serve the folder with any static server.

Example using Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` (portal landing page).

- Main explorer: `http://localhost:8080/main/`
- Main explorer extended: `http://localhost:8080/main-extended/`
- Threshold explorer: `http://localhost:8080/threshold/`
- Compare explorer: `http://localhost:8080/compare/`

## Publish online (GitHub Pages)

This repo now includes a Pages deployment workflow at `.github/workflows/deploy-pages.yml`.

1. Create a GitHub repository for this folder (or use your existing one).
2. Push this project to the `main` branch.
3. In GitHub, go to **Settings -> Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. The workflow **Deploy Static Site to GitHub Pages** will publish on every push to `main`.

After deployment, your URLs will be:

- Portal landing: `https://<your-user-or-org>.github.io/<repo>/`
- Main explorer: `https://<your-user-or-org>.github.io/<repo>/main/`
- Main explorer extended: `https://<your-user-or-org>.github.io/<repo>/main-extended/`
- Threshold explorer: `https://<your-user-or-org>.github.io/<repo>/threshold/`
- Compare explorer: `https://<your-user-or-org>.github.io/<repo>/compare/`

This keeps your local version unchanged while making an online version available.

## Notes

- The weather layer uses `https://tiles.metoceanapi.com/data/`.
- If your environment requires an API key, update `main.js` and pass custom request headers to `WxAPI`.

## GPX Route Analysis Workbook Tool

This workspace includes a standalone GPX route analysis and POI enrichment tool that creates a print-ready `.xlsx` workbook for bikepacking, touring, and hiking route logistics.

### Install dependencies

```bash
pip install -r tools/requirements-gpx.txt
```

### Generate workbook

```bash
python tools/gpx_poi_workbook_tool.py path/to/route.gpx -o route_poi_workbook.xlsx --enrich --nominatim-email you@example.com
```

Optional Google Places enrichment:

```bash
python tools/gpx_poi_workbook_tool.py path/to/route.gpx -o route_poi_workbook.xlsx --enrich --google-places-key <YOUR_KEY>
```

### Workbook sheets

- `Route Summary`
- `POI Master Table`
- `Daily Planning View`
- `Research Sources`

### What is calculated

- Cumulative distance along the GPX route geometry.
- Distance between POIs in route order.
- Elevation gain/loss between POI segments from track profile.
- POI snapping to nearest route position.

### Formatting and print features

- Auto-filter on all sheet tables.
- Frozen header rows.
- Auto-sized columns.
- Conditional formatting for Food, Accommodation, Water, Medical, and Emergency categories.
- Landscape layout with repeating header rows for print.

If a field cannot be verified from available sources, the tool leaves it blank and records uncertainty in notes/source sheets.
