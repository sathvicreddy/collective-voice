# CollectiveVoice Web App

Responsive frontend and backend prototype based on the provided CollectiveVoice PDFs and UI screenshots.

## Structure

```text
backend/
  server.js
frontend/
  public/
    index.html
    styles.css
    app.js
```

## Run

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

## Included

- Mobile-first CollectiveVoice UI matching the screenshot style.
- Laptop layout with sidebar and dashboard panels.
- Native Node.js backend with REST endpoints.
- In-memory data for home, meetings, activity, profile, notifications, live Q&A, question submission, upvoting, and meeting creation.
- No third-party package install required.

## Main Routes

- `#/splash`, `#/onboarding/1`, `#/onboarding/2`, `#/onboarding/3`
- `#/login`, `#/signup`, `#/forgot`, `#/reset`
- `#/home`, `#/meetings`, `#/activity`, `#/profile`, `#/settings`
- `#/join`, `#/join/scan`, `#/join/id`, `#/join/preview`, `#/join/waiting`, `#/join/invalid`
- `#/meetings/create`, `#/meetings/create/details`, `#/meetings/create/invite`, `#/meetings/create/review`, `#/meetings/created`
- `#/audience`, `#/moderator`, `#/speaker`, `#/question/q1`, `#/analytics`, `#/conducted`
