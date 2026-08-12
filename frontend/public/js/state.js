export
const state = {
  route: location.hash.replace("#", "") || "/welcome",
  home: null,
  meetings: [],
  // User-specific meeting lists (from /api/meetings/mine)
  // Only meetings the user has enrolled in (via QR or code) or owns.
  myMeetings: {
    all:      [],
    upcoming: [],
    live:     [],
    past:     [],
    expired:  []
  },
  myEnrollments: [],   // raw enrollment records from the server
  // NOTE: questions are owned by SessionStore — do NOT read state.questions anywhere
  activity: null,
  profile: null,
  notifications: [],
  notifPrefs: null,  // Loaded from /api/notifications/preferences — null until fetched
  sessionAnalytics: null,
  // The meeting the user looked up via code (used by preview/waiting screens)
  joinTarget: null,
  // True while loadData() is in flight — use to show loading skeletons
  isLoading: false,
  // JWT access token — persisted to localStorage (1h lifetime)
  token: (() => { try { return localStorage.getItem("cv_token"); } catch { return null; } })(),
  // Refresh token — persisted to localStorage (30d lifetime), used to renew access tokens
  refreshToken: (() => { try { return localStorage.getItem("cv_refresh_token"); } catch { return null; } })(),
  // Authenticated user's ID (decoded from the JWT — set by app.js on auth success)
  currentUserId: null,
  // Stable browser-scoped identity for anonymous attendees.
  // Generated once per browser, persisted in localStorage, survives refreshes and reconnects.
  // Only used when the user is NOT logged in (i.e. state.token is null).
  guestToken: (() => {
    try {
      let t = localStorage.getItem("cv_guest_token");
      if (!t) {
        t = crypto.randomUUID();
        localStorage.setItem("cv_guest_token", t);
      }
      return t;
    } catch { return null; }
  })(),
  // Set of questionIds this user has upvoted in the current session.
  // Seeded from session_snapshot.myVotes on join; updated by your_vote_changed events.
  myVotes: new Set(),
  createDraft: {
    title:       "",
    date:        "",
    time:        "",
    duration:    "60",
    description: "",
    speaker:     "",
    type:        "instant",  // "instant" | "scheduled"
    roomId:      "",
    timezone:    "",
    access:      "open",
    settings: {
      allowQuestions:   true,
      enableChat:       true,
      upvoteReact:      true,
      recordMeeting:    false,
      showParticipants: true,
      requireApproval:  false,
    }
  },
  // isHost is set to true when the user creates a meeting, and re-derived from
  // /api/auth/me on refresh (ownedMeetingIds check in app.js loadData).
  isHost: false,
  // Session role state
  session: {
    role: null,          // "moderator" | "speaker" | "participant" | null
    canSpeak: false,
    activeView: "participant",
    sessionId: null      // meetingId — threaded through all session API calls
  }
};

