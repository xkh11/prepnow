# PrepNow

An AI-powered career-readiness platform that helps students assess their skills, follow a personalized training plan, and practice job interviews with automated feedback. Built as a graduation project at Shaqra University.

PrepNow is a single-page web application written in vanilla JavaScript with a Supabase (PostgreSQL) backend and OpenAI for interview question generation and answer evaluation. It uses no front-end framework and no build step — the project runs as plain static files.

## Features

- **Authentication** — email/password sign-up and sign-in via Supabase Auth, plus a guest mode for quick trials.
- **Skills assessment** — a question-based assessment that scores the user across multiple skill areas.
- **Personalized training plan** — generates a plan from assessment results and links to curated learning resources.
- **AI interview practice** — an interactive interview that uses the OpenAI API to ask questions and evaluate answers.
- **Dashboard & history** — progress overview and a record of past assessments and interview attempts.
- **User profile** — major, target role, and account details.
- **Admin panel** — manage questions, skills, and training resources, and review user activity (gated by an admin role).

## Tech stack

| Layer | Technology |
|-------|------------|
| Front end | Vanilla JavaScript, HTML, CSS (no framework, no build tooling) |
| Backend / data | Supabase — PostgreSQL, Auth, Row Level Security |
| AI | OpenAI API |
| Delivery | Static files; Supabase JS SDK loaded via CDN |

## Project structure

```
prepnow/
├── index.html              # App shell and script/style includes
├── css/                    # Styles (base, components, pages)
├── js/
│   ├── config.js           # Supabase + OpenAI keys (placeholders — fill in locally)
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
└── sql/
    └── prepnow-complete.sql  # Full schema, RLS policies, and seed data
```

## Database

The schema in `sql/prepnow-complete.sql` defines 11 tables (users, profiles, questions, skills, assessments, interview attempts, training plans and items, resources, and login history). Row Level Security is enabled on every table, with per-user policies (`auth.uid() = user_id`) and an `is_admin()` helper that grants administrative access. The file also seeds the question bank and learning resources.

## Getting started

The project is served as static files — there is no build step and no package manager.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Load the schema:** open the Supabase SQL editor and run the contents of `sql/prepnow-complete.sql`. This creates all tables, RLS policies, and seed data.
3. **Add your keys:** edit `js/config.js` and replace the placeholders with your Supabase project URL, Supabase anon key, and OpenAI API key.
4. **Serve the folder** with any static web server (the app must be served over HTTP, not opened from `file://`). For example:
   ```bash
   python -m http.server 8000
   ```
   Then open `http://localhost:8000`.

## Notes & limitations

This is an academic prototype. The OpenAI API key in `js/config.js` is read directly by the browser, which means it would be exposed to end users in a real deployment. A production version would move all OpenAI calls behind a backend (for example a Supabase Edge Function) so the key is never sent to the client. The Supabase anon key is designed to be public and is protected by the Row Level Security policies defined in the schema.

## License

Released for educational and portfolio purposes.
