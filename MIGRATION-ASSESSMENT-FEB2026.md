# OpenCaching.de — Technology Migration Feasibility Assessment

**Date:** 2026-02-10
**Scope:** Analysis of `oc-server3` codebase for potential migration to Node.js / Next.js

---

## 1. Project Overview

OpenCaching.de is a German geocaching platform — an open-source alternative to geocaching.com. The codebase (`oc-server3`) is a mature PHP application that has been in active development for many years. It is currently undergoing an internal migration from a legacy procedural architecture (OC3) to a modern Symfony-based architecture (OC4), with both systems coexisting in the same repository.

**License:** GNU GPL

---

## 2. Codebase Metrics

| Metric | Value |
|--------|-------|
| Custom PHP files | ~2,186 |
| Total lines of code (custom) | ~344,000 |
| Legacy app (htdocs) | 1,247 files / ~177,000 LOC |
| Symfony app (htdocs_symfony) | 939 files / ~167,000 LOC |
| Database tables | 119 |
| Stored procedures / triggers / functions | 123+ |
| Smarty templates (legacy) | 136 |
| Twig templates (modern) | 38 |
| Doctrine ORM entities | 35+ |
| Cron job modules | 18+ |
| User-facing page endpoints | 40+ |
| Search export formats | 8 |

---

## 3. Technology Stack

### 3.1 Backend

| Component | Legacy (OC3) | Modern (OC4) |
|-----------|-------------|--------------|
| Framework | Symfony 4.4 | Symfony 5.4 |
| PHP version | 7.4 | 7.4 |
| Templating | Smarty 4.0 | Twig 2.12+ |
| ORM | Custom `sql()` + Doctrine DBAL | Doctrine ORM 2.7+ |
| Routing | File-based (URL = PHP file) | Annotation-based controllers |
| Auth | Custom cookie-based sessions | Symfony Security Bundle |
| Email | SwiftMailer 3.4 | Symfony Mailer |
| Logging | Custom | Monolog |
| Error tracking | Sentry 1.7–3.0 | Sentry |

### 3.2 Database

- **Engine:** MariaDB 10.1, MyISAM (primary)
- **Access patterns:**
  - Legacy: procedural `sql()`, `sql_value()`, `sql_fetch_assoc()` functions via MySQLi
  - Modern: Doctrine DBAL query builder + Doctrine ORM entities/repositories
- **Replication:** Custom master/slave replication with `sql_slave()` functions
- **Triggers/procedures:** 123+ stored objects encoding business logic in the database
- **Session variables:** Complex trigger state managed via MySQL `@variables` (e.g., `@dont_update_listingdate`, `@deleting_cache`, `@XMLSYNC`)

### 3.3 Frontend

| Component | Technology |
|-----------|-----------|
| CSS framework | Bootstrap 4.1+ / 5.3 |
| JavaScript | jQuery 3.2+ / 3.7 (no SPA framework) |
| Maps | Google Maps API |
| Rich text editor | TinyMCE |
| Cookie consent | Klaro |
| Build tool | Webpack 5.88 / Symfony Encore |
| CSS preprocessing | SCSS / Sass |
| Transpilation | Babel 7 |

### 3.4 Infrastructure & DevOps

| Component | Technology |
|-----------|-----------|
| Web server | Apache with mod_rewrite |
| Containerization | Docker (docker-compose) |
| VM option | Vagrant (CentOS 7.1) |
| CI/CD | Travis CI, Scrutinizer, Codecov |
| Translations | Crowdin integration |
| Testing | PHPUnit 6–9, Behat (BDD) |
| Code style | PHP CS Fixer (PSR-2) |
| Deployment | PSH (Platformsh Shell) |

---

## 4. Architecture Analysis

### 4.1 Dual Application Architecture

The repository contains two coexisting applications:

