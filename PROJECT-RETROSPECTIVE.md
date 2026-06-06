# Project Retrospective — opencaching.de Modernization

## 1. Legacy OC Codebase (Production)

**Status:** Running in production, end-of-life.

- PHP 8.2, bare `mysqli` queries, Smarty templates, jQuery
- 500K+ caches in production, active user base, OKAPI integration
- Works reliably but cannot evolve — PHP 8.4 breaks deprecated patterns,
  template engine is orphaned, no modern frontend architecture
- **Conclusion:** Must be replaced, cannot be incrementally upgraded

## 2. OC4 — The Symfony Tree (Dead on Arrival)

**Status:** Abandoned, zero production use.

A complete Symfony 7.x rewrite attempted by a previous team. The codebase
arrived with:

- Full Doctrine ORM stack — 33 Entity classes, 32 `ServiceEntityRepository`
  subclasses, `AbstractEntity`, annotation-based proxy system
- Symfony Security — firewall, authenticators, role hierarchy, voters
- Symfony Forms, Validator, Mailer, Serializer, Asset, Notifier, WebLink
- 27 Composer dependencies, 44 Repository files

**None of this was used.** Every database query was plain SQL via
`$this->connection->fetchAssociative('SELECT...')`. The ORM scaffolding
existed solely because Symfony tutorials said so. When we touched it, the
proxy system caused a production crash (`ServiceEntityRepositoryProxy`
initialization failure in prod mode).

The frontend was equally flawed — jQuery-based, monolithic, no module
system, hardcoded domains.

**Finding:** The Symfony tree was architecture for architecture's sake.
800+ lines of ORM boilerplate, 65 files of entity mapping, and the one
database operation that mattered was 12 characters: `$conn->fetchAssociative`.

## 3. feature/ui-refresh — Making OC4 Work

We took ownership of the Symfony tree and made it functional.

### Phase 1: Frontend Architecture (Completed)
- Replaced jQuery with vanilla ES modules (`loader.js` + page modules)
- Self-hosted all vendor assets (Leaflet, Bootstrap, Tabulator)
- CSS custom properties for theming (light/dark)
- Domain-driven via meta tag + `X-Forwarded-Proto` header
- **Result:** Modern, dependency-free frontend that works on every environment

### Phase 2: Backend Simplification (Completed)
- Moved 99 raw SQL calls from 7 controllers into Repository classes
- Converted all reads to `QueryBuilder` (Doctrine DBAL)
- Separated repositories by database table (cache_logs → CacheLogsRepository, etc.)
- Created `WaypointsRepository`, `CacheDescRepository` for new tables
- Added Entity classes to match project pattern (later removed — see Phase 3)
- **Result:** Clean separation — Controllers validate, Repositories query

### Phase 3: ORM Removal (Completed)
- Stripped `extends ServiceEntityRepository` from all 32 repos
- Stripped `extends AbstractEntity` from all 31 entities
- Deleted `AbstractEntity.php`
- Removed ORM config from `doctrine.php`
- Removed `doctrine/orm` from composer (later re-added — doctrine-bundle 2.20+ requires it as dep)
- Deleted 32 entity files — only `UserEntity` remained briefly
- **Result:** 65 files removed, zero ORM in the stack

### Phase 4: Symfony Security Removal (Completed)
- Replaced entire Symfony Security stack with 200-line `Auth` service
- Deleted `LoginFormAuthenticator`, `LegacyCookieAuthenticator`, `UserProvider`,
  `RoleHierarchyBuilder`, `UserVoter`, `RoleHierarchyFactory`
- Removed `symfony/security-bundle` from composer
- UserEntity deleted — auth returns plain arrays
- Login via POST, cookie reads legacy `ocdevelopmentdata` format
- **Result:** Auth is a single file. No firewall, no password encoder, no role hierarchy.

### Phase 5: Dependency Pruning (Completed)
- Removed 18 unused Composer packages
- Deleted 10 never-used Repository classes
- Config files cleaned (debug, assets, mailer, notifier, security)
- **Result:** 27 → 15 production dependencies

### Phase 6: Backoffice Rewrite (Completed)
- Rewrote RolesControllerBackoffice and SupportControllerBackoffice to plain Connection
- Deleted UserLoginBlockRepository
- Rewrote UserLoginBlockController, LoginFormAuthenticator login-block check
- **Result:** Backoffice uses the same DBAL pattern as App controllers

