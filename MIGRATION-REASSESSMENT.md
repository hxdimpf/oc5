# Migration Assessment — Revised (June 2026)

This revises the February 2026 `migration-assessment.md` after 4 weeks of
hands-on work in the codebase.

## What the February Assessment Got Right

1. **The database is the real asset.** 119 tables, 123+ triggers/procedures.
   The schema and data are irreplaceable.

2. **OKAPI is the hardest part.** A cross-site standard with OAuth, used by
   multiple national sites and third-party apps.

3. **Full rewrite is historically risky.** Many projects fail at this.

## What the February Assessment Got Wrong

### 1. The Codebase Size is Misleading

The assessment counted 344,000 lines of code and concluded "3-5 years."
After removing dead scaffolding:

| Component | Before | After | What was removed |
|-----------|--------|-------|-----------------|
| Entity classes | 33 files | 0 | ORM annotations, getters/setters never called |
| Repository base class | ServiceEntityRepository on 32 repos | Plain PHP classes | Proxy system that crashed prod |
| Symfony Security | 7 files (firewall, authenticators, voters) | 1 file (Auth.php, 200 lines) | Everything except cookie + MD5 check |
| Composer packages | 27 production | 15 | ORM, mailer, serializer, notifier, etc. |
| Raw SQL in controllers | 99 calls across 7 controllers | 0 | All moved to QueryBuilder in repos |

**Actual running code:** ~15,000 lines of business logic. The rest was scaffolding.

### 2. The Symfony Code Was Not "Well-Structured"

The assessment rated the Symfony tree as "Medium complexity, Medium difficulty."
In reality:

- The `ServiceEntityRepository` proxy system crashed on production (`APP_DEBUG=0`)
- 32 repos extended a base class they never used — nobody called `$entityManager->persist()`
- The security firewall did nothing that a 200-line cookie reader couldn't do
- The ORM mapping layer converted arrays to objects and back — to identical structures

The Symfony code was *over-structured*, not well-structured. Every layer added
complexity without functionality.

### 3. The Assessment Missed the Simplest Migration Path

The February document considered only:
- **Option A:** Continue Symfony (upgrade to 7.x)
- **Option B:** Hybrid PHP backend + Next.js frontend
- **Option C:** Full rewrite to Next.js with Prisma ORM

All three assumed an ORM was necessary. All three assumed the PHP backend was sound.

**What it missed:** Node.js + Express + raw SQL + Nunjucks. No ORM. No Next.js.
No Prisma. Same pattern as the working OKAPI codebase. We built this in days (OC5).

### 4. The Risk Assessment Was Wrong

| Claim (Feb 2026) | Reality (Jun 2026) |
|-----------------|-------------------|
| "Full rewrite: 3-5 years" | A viable Express port: measured in **weeks** |
| "Continue Symfony: lowest risk" | Symfony was actively broken — proxy crashes, ORM dead weight |
| "Hybrid is the best option" | The PHP backend IS the problem — it's the part that needs replacing |
| "123+ triggers must be migrated" | Triggers handle UUIDs, timestamps, cascading updates — standard DB features. They work regardless of app language. Keep them. |

## Revised Assessment

### The Stack That Actually Works

```
Browser → Express router → pool.query(sql, params) → MariaDB
              ↓
        Nunjucks template (1:1 port from Twig)
              ↓
        27 vanilla ES modules (unchanged from Symfony)
```

**Key insight:** The frontend (27 JS modules, vendor CSS, templates) is
framework-agnostic. It doesn't care whether the backend is PHP or Node.js.
It just needs the API to return data in the right shape.

### What's Truly Hard

1. **OKAPI** — needs its own strategy. Keep as a separate PHP service behind
   a reverse proxy, or implement OKAPI endpoints in Node.js. Either way, it's
   a defined API surface with clear specs.

2. **Database triggers** — don't migrate them. They handle data integrity
   (UUIDs, timestamps, cascading updates) regardless of application language.
   They're database features, not application features.

3. **Replication** — the custom master/slave setup is architecturally separate
   from the application. Keep it.

### What's Actually Easy

1. **Templates** — Twig → Nunjucks is a 1:1 syntax mapping. Same `{% block %}`,
   `{% if %}`, `{% for %}`, `{% extends %}`. Trivially portable.

2. **SQL queries** — `SELECT...FROM...WHERE` is the same in every language.
   Only the parameter binding syntax changes (`?` vs `:named`).

3. **Static assets** — CSS, JS modules, images, vendor libs. No changes needed.

4. **Auth** — the legacy login creates an `ocdevelopmentdata` cookie. Any language
   can read a cookie and validate a session.

## Revised Recommendation

**OC5 is the right path.** Not Next.js with an ORM. Not continuing Symfony.
Plain Node.js/Express with raw SQL, Nunjucks templates, and the existing
database. Same mental model as the OKAPI codebase. The complexity is in the
database schema — but that stays.

The assessment that said "3-5 years, very high risk" was counting lines of
dead code. A more honest count — business logic that actually runs — puts
the effort at weeks for the core pages, months for full feature parity.

The only question is whether to invest those months. The 6/22 demo proves
the approach works. The database is the asset. The rest is replaceable.