```
oc-server3/
├── htdocs/                 # OC3 — Legacy application
│   ├── index.php           #   File-based routing entry point
│   ├── viewcache.php       #   Direct PHP page files (~40+)
│   ├── lib2/               #   Legacy libraries & logic classes
│   ├── templates2/         #   Smarty templates (136 files)
│   ├── src/Oc/             #   PSR-4 namespaced code (partial modernization)
│   ├── app/                #   Symfony 4.4 kernel + bundles
│   ├── okapi/              #   OpenCaching API (third-party standard)
│   ├── api/                #   Legacy API endpoints
│   └── util2/cron/         #   Cron job modules (18+)
│
├── htdocs_symfony/          # OC4 — Modern Symfony 5.4 application
│   ├── public/index.php    #   Symfony front controller
│   ├── src/                #   Full MVC (controllers, entities, services)
│   ├── config/             #   Symfony YAML configuration
│   ├── templates/          #   Twig templates (38 files)
│   ├── migrations/         #   Doctrine migrations (9 files)
│   ├── assets/             #   Frontend assets (JS/SCSS)
│   └── tests/              #   Test suite
│
└── sql/                     # Database schema & data
    ├── tables/             #   119 table definitions
    ├── static-data/        #   46 reference data sets
    └── stored-proc/        #   Stored procedures, triggers, functions
```

Apache virtual hosts serve them on separate subdomains:
- `docker.team-opencaching.de` → htdocs (OC3)
- `try.docker.team-opencaching.de` → htdocs_symfony (OC4)

### 4.2 Database Schema Complexity

**119 tables** organized into these domains:

| Domain | Key Tables | Notes |
|--------|-----------|-------|
| **Caches** | `caches`, `cache_desc`, `cache_coordinates`, `cache_attributes`, `cache_status` | Core geocache data |
| **Logs** | `cache_logs`, `cache_logs_archived`, `cache_logs_restored`, `cache_logs_modified` | Full audit trail |
| **Users** | `user`, `user_options`, `user_statpic`, `user_delegates` | Accounts & permissions |
| **Watch/Notify** | `cache_watches`, `cache_list_watches`, `watches_waiting`, `watches_notified` | Notification system |
| **Geographic** | `cache_location`, `geodb_coordinates`, `geodb_locations`, `geodb_hierarchies` | Spatial data & GIS |
| **Replication** | `replication`, `sys_repl_slaves`, `sys_repl_exclude` | Multi-node sync |
| **Search** | `search_index`, `search_index_times`, `search_doubles` | Full-text search index |
| **GeoKrety** | `gk_item`, `gk_move`, `gk_user` | Trackable item system |
| **Statistics** | `stat_caches`, `stat_cache_logs`, `stat_user`, `statpics` | Pre-computed stats |
| **System** | `sys_cron`, `sys_sessions`, `sysconfig`, `sys_trans` | System config & i18n |

**Key complexity factors:**
- Denormalized `*_modified` tables for change tracking (6+ tables)
- Custom full-text search index (not using MySQL FULLTEXT)
- GeoKrety integration as a separate sub-schema
- Multi-language support via `sys_trans_text_*` tables
- Pre-computed statistics tables updated by cron

### 4.3 Stored Procedures & Triggers

123+ database-level objects that encode critical business logic:

- **UUID generation** on INSERT for key tables
- **Timestamp management** — automatic `date_created` / `listing_last_modified`
- **Cascading updates** — denormalized field sync across tables
- **Statistics updates** — trigger-based counter maintenance
- **Delete safety** — `@allowdelete`, `@fastdelete` session variables prevent accidental deletion
- **Replication flags** — `@XMLSYNC` controls cross-node synchronization behavior
- **Recursion prevention** — `@dont_update_listingdate`, `@dont_update_logdate`

These triggers represent a significant portion of the application's business logic that lives *outside* the PHP codebase.

### 4.4 Authentication & Authorization

**Legacy system** (`lib2/login.class.php`):
- Cookie-based sessions with configurable timeouts (1h default, 90d permanent)
- Brute-force protection via login attempt counting
- Admin privilege levels (`ADMIN_RESTORE`, etc.)
- Properties: `userid`, `username`, `admin`, `verified`

**Symfony system** (`src/Security/LoginFormAuthenticator.php`):
- Symfony Security Bundle with `AbstractLoginFormAuthenticator`
- CSRF token validation
- Password hashing via `UserPasswordHasherInterface`
- "Remember me" support
- Voter-based authorization (`UserVoter.php`)
- Role hierarchy factory (`RoleHierarchyFactory.php`)

### 4.5 Background Processing

18+ cron modules executed via `/htdocs/util2/cron/runcron.php` (runs every minute):