### Phase 7: User-Facing Pages (Working, Deployed to ocde)
- `/` — homepage with cache/log/user counts
- `/login` — login form, MD5 auth, cookie-based session
- `/livemap` — full Leaflet map with marker clustering, search, tracks
- `/caches` — search page with type filter
- `/cache/:wp` — full cache detail with logs, waypoints, attributes
- `/cache/new` — new cache form with coordinate picker, attribute selector
- `/user` — user search
- `/user/profile/:id` — user profile with stats

**Status:** Demo-ready. Deployed to ocde. 6/22 demo should work.

## 4. Test System — Ansible Provisioning

We built a 9-phase Ansible playbook that provisions a bare Debian 13 VM:

1. Base system (packages, PHP 8.2 + 8.4, Apache, MariaDB)
2. Directory layout + git clone
3. Database (schema, migrations, static data, stored procedures)
4. Legacy config (PHP 8.2 FPM, settings.inc.php)
5. Symfony config (PHP 8.4 FPM, .env.local, composer)
6. Apache vhosts (SSL certs, oc3 + oc4 domains)
7. Post-install scripts
8. Cron jobs
9. Test data import (from ocde dump)

**Problems encountered:**
- MariaDB 11.8 (Debian 13 default) breaks DEFAULT values on INSERT
- `--no-progress` flag not supported in this Composer version
- `composer install` fails when lock file references removed packages
- SSL certs: LE certs don't exist on intranet — need self-signed generation
- `composer.lock` staleness causes dependency resolution failures
- `TwigExtraBundle` removed from composer but still referenced in bundles.php

**Current state:** Playbook completes with 1 known failure (mod_evasive, harmless).
All 9 phases run. oc3 + oc4 respond. Test data populated.

**Assessment:** The playbook works but is fragile — any composer.json change
requires a corresponding playbook update. The architectural complexity of the
Symfony stack makes provisioning brittle. For the 6/22 demo, we use ocde
(development) as the demo environment. The test system is secondary.

## 5. OC5 — Node.js/Express Port

We started a from-scratch rewrite using modern technology:

- **Stack:** Node.js 22, Express 5, Nunjucks, MariaDB driver
- **Pattern:** Controller → QueryBuilder → Database (same as OKAPI)
- **Auth:** Hardcoded hxdimpf (170300) — no user management yet
- **Templates:** Ported from Symfony Twig to Nunjucks (same syntax)
- **Static assets:** Copied verbatim from Symfony (27 JS modules, vendor libs)
- **Database:** MariaDB with full ocde schema + test data

**Completed:**
- 9 route handlers (index, login, livemap, caches, search, user, waypoints, geocode)
- 9 Nunjucks templates (base, login, index, livemap, caches/search, caches/detail,
  caches/new, user/search, user/detailview)
- Full API response format port (UniCacheBuilder → JS transform)
- Map rendering (Leaflet + marker clustering)
- Local database with 18,805 caches imported from ocde
- Hover dropdowns, theme toggle, responsive navbar
- Deploy script for ocde + oc3

**Partial / In Progress:**
- Cache detail page — renders but missing some fields (icon states, additional
  waypoints rendering, attribute display). The JS modules are ported from Symfony
  but expect API response shapes that need further alignment.
- New cache form — renders but JS modules have DOM element mismatches (picker map,
  coordinate handling). The template is ported but needs JS-side fixes.
- Edit cache — partially works (data loads) but form submission and map picker
  need debugging.

**Assessment of OC5 viability:**
- The core architecture works — `pool.query()` with parameterized SQL is faster
  and simpler than Doctrine DBAL
- Templates port 1:1 from Twig with minimal syntax changes
- The 27 JS modules work unchanged — they're vanilla ES modules, no framework
- Database access is direct, no ORM, no entity mapping
- The remaining work is debugging — template syntax, API field names, DOM element IDs
- **OC5 is viable.** The foundation is solid. The remaining issues are labor-intensive
  but straightforward: align API response shapes, fix Nunjucks template syntax,
  ensure DOM element IDs match JS expectations.

## Conclusions

1. **The Symfony tree is over-engineered.** Doctrine ORM, Symfony Security,
   entity mapping — none of it was ever used. We removed 8,600 lines and the
   app works better.

2. **The OKAPI pattern is the right one.** Simple DB queries, plain arrays,
   minimal framework. OC5 proves this can be done in Node.js too.

3. **The database is the real asset.** 500K+ caches in production, years of logs,
   complex schema with triggers and stored procedures. Nothing we do
   should break this.

4. **Test system provisioning is fragile with the Symfony stack.** Each
   dependency change cascades into playbook updates. A simpler app (OC5)
   would provision in minutes, not hours.

5. **OC5 is worth continuing.** The broken parts are debug issues, not
   architectural problems. The foundation — Express routing, Nunjucks
   templates, MariaDB driver, vanilla ES modules — is solid.
