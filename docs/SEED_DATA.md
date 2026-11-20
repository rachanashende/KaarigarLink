# KaarigarLink Seed Data

Demo and test dataset for the backend. The source of truth is [`backend/prisma/seed/data.ts`](../backend/prisma/seed/data.ts).

## Running it

```powershell
cd backend
# 1. Add to backend/.env (never commit it; share it with teammates privately):
#    SEED_DEFAULT_PASSWORD="your-demo-password"
# 2. Seed (safe to run again at any time):
npm run db:seed
```

All seed accounts log in with `SEED_DEFAULT_PASSWORD`, for example `POST /api/auth/login { "email": "asha.rao@kaarigarlink.test", "password": "<SEED_DEFAULT_PASSWORD>" }`.

### Guarantees
| | |
|---|---|
| **Repeatable** | Fixed ids (`seed-…`). Re-running updates in place, creates no duplicates, and keeps ids stable. |
| **Resets to a known state** | Re-running restores seed records changed during a demo, removes machines, capabilities and capacity windows added to seed workshops, and **deletes invitations on seed jobs**, which returns them to `OPEN`/`DRAFT`. |
| **Never touches real data** | Only records with ids starting `seed-` are written. If a real account already uses a seed email, the seed aborts and **changes nothing**. |
| **All or nothing** | The whole seed runs in one transaction. |
| **Passwords** | Hashed with bcrypt, the same library and `BCRYPT_SALT_ROUNDS` as registration. No plaintext is stored or committed. |
| **Production** | Refuses when `NODE_ENV=production` unless `SEED_ALLOW_PRODUCTION=true` (for a demo deployment only). |
| **Dates** | Relative to the UTC day you run the seed: "day 30" means 30 days from today. **Re-seed before a demo** so deadlines and capacity windows are fresh. |

## Accounts (18)

| Role | Name | Email |
|---|---|---|
| ADMIN | Kavita Deshpande | `admin@kaarigarlink.test` |
| INSPECTOR | Priya Nair | `priya.inspector@kaarigarlink.test` |
| BUYER | Asha Rao | `asha.rao@kaarigarlink.test` |
| BUYER | Vikram Mehta | `vikram.mehta@kaarigarlink.test` |
| BUYER | Neha Kulkarni | `neha.kulkarni@kaarigarlink.test` |
| BUYER | Arjun Iyer | `arjun.iyer@kaarigarlink.test` |
| WORKSHOP | one owner per workshop | `<workshop-slug>@kaarigarlink.test`, e.g. `precision-works@kaarigarlink.test` |

## Workshops (12)

Capacity is available from day 0 unless noted.

| Id (`seed-ws-…`) | City | Status | Rating | Certifications | Capabilities (materials) | Machines | Capacity | What it's for |
|---|---|---|---|---|---|---|---|---|
| `precision-works` | Pune (Bhosari) | VERIFIED | 4.8 | ISO_9001, AS9100 | CNC_MACHINING (aluminium, mild/stainless steel, brass; ±0.01 mm), LATHE_TURNING | 3 CNC mills, 2 CNC lathes | 2000 units, days 0–45 | Strong all-rounder near Pune |
| `chakan-cnc` | Pune (Chakan) | VERIFIED | 4.2 | none | CNC_MACHINING (aluminium, mild steel; ±0.05) | 2 CNC mills | 1200, days 0–40 | **Lacks certification** |
| `mumbai-metalcraft` | Mumbai | VERIFIED | 4.6 | ISO_9001 | CNC_MACHINING (±0.02), LASER_CUTTING, SHEET_METAL_FABRICATION | CNC mill, laser cutter, press brake | 3000, days 0–60 | Far, multi-process |
| `nashik-small-batch` | Nashik | **PENDING** | 0 (new) | ISO_9001 | CNC_MACHINING (aluminium; ±0.05) | 1 CNC mill | **300**, days 0–30 | **Unverified, so always excluded**; also too little capacity for big jobs |
| `ahmedabad-polymers` | Ahmedabad | VERIFIED | 4.4 | ISO_9001, ISO_14001 | INJECTION_MOLDING (abs, polypropylene, nylon); **10-day lead time** | 4 moulders | 50,000, days 0–90 | **Lead time misses tight deadlines** |
| `bengaluru-additive` | Bengaluru | VERIFIED | 4.9 | AS9100 | THREE_D_PRINTING (nylon, abs, titanium, aluminium; max 300 mm) | 6 printers | 600, days 0–20 | Only 3D printer |
| `hadapsar-fabricators` | Pune (Hadapsar) | **REJECTED** | 3.0 | ISO_9001 | CNC_MACHINING (aluminium, mild steel) | 2 CNC mills | 5000, days 0–60 | Would qualify, but **rejected** |
| `coimbatore-castings` | Coimbatore | VERIFIED | 4.1 | ISO_9001 | CASTING (cast iron, aluminium; 14-day lead), LATHE_TURNING (cast iron, mild steel) | 2 furnaces, CNC lathe | 10,000, days 0–90 | **Very far** from Pune |
| `kothrud-precision` | Pune (Kothrud) | VERIFIED | 4.7 | ISO_9001 | CNC_MACHINING (±0.01) | mills in **MAINTENANCE**, lathe **OFFLINE** | 3000, days 0–60 | Close and well rated, but **no operational machine** |
| `pimpri-steelworks` | Pune (Pimpri) | VERIFIED | 3.8 | none | WELDING (mild/stainless steel), SHEET_METAL_FABRICATION (mild steel) | 5 welding stations, press brake | 800, days 0–30 | **No coordinates**: still eligible, distance omitted from its score |
| `delhi-precision` | New Delhi | VERIFIED | 4.5 | ISO_9001, AS9100 | CNC_MACHINING (±0.01) | 3 CNC mills | 5000, **days 50–80 only** | Meets every requirement **except capacity timing** |
| `talegaon-tooling` | Pune (Talegaon) | VERIFIED | 3.9 | ISO_9001 | CNC_MACHINING (aluminium, mild steel; ±0.03) | 2 CNC mills | 1500, days 0–35 | Close but lower rating (good for ranking) |

