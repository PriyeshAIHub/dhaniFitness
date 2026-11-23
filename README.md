# Dhani's Fitness Quest

Angular 21 app for tracking Dhani's fitness challenge. Parent and child use separate Supabase Auth accounts linked to one shared challenge. Child access is limited in the app and by database policies: Dhani can view the challenge and submit workouts, while only the parent can approve workouts or change settings.

## Supabase setup

1. In the Supabase dashboard, open **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql). If you already ran an earlier version, run this updated script to add account linking and role-based policies.
2. In **Authentication → Settings**, turn off public sign-ups and **Confirm email**. The app maps usernames to reserved internal aliases, not real email addresses, so confirmation and email-based password recovery are unavailable.
3. Keep the project's URL and **publishable key** in [`src/environments/environment.ts`](./src/environments/environment.ts). These values are public in a browser build. Never add a Supabase secret/service-role key to this Angular app, GitHub Pages, or a committed file.
4. In **Authentication → Users**, privately create two confirmed users: `parentadmin@example.com` and `dhanifitness@example.com`. Set separate strong passwords there. These addresses are internal aliases, not inboxes.
5. Sign in as `parentAdmin` and open **Parent Zone → Link Dhani's account → Create invite code**.
6. Sign out, choose **Dhani**, and sign in as `DhaniFitness` with the one-time invite code. The code can be used once and expires after seven days.

The usernames map internally to reserved Supabase Auth email aliases; no real email is shown or required. Public sign-up is disabled so nobody can claim the fixed usernames. Passwords are set privately in Supabase Auth and are never stored in this source code. Since the aliases cannot receive email, reset a forgotten password through the Supabase dashboard. Never reuse a password shared in chat.

Challenge progress is stored in a parent-owned cloud record. Dhani's authenticated account can read it and submit workouts through a restricted database function; it cannot edit approvals, points, or settings. The parent account controls the challenge. If an earlier version has local progress under `dhani-fitness-quest-v1`, the first parent sign-in migrates it when no cloud record exists and removes that legacy progress from local storage.

The challenge is continuous: week numbers and Monday-to-Sunday date ranges are generated as needed. The app keeps all past weeks and the next 10 upcoming weeks in the saved challenge, while showing only past and near-future weeks. Workouts are scheduled for Monday, Wednesday, and Friday by default; Dhani can select the weekday she actually completed a workout when submitting it. Re-run the updated `supabase/schema.sql` if the database was previously configured; the workout submission function validates the chosen weekday and rejects future weeks.

Supabase Auth stores its login session in the browser. Challenge progress itself is loaded from and saved to Supabase. If Supabase is unavailable or the table/policies are not configured, the app displays a sync error rather than saving challenge progress locally.

## Development

```bash
npm install
npm start
```

## Production build

```bash
npm run build
```

## GitHub Pages

The workflow at [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) builds and deploys the site from `main`, `master`, or `feature/parent-child-supabase-auth`. In the repository's **Settings → Pages**, choose **GitHub Actions** as the build and deployment source. The workflow publishes to `https://priyeshaithub.github.io/dhaniFitness/`; it builds with the repository base path and includes an SPA fallback for Angular routes.

The Supabase URL and publishable key are public browser settings. Configure the Supabase Auth Site URL to the deployed URL if you later enable any email redirect flows.