| Module | Purpose |
|--------|---------|
| `publish_caches` | Publish scheduled caches at their activation date |
| `autoarchive_caches` | Auto-archive caches after configured inactivity |
| `cache_waypoint_pool` | Generate and manage waypoint ID pools |
| `cache_location` | Reverse-geocode cache coordinates to locations |
| `cache_npa_areas` | Check caches against nature protection areas |
| `geokrety` | Sync trackable items with GeoKrety.org |
| `search_index` | Rebuild full-text search index |
| `rating_tops` | Recalculate top-rated cache rankings |
| `sitemaps` | Generate XML sitemaps for SEO |
| `picture_cleanup` | Remove orphaned uploaded images |
| `purge_logs` | Archive old log entries |
| `user_delete` | Process GDPR user deletion requests |
| `replicate` | Data replication to slave nodes |
| `replication_monitor` | Monitor replication health |
| `cleanup_temptables` | Purge temporary database tables |
| `orphan_cleanup` | Clean orphaned database records |
| `slave_cleanup` | Maintain slave database consistency |
| `push_waypoint_reports` | Push waypoint status updates |

### 4.6 External Integrations

| Integration | Type | Notes |
|-------------|------|-------|
| **OKAPI** | REST API (OAuth) | Standardized OpenCaching API used by third-party apps; PHP library from `opencaching/okapi` |
| **Google Maps** | JavaScript API | Interactive maps with markers, info windows, search |
| **GeoKrety.org** | XML data sync | Trackable item synchronization via cron |
| **Sentry** | Error tracking | Production error monitoring |
| **Crowdin** | Translation mgmt | Community translation workflow |

### 4.7 Search & Export

The search system (`search.php`) supports:

**Filters:** location (zip, coordinates, distance), cache name, owner, finder, waypoint ID, full-text, cache type, difficulty/terrain, status

**Export formats:**
| Format | Use Case |
|--------|----------|
| HTML | Web display |
| GPX | GPS devices & apps |
| KML | Google Earth |
| LOC | Legacy GPS format |
| OV2 | TomTom POI format |
| OVL | Top50 overlay format |
| XML | Machine-readable |
| TXT | Plain text |

---

## 5. Feature Inventory

### 5.1 Core Geocaching Features
- Cache creation, editing, and lifecycle management (publish → active → needs maintenance → archived)
- Cache types: Traditional, Multi, Mystery/Puzzle, Event, Virtual, Webcam, etc.
- Difficulty and terrain ratings (5-point scale)
- Cache attributes system
- Child waypoints (puzzle coordinates, parking, final location)
- Cache adoption (transfer ownership)

### 5.2 Logging & Tracking
- Log entry creation, editing, deletion
- Log types: Found, Not Found, Note, Will Attend, Attended, etc.
- Log photo uploads
- Field Notes import (GPX format from GPS devices)
- Full audit trail with archived/restored log tracking

### 5.3 User Features
- Registration, email verification, login
- User profiles with statistics
- Statistics picture generation
- Watch lists (notifications on cache updates)
- Ignore lists
- Recommendation system
- Top-5 caches selection
- Cache lists (user-curated collections)

### 5.4 Discovery & Maps
- Advanced multi-criteria search
- Interactive Google Maps with cache markers
- Static map generation
- Distance-based search
- Coordinate tools (format conversion)
- 8 export formats for GPS devices

### 5.5 Community & Administration
- Cache reporting system
- Admin panel (user management, cache moderation, reports, history)
- Site-wide statistics and leaderboards
- Articles and static pages (CMS-like)
- Multi-language support (11+ languages)

### 5.6 Background Services
- Scheduled cache publishing
- Auto-archiving of inactive caches
- Search index maintenance
- Statistics recalculation
- Image cleanup
- GeoKrety synchronization
- Database replication
- Sitemap generation
- GDPR user deletion processing

---

## 6. Migration Feasibility Assessment

### 6.1 Complexity Rating by Component

