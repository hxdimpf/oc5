---
marp: true
title: OC4 vs OC5 — Backend, Side by Side
paginate: true
---

<!-- Deck-wide styling: keep dense code/SQL slides inside the frame -->
<style>
section { font-size: 26px; }
pre { font-size: 16px; line-height: 1.25; margin: 0.4em 0; }
h1 { margin-bottom: 0.3em; }
</style>

# OC4 → OC5
## The same backend, in a different language

A walkthrough for the people who built **OC4 (PHP / Symfony)**
and are looking at **OC5 (Node.js / Express)** for the first time.

*Frontend is identical (the Nunjucks templates are generated from your Twig), so
this talk is **backend only**.*

🗣 *Talk track: "You already designed this architecture once, in OC4. OC5 is not a
new paradigm — it's your OC4 decisions transliterated into JavaScript. Today I'll
prove that by tracing one real request through both stacks, file by file."*

---

# The thesis (one sentence)

> **OC5 keeps every architectural decision you made in OC4 —
> no ORM, raw parameterised SQL, thin controllers, a JSON API the frontend calls —
> and changes only the host language and a few framework conventions.**

What's *different* is mostly **surface syntax** (attributes vs. a router,
a DI container vs. `import`). What's *the same* is **the shape of the app**.

🗣 *Talk track: "If you leave with one thing: the risk you're weighing is language
+ ecosystem, NOT a re-architecture. The structure you trust carries over."*

---

# 30,000 ft — the request lifecycle

```
OC4 (Symfony)                         OC5 (Express)
─────────────                         ─────────────
public/index.php   (front ctrl)       app.js            (composition root)
  → Kernel boots container              → middleware stack (cookies, body,
  → Routing matches #[Route]               auth, i18n locals)
  → Controller action                   → mounted Router matches path
  → Repositories (DBAL SQL)             → handler fn
  → Service shapes the data             → data fn (pool.query SQL)
  → Twig / JsonResponse                 → Nunjucks / res.json
```

Same five stops: **route → controller → data → shape → render.**

---

# The construct map

<style scoped>
section { font-size: 23px; }
table { font-size: 18px; line-height: 1.2; }
th, td { padding: 1px 10px; }
</style>

| Concern | OC4 — Symfony | OC5 — Express |
|---|---|---|
| Front controller | `public/index.php` + `Kernel` | `app.js` (composition root) |
| Routing | `#[Route('/cache/{wpID}')]` attribute | `router.get('/cache/:wp', detail)` |
| Route grouping | controller class | `express.Router()` per feature + `app.use()` |
| Controller | `CachesController extends AbstractController` | handler fns in `routes/caches.js` |
| Action | `public function detail(string $wpID): Response` | `export async function detail(req, res)` |
| Req / Res | `Request` / `Response` / `JsonResponse` | `req` / `res` (`res.render`, `res.json`) |
| Wiring | autowired constructor (`services.php`) | `import { … } from '…'` |
| Service layer | `UniCacheBuilder` service | data fn + returned object literal |
| Data access | `CachesRepository` (Doctrine **DBAL** QueryBuilder) | `ocGetCacheDetail` (`pool.query` raw SQL) |
| DB handle | injected `DBAL\Connection` | `pool` from `src/db.js` |
| Model | associative **arrays** (no ORM/entities) | plain **objects** (no ORM) |
| Auth | custom `Auth` service (cookie → session) | `auth` middleware → `req.user` |
| Templating | Twig `*.html.twig` | Nunjucks `*.njk` (generated from Twig) |

🗣 *Talk track: Pin this — every row is a 1:1 swap; the rest of the talk walks the left column with the right beside it.*

---

# The one flow we'll trace

### `GET /cache/OC18BB7` — open a cache listing

Why this one:
- It exists, identically, in both stacks.
- It touches **every layer once** — routing, controller, data, SQL, model, template.
- It's a GET, so we can demo it live in a browser.

We'll go layer by layer. **OC4 on the left, OC5 on the right.**