## Jobs (11) and expected matching results

Expected results assume matching runs on the seed day, using the rules in `data.ts`. They are the reference for the M7 matching tests.

| Id (`seed-job-…`) | Buyer | Process / material / qty | Deadline | Mandatory requirements | Expected eligible | Notable exclusions |
|---|---|---|---|---|---|---|
| `alu-brackets` | Asha (Hinjewadi) | CNC_MACHINING / aluminium / 500 | day 30 | CNC_MILL, tolerance 0.05, ISO_9001 | precision-works, talegaon-tooling, mumbai-metalcraft | chakan (no cert), nashik (capacity + not verified), hadapsar (rejected), kothrud (no operational machine), delhi (capacity window too late), bengaluru (no capability) |
| `titanium-drone` | Vikram (Bengaluru) | THREE_D_PRINTING / titanium / 200 | day 15 | AS9100, part size 250 | bengaluru-additive | — |
| `stainless-shafts` | Asha | CNC_MACHINING / stainless steel / 300 | day 25 | tolerance 0.01, AS9100 | precision-works | mumbai (tolerance and cert), delhi (capacity timing), chakan (material) |
| `pp-housings-urgent` | Neha (Mumbai) | INJECTION_MOLDING / polypropylene / 2000 | day 8 | — | **none** | ahmedabad (**deadline**: 10-day lead time) |
| `laser-panels` | Neha (Mumbai) | LASER_CUTTING / stainless steel / 600 | day 20 | LASER_CUTTER | mumbai-metalcraft | pimpri (no laser) |
| `welded-frames` | Arjun (Pune) | WELDING / mild steel / 200 | day 25 | — | pimpri-steelworks (**no workshop location**: eligible, scored on rating + capacity only) | — |
| `cast-iron-pumps` | Arjun (Chennai) | CASTING / cast iron / 3000 | day 50 | ISO_9001 | coimbatore-castings | — |
| `turned-fittings` | Asha | LATHE_TURNING / mild steel / 600 | day 20 | CNC_LATHE | precision-works, coimbatore-castings | — (large distance gap) |
| `enclosures-draft` | Vikram (Pune) | SHEET_METAL_FABRICATION / aluminium / 150 | day 30 | — | **none: job is DRAFT** | matching should refuse a DRAFT job |
| `nylon-gears-no-location` | Neha (**no location**) | THREE_D_PRINTING / nylon / 100 | day 12 | — | bengaluru-additive | — |
| `nashik-prototypes` | Arjun (Nashik) | CNC_MACHINING / aluminium / 100 | day 20 | — | precision-works, chakan-cnc, mumbai-metalcraft, talegaon-tooling | **nashik-small-batch (PENDING: nearest and meets every other rule, but not verified)**, hadapsar (rejected), kothrud (no operational machine), delhi (capacity timing) |

Matching rule: **only VERIFIED workshops are eligible** (PENDING and REJECTED are excluded). Missing coordinates never exclude; the distance is omitted from the score instead.

Scenario coverage: fully eligible workshops; missing capability, material, tolerance and machine; missing certification; insufficient capacity (quantity and timing); deadline too tight; unverified (PENDING) and rejected workshops; workshops and jobs without coordinates; distances from ~15 km to ~1,000 km; jobs with 0, 1, 2, 3 and 4 eligible workshops; a DRAFT job.