| Component | Complexity | Migration Difficulty | Notes |
|-----------|-----------|---------------------|-------|
| Database schema | Very High | Very High | 119 tables, 123+ triggers, replication |
| Stored procedures/triggers | Very High | Very High | Business logic in DB layer |
| Legacy PHP business logic | High | High | 177K LOC, procedural + OOP mix |
| Symfony OC4 code | Medium | Medium | 167K LOC, already well-structured |
| Authentication/authorization | Medium | Medium | Dual systems, role hierarchy |
| Search & export | High | High | 8 formats, custom search index |
| Maps integration | Medium | Low | Standard Google Maps API usage |
| Cron/background jobs | High | Medium | 18 modules, well-isolated |
| OKAPI | Very High | Very High | Third-party standard, OAuth, shared across OC sites |
| Frontend (HTML/CSS/JS) | Moderate | Low–Medium | jQuery + Bootstrap, no SPA |
| Email/notifications | Low | Low | Standard templated emails |
| Image/file handling | Low | Low | Standard upload + GD processing |
| i18n/translations | Medium | Low | Crowdin-managed, string-based |

### 6.2 Key Risk Factors

1. **Database triggers encode business logic** — 123+ stored procedures, functions, and triggers manage UUID generation, cascading updates, statistics maintenance, and deletion safety. Migrating these to application code is error-prone and requires exhaustive testing.

2. **OKAPI is a cross-site standard** — The OpenCaching API is used by multiple national OpenCaching sites and third-party apps. It's a PHP library with its own OAuth implementation. Reimplementing it in Node.js would require coordination with the international OC community.

3. **Replication architecture** — The custom master/slave replication system with XML sync is deeply integrated into the database layer and cron jobs. This would need a complete redesign.

4. **Niche export formats** — OV2 (TomTom) and OVL (Top50) are niche binary formats. Node.js libraries for these are scarce or nonexistent.

5. **Internal migration already underway** — The OC3→OC4 Symfony migration represents significant investment. Switching platforms would abandon ~167K LOC of modern Symfony code.

6. **Volunteer team** — As an open-source community project, developer availability is limited. A full rewrite requires sustained multi-year commitment.

---

## 7. Migration Strategy Options

### Option A: Complete the Symfony Migration (Recommended)

**Approach:** Finish the OC3 → OC4 migration within the PHP/Symfony ecosystem.

**Steps:**
1. Upgrade to Symfony 6.4 LTS or 7.x with PHP 8.2+
2. Migrate remaining 136 Smarty templates to Twig
3. Replace all legacy `sql()` calls with Doctrine ORM/DBAL
4. Move stored procedure logic into PHP/Doctrine event listeners
5. Modernize frontend with Symfony UX (Stimulus + Turbo / Hotwire)
6. Build REST API using API Platform for future frontend flexibility
7. Replace Google Maps with Leaflet + OpenStreetMap

**Pros:**
- Lowest risk — continues existing work
- Team already has PHP/Symfony skills
- OKAPI remains compatible
- Incremental — no "big bang" cutover
- Symfony ecosystem is mature and well-supported

**Cons:**
- Still PHP — doesn't achieve a full platform change
- Symfony UX/Turbo is less mature than React/Next.js ecosystem
- May not attract new developers who prefer JavaScript

**Effort:** Medium (2–3 years at current pace)
**Risk:** Low

---

### Option B: Hybrid — PHP Backend + Next.js Frontend

**Approach:** Keep the PHP/Symfony backend as an API, build a new Next.js frontend.

**Steps:**
1. Build a REST or GraphQL API layer on the existing Symfony backend (API Platform)
2. Create a Next.js frontend application consuming the API
3. Use a reverse proxy (nginx) to route between old and new frontends
4. Migrate pages incrementally: start with read-only pages (cache view, search results, maps)
5. Progress to interactive pages (logging, cache editing, admin)
6. Eventually retire the Smarty/Twig server-rendered frontend

**Architecture:**
```
                        ┌─────────────────┐
    Browser ──────────► │  nginx / proxy   │
                        └────────┬────────┘
                           ┌─────┴─────┐
                           │           │
                    ┌──────▼──┐  ┌─────▼──────┐
                    │ Next.js │  │  PHP/Symfony │
                    │ (new)   │  │  (legacy)    │
                    └────┬────┘  └──────┬──────┘
                         │              │
                         └──────┬───────┘
                          ┌─────▼─────┐
                          │  REST API  │
                          │ (Symfony)  │
                          └─────┬─────┘
                          ┌─────▼─────┐
                          │  MariaDB   │
                          └───────────┘
```