---

# Layer 1 — Routing

**OC4** — attribute on the controller method
`src/Controller/App/CachesController.php`
```php
#[Route('/cache/{wpID}', name: 'cache_by_wp_oc_gc')]
public function detail(string $wpID): Response { … }

#[Route('/api/cache/{wp}', name: 'api_cache_detail', methods: ['GET'])]
public function apiDetail(string $wp): JsonResponse { … }
```

**OC5** — one line in the feature router
`src/routes/caches.js`
```js
router.get('/cache/:wp',     detail);
router.get('/api/cache/:wp', get);
```
…mounted once in `app.js`: `app.use(cachesRoutes)`

🗣 *Talk track: "`{wpID}` becomes `:wp`. The attribute that lives ON the method
becomes a line that POINTS to the function. Same binding, different place."*

---

# Layer 2 — Controller (the HTML page)

**OC4** `CachesController::detail()`
```php
public function detail(string $wpID): Response
{
    return $this->render('app/caches/detail.html.twig',
        ['wp' => strtoupper($wpID)]);
}
```

**OC5** `routes/caches.js → detail`
```js
export async function detail(req, res) {
  const cache = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  res.render('caches/detail.njk',
    { wp: req.params.wp, cache, cache_json: cache ? JSON.stringify(cache) : null });
}
```

🗣 *Talk track: "`$this->render(...)` → `res.render(...)`. Thin handler either way.
(OC5 pre-loads the data here; OC4 leaves the page a shell and fetches via the API
endpoint. Same data function underneath — that's the next slide.)"*

---

# Layer 2b — Controller (the JSON API)

**OC4** `CachesController::apiDetail()` — gather + shape
```php
$cacheRow = $this->cachesRepository->fetchDetailByWp($wp);
$data = [
  'cache'      => $cacheRow,
  'desc'       => $this->cacheDescRepository->fetchDescription($cacheId, …),
  'waypoints'  => $this->waypointsRepository->fetchWaypoints($cacheId),
  'logs'       => $this->cacheLogsRepository->fetchLogsByCacheId($cacheId),
  …
];
return new JsonResponse($this->uniCacheBuilder->build($data, $context));
```

**OC5** `routes/caches.js → get`
```js
export async function get(req, res) {
  const data = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  if (!data) return res.status(404).json({ error: 'Cache not found' });
  res.json(data);
}
```

🗣 *Talk track: Same gather-then-build — OC5 just folds it into one data function.*

---

# Layer 3 — Data access (the heart)

**OC4** `CachesRepository::fetchDetailByWp()` — Doctrine **DBAL** QueryBuilder
```php
$this->connection->createQueryBuilder()
  ->select('c.cache_id', 'c.wp_oc', 'c.name',
           'c.difficulty / 2 AS difficulty', …)
  ->from('caches', 'c')
  ->join('c', 'cache_type', 'ct', 'c.type = ct.id')
  ->leftJoin('c', 'stat_caches', 'sc', 'c.cache_id = sc.cache_id')
  ->where('c.wp_oc = :wp')->setParameter('wp', $wp)
  ->executeQuery()->fetchAssociative();
```

**OC5** `ocGetCacheDetail()` — `pool.query` raw SQL
```js
export const ocGetCacheDetail = traced('ocGetCacheDetail', async (wp, userId) => {
  const [c] = await pool.query(
    `SELECT c.cache_id, c.wp_oc, c.name,
            c.difficulty / 2 AS difficulty, …
       FROM caches c
       JOIN cache_type ct ON c.type = ct.id
       LEFT JOIN stat_caches sc ON c.cache_id = sc.cache_id
      WHERE c.wp_oc = ? GROUP BY c.cache_id`, [userId, userId, userId, wp]);
```

🗣 *Talk track: The punchline — **neither side uses an ORM**: same SQL, both bind params.*

---

# Layer 3 — …it's literally the same query

```
caches  c                         caches  c
JOIN cache_type   ct              JOIN cache_type   ct
JOIN cache_size   cs              JOIN cache_size   cs
JOIN cache_status cst             JOIN cache_status cst
JOIN user         u               JOIN user         u
LEFT JOIN stat_caches  sc         LEFT JOIN stat_caches  sc
LEFT JOIN cache_logs   fl   ⟵ same join, same fl.type IN (1,7)
LEFT JOIN coordinates  pcn  ⟵ same personal-note join (type = 2)
c.difficulty / 2                  c.difficulty / 2
IF(c.logpw != '', 1, 0)           IF(c.logpw != '', 1, 0)
```

**Same tables. Same joins. Same expressions.** The query was *ported*, not redesigned.

🗣 *Talk track: "When we built OC5 we didn't reinvent the data model — we copied
your SQL. That's why the migration is low-risk: the hard, domain-specific part (the
queries you got right over years) carries straight across."*

