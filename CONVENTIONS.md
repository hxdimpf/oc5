# OC5 — Routing & code conventions

This is the one document every contributor reads before adding an endpoint.
The goal: a single, predictable recipe so the codebase stays uniform no matter
who is writing it.

## The layers

```
HTTP request
   │
   ▼
app.js ............... composition root: middleware stack + route mounts. NO handlers.
   │
   ▼
src/routes/<feature>.js  feature module: thin handlers + a Router declaring their paths
   │
   ▼
src/data/<entity>.js ... all SQL lives here (pool.query). Returns plain objects/arrays.
   │
   ▼
MariaDB
```

Supporting pieces:

- `src/middleware/` — reusable route guards (`requireLogin`, `requireRole`).
- `src/validate.js` / `src/errors.js` — input validation and structured API errors.
- `public/templates/nunjucks/` — Nunjucks views (derived from OC4 Twig — never edit by hand).

## How to add an endpoint

1. **Find the feature file** in `src/routes/` (e.g. caches, user, auth, site,
   backoffice, maps). If your endpoint belongs to a new feature, copy
   `src/routes/_template.js`.

2. **Write a handler** — a thin function: parse input → call a `src/data/`
   function → render or respond.

   ```js
   /** GET /caches/:wp/something — short description. */
   export async function something(req, res) {
     const data = await ocGetSomething(req.params.wp);   // SQL lives in src/data/
     res.render('caches/something.njk', { data });
   }
   ```

3. **Declare the route** — add one line to that file's router, full path:

   ```js
   router.get('/caches/:wp/something', something);
   // protected pages: pass a guard before the handler
   router.post('/caches/:wp/something', requireLogin, something);
   ```

4. **New feature file only:** add one `app.use(somethingRoutes)` line in `app.js`.

That's it. The route table in each feature file *is* its API surface — readable
top to bottom.

## Hard rules (enforced in review)

- **`app.js` never contains a route handler.** It only sets up middleware and
  mounts feature routers. If a PR adds an `app.get(...)` handler body to app.js,
  it gets sent back.
- **SQL only in `src/data/`.** Route handlers never call `pool.query` directly.
- **Handlers stay thin.** Non-trivial logic goes into a private helper in the
  feature file or, if reusable, into `src/data/` or `src/middleware/`.
- **Auth via middleware**, not copy-pasted `if (!req.user.id)` checks. Use
  `requireLogin` / `requireRole`.
- **Route ordering:** within a feature file, declare specific paths before
  parameterised ones (`/cache/new` before `/cache/:wp`).

## Why this shape

- One obvious place for every concern → low cognitive load for a team new to
  Express.
- Adding a route touches one file (or one file + one mount line) → small,
  reviewable diffs, minimal merge conflicts.
- `app.js` reads as a table of contents of the whole app.
- Handlers are plain exported functions → unit-testable without booting Express.