**Pros:**
- Modern React/Next.js frontend with SSR, TypeScript, component model
- Backend business logic and database layer remain stable
- OKAPI unaffected
- Incremental migration — old and new coexist
- API layer benefits mobile apps and third-party integrations
- Attractive to JavaScript developers

**Cons:**
- Two technology stacks to maintain during transition
- API layer must be comprehensive before frontend can be fully migrated
- Increased infrastructure complexity (two runtimes)
- Team needs both PHP and JavaScript expertise

**Effort:** High (2–3 years)
**Risk:** Medium

---

### Option C: Full Rewrite to Node.js / Next.js

**Approach:** Rebuild the entire application from scratch in JavaScript/TypeScript.

**Technology mapping:**

| Current | Replacement |
|---------|------------|
| PHP 7.4 | Node.js 20+ / TypeScript |
| Symfony 5.4 | Next.js 14+ (App Router) |
| Doctrine ORM | Prisma or Drizzle ORM |
| MariaDB | MariaDB (keep) or PostgreSQL (with PostGIS) |
| Smarty/Twig | React (JSX/TSX) |
| Symfony Security | NextAuth.js or Lucia |
| SwiftMailer | Nodemailer or Resend |
| Cron jobs | BullMQ + Redis |
| OKAPI | Full reimplementation required |
| Google Maps | Leaflet + OpenStreetMap / Mapbox |
| Full-text search | Meilisearch or Elasticsearch |
| GD image processing | Sharp |
| GPX/KML export | Node.js XML libraries |
| OV2/OVL export | Custom implementation needed |

**Pros:**
- Clean slate — modern architecture from day one
- Single language (TypeScript) across full stack
- Better developer tooling and ecosystem
- Potential for real-time features (WebSockets native to Node)
- Easier to attract new contributors
- Could adopt PostGIS for native spatial queries

**Cons:**
- **Very high risk** — rewriting 344K LOC is historically prone to failure
- **Multi-year effort** with no new features during transition
- **OKAPI must be fully reimplemented** or kept as a separate PHP service
- **123+ database triggers** must be moved to application code
- **Replication system** needs complete redesign
- **Niche format support** (OV2, OVL) has no Node.js ecosystem
- **No guarantee of feature parity** — edge cases will be missed
- Requires sustained team of 3–5 full-time developers

**Effort:** Very High (3–5 years)
**Risk:** Very High

---

## 8. Recommendation

### Primary Recommendation: Option A (Continue Symfony Migration)

The most pragmatic path is to **complete the existing OC3 → OC4 Symfony migration**, upgrading to modern PHP 8.x and Symfony 7.x. The work is already partially done, the team has PHP expertise, and the risk is minimal. The Symfony ecosystem with Turbo/Stimulus provides a surprisingly modern UX without the cost of a platform change.

### Secondary Recommendation: Option B (Hybrid) — If Frontend Modernization is the Priority

If the primary motivation is a modern, React-based frontend experience, the **hybrid approach** (PHP API backend + Next.js frontend) offers the best risk/reward ratio. It preserves all backend business logic and database architecture while enabling a modern frontend. This also creates an API layer that benefits mobile apps and third-party integrations.

### Not Recommended: Option C (Full Rewrite)

A full rewrite to Node.js/Next.js is **not recommended** for this project given its size (344K LOC), complexity (119 tables, 123+ triggers, OKAPI), and volunteer team structure. The history of software engineering is littered with failed full rewrites of working systems.

---

## 9. Quick Wins (Regardless of Strategy)

These improvements can be made immediately, independent of migration strategy:

1. **Upgrade PHP to 8.2+** — PHP 7.4 is end-of-life
2. **Replace Google Maps with Leaflet + OpenStreetMap** — removes API key dependency and cost
3. **Add TypeScript to frontend JS** — incremental adoption via `tsconfig.json` with `allowJs`
4. **Replace custom search index with Meilisearch** — better performance, less maintenance
5. **Move stored procedure logic to PHP** — reduce database coupling
6. **Add API Platform** — generate a REST API from Doctrine entities with minimal code
7. **Containerize for production** — standardize deployment with Docker
8. **Upgrade MariaDB** — 10.1 is EOL; upgrade to 10.11+ or 11.x

---

*This assessment is based on static analysis of the codebase. Runtime behavior, performance characteristics, and user traffic patterns were not analyzed.*