---

# Layer 4 — Model

**OC4**
- **No Doctrine entities.** The `Entity/` dir is empty by design.
- A row is a plain **associative array**: `$cacheRow['wp_oc']`.

**OC5**
- **No ORM, no classes.** A row is a plain **object**: `c.wp_oc`.

Both then map the raw row → a **uniCache** object the frontend understands
(OC4: `UniCacheBuilder::build()`; OC5: the object literal returned by `ocGetCacheDetail`).

🗣 *Talk track: "Nobody has to learn an ORM. The 'model' is the row plus a mapping
function — a decision you already made and we kept."*

---

# Layer 5 — Template

**OC4** `templates/app/caches/detail.html.twig`
```twig
{% extends 'base.html.twig' %}
{% block after_body_start %}
  <script>window.uniCacheWP = [];</script>
{% endblock %}
```

**OC5** `views/caches/detail.njk` — *generated from that Twig*
```twig
{% extends 'base.njk' %}
{% block after_body_start %}
  <script>window.uniCacheWP = {{ cache_json | safe }};</script>
{% endblock %}
```

🗣 *Talk track: "Twig and Nunjucks are the same language with a different name —
`{% block %}`, `{% extends %}`, `{{ var }}` all identical. That's why we generate
the .njk from your .twig and the frontend is untouched."*

---

# What's genuinely different

<style scoped>
table { font-size: 20px; line-height: 1.25; }
th, td { padding: 2px 10px; }
</style>

| | OC4 — Symfony | OC5 — Express |
|---|---|---|
| Wiring | DI container, autowiring | explicit `import` |
| Routing | `#[Route]` on the method | `router.get()` pointing at it |
| Concurrency | sync per request (PHP-FPM worker) | `async/await`, single event loop |
| HTTP I/O | `Request`/`Response` objects | `req`/`res` + middleware |
| Errors | exceptions + error listeners | structured `err()`/`fail()` + error middleware |
| Boot model | container compiled per deploy | one long-lived process |
| Observability | Symfony Profiler / Monolog | `traced()` flight recorder ring buffers |

🗣 *Talk track: **Mechanics, not architecture.** The one real mindset shift: async/await + a long-running process vs. PHP's per-request workers.*

---

# What's the same (the reassuring list)

- ✅ **No ORM** — hand-written SQL you can read and tune
- ✅ **Thin controllers**, data access in a dedicated layer
- ✅ **Repositories → `src/data/` modules** (one file per area)
- ✅ **JSON API the frontend calls** + server-rendered shell
- ✅ **uniCache** shaping object, same field names
- ✅ **Custom cookie auth** (`sys_sessions`), not a framework firewall
- ✅ **Twig → Nunjucks**, same template language
- ✅ **Same database, same schema, same queries**

🗣 *Talk track: "Eight of the things that define how OC works day-to-day are
unchanged. That's the case for OC5 being evolution, not a rewrite of your thinking."*

---

# Day-to-day: how you add an endpoint

**OC4**
1. Add a method to a controller, annotate with `#[Route]`.
2. Add/extend a repository method (DBAL QueryBuilder).
3. (Autowiring picks it up.)

