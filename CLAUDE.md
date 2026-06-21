# CLAUDE.md — OC5 (Node.js/Express frontend)

## Context

This is the Node.js rewrite of opencaching.de. Read the architecture doc first:
https://github.com/hxdimpf/OC/blob/dev-hx/docs/architecture.md

## Rules

1. **Templates:** Nunjucks files are DERIVED from OC4 Twig. Never edit .njk directly.
   Run `../oc/scripts/convert-twig.sh` to convert Twig → Nunjucks.
   Exception: `base.njk` is hand-maintained (Symfony constructs can't be auto-converted).

2. **After every change, run:** `../oc/scripts/test-deploy.sh oc5`

3. **Deploy:** Push to `dev-hx`. Server auto-pulls via Ansible or manual pull + `docker restart oc5-oc5-1`.

## Repos

| Repo | Path | Role |
|------|------|------|
| hxdimpf/OC | ~/src/oc | Playbook, scripts, docs |
| hxdimpf/oc5 | ~/src/oc5 | This repo — Node.js |
| hxdimpf/OC4 | ~/src/oc4 | PHP/Symfony — canonical Twig templates |
| hxdimpf/OC3 | ~/src/oc3 | Legacy PHP |

## Architecture

```
Express 5 → Nunjucks templates → pool.query(sql) → MariaDB
         → cookie auth (ocdevelopmentdata → sys_sessions)
```

- `app.js` — server, routes, i18n, Nunjucks filters (`format`, `number_format`, `range`)
- `src/db.js` — MariaDB connection pool
- `src/auth.js` — cookie → session validation
- `src/ocapi.js` — all SQL queries (~500 lines)
- `src/routes/` — 5 route modules (caches, user, search, index, geocode)
- `public/templates/nunjucks/` — 24 .njk templates (derived from OC4 Twig)
- `public/_frontend/` — git submodule (shared JS/CSS/vendor)

## Test server

SSH: `baiti@oc3.baiti.net`
Repo: `/opt/repos/oc5/` (mounted into container as `/app`)
Container: `oc5-oc5-1` (Node 22 Alpine, port 3000)
URL: http://oc5.baiti.net

NPM routes: oc5.baiti.net → oc5:3000
MariaDB: `db:3306`, user `oc`, password in `/opt/stacks/mariadb/docker-compose.yml`

## Image paths

Images at `/images/*` and `/_frontend/images/*` (fallback).
Copied from OC4's `public/images/`.
Favicon at `/favicon.ico`.
Architecture doc at `/docs/architecture.md`.
