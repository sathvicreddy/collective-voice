export 
const state = {
  route: location.hash.replace("#", "") || "/welcome",
  home: null,
  meetings: [],
  questions: [],
  activity: null,
  profile: null,
  notifications: [],
  sessionAnalytics: null,
  createDraft: {
    title: "AI in Education: Opportunities & Challenges",
    date: "May 30, 2025",
    time: "02:00 PM - 03:30 PM",
    duration: "1h 30m",
    description: "Let's discuss how AI is transforming education and the challenges we face.",
    participants: ["Sarah Johnson", "Dr. Michael Lee", "Priya Sharma", "James Wilson"]
  },
  isHost: false,
  // Session role state
  session: {
    role: null,          // "moderator" | "speaker" | "participant" | null (null = not yet chosen)
    canSpeak: false,     // moderator-as-speaker case
    activeView: "participant",  // local UI tab state
    sessionId: null
  }
};