**OC5** *(see `CONVENTIONS.md`)*
1. Add a handler fn in the feature file under `src/routes/`.
2. Add one `router.get('/path', handler)` line.
3. Add/extend a `src/data/` function (`pool.query`).

> Rule: **`app.js` never holds a handler; SQL only lives in `src/data/`.**

🗣 *Talk track: "Same number of steps, same separation. A Symfony dev is productive
in OC5 in an afternoon because the muscle memory transfers."*

---

# Honest trade-offs

**Symfony / OC4 brings**
- Mature framework, batteries included (forms, security, console, profiler)
- Static types via PHP, huge enterprise ecosystem
- The team's deep existing expertise

**Express / OC5 brings**
- One language across front + back end
- Async I/O, long-lived process, lighter footprint & faster cold paths
- Tiny surface area — little "framework magic" to learn
- Easier to onboard JS-fluent contributors

🗣 *Talk track: "I'm not selling a silver bullet. The real question is team +
ecosystem fit, because — as we just saw — the architecture is a wash."*

---

# Why switch horses, really?

<style scoped>
section { font-size: 22px; }
li { margin: 0.15em 0; line-height: 1.3; }
</style>

*The architecture is a wash — so the case isn't technical. It's about **people and longevity**.*

- **Hire the next generation** — JS/TS is the biggest, youngest talent pool; far easier to recruit and keep than Symfony veterans.
- **One language, front to back** — the frontend is already JS; no PHP↔JS context-switch, and code is shared (`coords.js` runs in both).
- **Low barrier to entry** — tiny surface, no DI container / bundles / Doctrine; a newcomer ships a feature in an afternoon.
- **Sustainability** — bet on the stack the next maintainers know; shrink the bus-factor as Symfony ages out of the volunteer pool.
- **Lighter to run** — one long-lived process, small Alpine container, less per-request overhead than PHP-FPM.
- **Cheap to switch** — same DB, SQL, uniCache; capture the upside *without* re-architecting.

> **The point:** not "Node is better" — it's the same app. It's easier to **staff, start, and sustain**. For a community project, that *is* the benefit.

---

# Decision framing

The architecture is **not** the variable. Both stacks are:
*thin controllers → raw SQL data layer → uniCache → JSON + templates.*

So the decision is really about:
1. **Language & team** — PHP depth vs. one-language full-stack
2. **Ecosystem** — Symfony's batteries vs. npm + minimalism
3. **Operations** — PHP-FPM workers vs. a long-lived Node process
4. **Onboarding** — who do we hire/retain, and in what language?

🗣 *Talk track: "Pick the column that fits the team and the ops you want to run.
Whatever you pick, the codebase will look like the codebase you already know."*

---

# Backup — file map for the curious

<style scoped>
table { font-size: 19px; line-height: 1.2; }
th, td { padding: 2px 8px; }
code { font-size: 0.92em; }
</style>

| Layer | OC4 | OC5 |
|---|---|---|
| Routing/controller | `src/Controller/App/CachesController.php` | `src/routes/caches.js` |
| Service | `src/Service/UniCacheBuilder.php` | (object literal in `ocGetCacheDetail`) |
| Data | `src/Repository/CachesRepository.php` | `src/data/caches.js` |
| DB handle | injected `DBAL\Connection` | `src/db.js` (`pool`) |
| Auth | `Auth` service | `src/auth.js` (middleware) |
| Template | `templates/app/caches/detail.html.twig` | `views/caches/detail.njk` |
| Wiring | `config/services.php` | `app.js` imports + `app.use()` |

*(OC4 paths were mapped by code exploration — sanity-check them against the live repo before presenting.)*

---

# Questions?

**The takeaway:** OC5 is OC4's architecture, transliterated.
Same SQL, same layers, same uniCache, same templates — new language.

🗣 *Talk track: "Open `GET /cache/OC18BB7` in both, then open
`CachesRepository.php` next to `src/data/caches.js`. The diff is the language,
not the design."*
