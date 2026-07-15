export
const state = {
  route: location.hash.replace("#", "") || "/welcome",
  home: null,
  meetings: [],
  // NOTE: questions are owned by SessionStore — do NOT read state.questions anywhere
  activity: null,
  profile: null,
  notifications: [],
  sessionAnalytics: null,
  // The meeting the user looked up via code (used by preview/waiting screens)
  joinTarget: null,
  // True while loadData() is in flight — use to show loading skeletons
  isLoading: false,
  // JWT access token — persisted to localStorage (1h lifetime)
  token: (() => { try { return localStorage.getItem("cv_token"); } catch { return null; } })(),
  // Refresh token — persisted to localStorage (30d lifetime), used to renew access tokens
  refreshToken: (() => { try { return localStorage.getItem("cv_refresh_token"); } catch { return null; } })(),
  createDraft: {
    title: "AI in Education: Opportunities & Challenges",
    date: "May 30, 2025",
    time: "02:00 PM - 03:30 PM",
    duration: "1h 30m",
    description: "Let's discuss how AI is transforming education and the challenges we face.",
    participants: ["Sarah Johnson", "Dr. Michael Lee", "Priya Sharma", "James Wilson"],
    settings: {
      allowQuestions:   true,
      enableChat:       true,
      recordMeeting:    false,
      allowScreenShare: true,
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

