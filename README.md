# PrepNow

An AI-powered career-readiness platform that helps students assess their skills, follow a personalized training plan, and practice job interviews with automated feedback. Built as a graduation project at Shaqra University.

**Live demo:** https://xkh11.github.io/prepnow/

PrepNow is a single-page web application written in vanilla JavaScript with a Supabase (PostgreSQL) backend. Interview answers are evaluated by OpenAI, called through a Supabase Edge Function so the API key stays server-side and never reaches the browser. The front end uses no framework and no build step — it runs as plain static files.

## Features

- **Authentication** — email/password sign-up and sign-in via Supabase Auth, plus a guest mode for quick trials.
- **Skills assessment** — a question-based assessment that scores the user across multiple skill areas.
- **Personalized training plan** — generates a plan from assessment results and links to curated learning resources.
- **AI interview practice** — an interactive interview that evaluates answers with OpenAI via a server-side Supabase Edge Function (signed-in users only).
- **Dashboard & history** — progress overview and a record of past assessments and interview attempts.
- **User profile** — major, target role, and account details.
- **Admin panel** — manage questions, skills, and training resources, and review user activity (gated by an admin role).

## Tech stack

| Layer | Technology |
|-------|------------|
| Front end | Vanilla JavaScript, HTML, CSS (no framework, no build tooling) |
| Backend / data | Supabase — PostgreSQL, Auth, Row Level Security |
| AI | OpenAI API, called through a Supabase Edge Function (Deno) so the key stays server-side |
| Hosting | GitHub Pages (static front end); Supabase JS SDK loaded via CDN |

## Project structure

```
prepnow/
├── index.html              # App shell and script/style includes
├── css/                    # Styles (base, components, pages)
├── js/
│   ├── config.js           # Supabase URL + anon key (public — safe in the browser)
│   ├── app.js              # App bootstrap and routing
│   ├── supabase-client.js  # Data-access layer over the Supabase SDK
│   ├── auth.js             # Authentication and guest mode
│   ├── assessment.js       # Skills assessment
│   ├── training.js         # Training plan
│   ├── interview.js        # AI interview
│   ├── dashboard.js        # Dashboard
│   ├── history.js          # Attempt history
│   ├── profile.js          # User profile
│   ├── admin.js            # Admin panel
│   └── ...                 # Supporting modules (store, questions)
├── sql/
│   └── prepnow-complete.sql    # Full schema, RLS policies, and seed data
└── supabase/
    └── functions/
        └── openai-proxy/
            └── index.ts        # Edge Function — holds the OpenAI key, proxies requests
```

## Database

The schema in `sql/prepnow-complete.sql` defines 11 tables (users, profiles, questions, skills, assessments, interview attempts, training plans and items, resources, and login history). Row Level Security is enabled on every table, with per-user policies (`auth.uid() = user_id`) and an `is_admin()` helper that grants administrative access. The file also seeds the question bank and learning resources.

## Getting started

The front end is plain static files — no build step, no package manager. The only server-side piece is one Supabase Edge Function that proxies OpenAI.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Load the schema:** open the Supabase SQL editor and run the contents of `sql/prepnow-complete.sql`. This creates all tables, RLS policies, and seed data.
3. **Set the front-end config:** in `js/config.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to your project's values (Project Settings → API). These are safe to commit — the anon key is public by design and constrained by RLS.
4. **Deploy the OpenAI proxy:** in the Supabase dashboard go to **Edge Functions**, create a function named `openai-proxy`, paste in `supabase/functions/openai-proxy/index.ts`, and deploy. Then add a secret **`OPENAI_API_KEY`** set to your OpenAI key (Edge Functions → Secrets). The key lives only here — never in the repo or the browser.
5. **Run locally** with any static server (must be HTTP, not `file://`):
   ```bash
   python -m http.server 8000
   ```
   Then open `http://localhost:8000`.
6. **Publish (optional):** enable **GitHub Pages** (repo Settings → Pages → Deploy from branch → `main` / root) to serve the live site.

## Notes & limitations

This is an academic project, but it follows the same key-handling pattern a production app would use. The OpenAI API key is never exposed to the browser: all OpenAI calls go through the `openai-proxy` Supabase Edge Function, which holds the key as a server-side secret and only serves signed-in users. The Supabase anon key in `js/config.js` is intentionally public — it is meant to be shipped to the browser and is constrained by the Row Level Security policies in the schema. Because a public demo runs against a real Supabase project and a real OpenAI account, usage is naturally bounded by those accounts' quotas and balance.

## License

Released for educational and portfolio purposes.
