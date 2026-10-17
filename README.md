# Skopje Circular

A bilingual (Macedonian / English) concept demo for verified recycling points and a proposed circular materials-to-energy system in Skopje, North Macedonia.

**This is not a collection service.** The interest form gauges participation in a possible future pilot; it does not request or schedule a pickup. Company flows, quantities, robots, vehicles and facilities are illustrative only. Real recycling locations must be individually verified and attributed before they are published.

## Local setup

Requirements: Node.js 20.9 or newer and a Supabase project.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and anon key.
3. Apply the files in `supabase/migrations/` in filename order in the Supabase SQL editor.
4. Add location records only after checking the accepted materials and the source's reuse terms. The schema restricts records to `municipality = 'Skopje'`; a record is public only when `is_verified` is true. `last_checked_at` is shown to residents and points older than 45 days are marked stale.
5. Create approved host accounts in Supabase Auth (disable public signups). Add each approved user's UUID to `public.host_users` from the Supabase SQL editor. Example: `insert into public.host_users (user_id) values ('AUTH-USER-UUID');`.
6. Set a long random `CRON_SECRET` as a server-only Vercel Production environment variable. The cleanup route uses the public anon key with a database policy that only permits deletion of unreviewed signups older than six months; it does not need a service-role key.
7. Run `npm run dev` and open `http://localhost:3000`.

## Location source

`GET /api/locations` reads verified records from `collection_locations`. The optional read-only Pakomak ArcGIS connector is disabled unless `PAKOMAK_CONNECTOR_ENABLED=true`; keep it disabled until permission and reuse terms are confirmed. The connector requests only location/material fields, filters to Skopje coordinates and accepted material names, and does not request fullness measurements. If it is unavailable, the map links residents to Pakomak's source map. Do not bulk-copy or redistribute source data without confirming terms.

The map uses OpenStreetMap tiles and displays contributor attribution. Use a tile endpoint that permits your traffic, follow its caching rules, and update `NEXT_PUBLIC_MAP_TILE_URL` and the attribution component if changing providers. The public OSM standard tile endpoint is not a production CDN.

## Smart-bin map data

The `/map` page reads the bin list from `public/bins.json`. The supplied dataset currently contains 962 bin records across 400 station IDs. Add one object per bin using this shape:

```json
[
  {
    "id": "unique-bin-id",
    "stationId": "station-0",
    "type": "paper",
    "fill": "half",
    "road": "Example Street",
    "lat": 41.9981,
    "lon": 21.4254,
    "updatedAt": "2026-10-17T10:00:00Z"
  }
]
```

Supported types are `paper`, `plastic` and `glass`; fullness values are `empty`, `half` and `full`. Coordinates must be in the Skopje area. Bins sharing a `stationId` are spaced slightly on the map so their markers can be tapped separately; route calculations still use the supplied coordinates. This JSON is a static snapshot. The browser map can report a new fill level, but those reports are stored only in that browser's local storage and do not update `bins.json`, a shared database, or a sensor. Connect a server endpoint before treating resident reports as shared operational data. Walking routes request a route from the public OSM-Germany foot-routing service; its availability and request limits are outside this project's control.

## Supabase privacy and retention

- Anonymous residents can insert consented interest records but have no `SELECT` policy or grant.
- Authenticated users are still denied signup access unless listed in `host_users`.
- Host signups are read only through row-level policies; the one-time contact action uses a checked database function.
- The form never requests a street address. Host deletion is available on the private screen.
- The daily `/api/cleanup` cron deletes only unreviewed rows older than six months. Vercel supplies `Authorization: Bearer $CRON_SECRET`; the route rejects requests without it.
- The database permits the anon role to delete only unreviewed rows older than six months; it cannot read or delete other signup records.

## Vercel deployment

The connected GitHub repository deploys pushes to `main` to Production and other branches to Preview. The daily cron runs in UTC and requires a plan that supports the configured frequency. Keep `CRON_SECRET` in the Production environment only; do not commit it. Use a separate Supabase project for Preview data where practical.

Before accepting real public signups, add a named data controller and privacy contact, a way for residents to withdraw consent or request deletion, and provider-backed abuse/rate controls for the public form. The honeypot and validation here are baseline demo protections, not a complete anti-abuse system. Confirm local privacy requirements and the production data region with the project owner.

## Demo sections

- `/map` — verified Skopje recycling locations with material filters, source attribution and freshness.
- `/join` — bilingual future-pilot interest form (no booking or address field).
- `/workflow` — synthetic, clickable collection / sorting / recycling / residual-energy / heating flow.
- `/economics` — potential value, costs, international examples and research links; no unsupported Skopje ROI estimate.
- `/host` — private host sign-in and one-time contact / delete workflow.

## Research references

- [Pakomak container map and ArcGIS layer](https://maps.pakomak.mk/arcgis/rest/services/PAKOMAK/garbage_containers_dashboard/MapServer/1)
- [EEA: North Macedonia waste generation](https://www.eea.europa.eu/en/europe-environment-2025/countries/north-macedonia/waste-generation)
- [European Commission: North Macedonia 2025 report](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52025SC0753)
- [OECD: waste management and circular economy review](https://www.oecd.org/en/publications/waste-management-and-the-circular-economy-in-selected-oecd-countries_9789264309395-en/full-report/component-6.html)
- [UN North Macedonia: district-heating context](https://northmacedonia.un.org/sites/default/files/2026-05/UNMK%20ARR%202025_final_0.pdf)
- [ARC Amager Bakke, Copenhagen](https://a-r-c.dk/amager-bakke/)
- [Stockholm Exergi, Högdalenverket](https://www.stockholmexergi.se/om-stockholm-exergi/vara-anlaggningar/hogdalenverket/)
- [Wien Energie waste treatment](https://www.wienenergie.at/ueber-uns/unternehmen/energie-klimaschutz/energieerzeugung/abfallverwertungsanlagen/)
- [Seoul sewage-heat district-heating project](https://english.seoul.go.kr/operation-koreas-largest-sewage-heat-based-heating-supply-facility/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Supabase Next.js and RLS quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/quickstart)

## License

Apache-2.0. See [LICENSE](./LICENSE).
