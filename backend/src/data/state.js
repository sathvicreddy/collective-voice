const state = {
  user: {
    id: "u_ananya",
    name: "Ananya Sharma",
    email: "ananya.sharma@email.com",
    role: "Audience",
    joined: "May 18, 2025",
    location: "New Delhi, India",
    bio: "Curious mind, better questions, stronger conversations.",
    stats: {
      questionsAsked: 23,
      upvotesReceived: 128,
      answersGiven: 17,
      meetingsJoined: 8
    }
  },
  meetings: [
    {
      id: "m_ai_education",
      code: "482916",
      title: "AI in Education: Opportunities & Challenges",
      speaker: "Dr. Sarah Johnson",
      date: "May 30, 2025",
      time: "02:00 PM - 03:30 PM",
      duration: "1h 30m",
      status: "live",
      participants: 128,
      description: "Let's discuss how AI is transforming education and the challenges we face.",
      category: "AI in Education"
    },
    {
      id: "m_remote",
      code: "275190",
      title: "Future of Remote Learning",
      speaker: "Dr. Michael Lee",
      date: "May 25, 2025",
      time: "02:00 PM - 03:30 PM",
      duration: "1h 30m",
      status: "upcoming",
      startsIn: "In 2h",
      participants: 80,
      category: "Remote Learning"
    },
    {
      id: "m_privacy",
      code: "733512",
      title: "Data Privacy in EdTech",
      speaker: "Priya Sharma",
      date: "May 26, 2025",
      time: "11:00 AM - 12:00 PM",
      duration: "1h",
      status: "upcoming",
      startsIn: "In 1 day",
      participants: 65,
      category: "Data Privacy"
    },
    {
      id: "m_innovations",
      code: "918224",
      title: "EdTech Innovations 2025",
      speaker: "James Wilson",
      date: "May 28, 2025",
      time: "04:00 PM - 05:00 PM",
      duration: "1h",
      status: "upcoming",
      startsIn: "In 3 days",
      participants: 90,
      category: "EdTech Innovations"
    },
    {
      id: "m_engagement",
      code: "611204",
      title: "Student Engagement Strategies",
      speaker: "Ananya Sharma",
      date: "May 18, 2025",
      time: "04:00 PM - 06:00 PM",
      duration: "2h",
      status: "conducted",
      participants: 95,
      questionsCount: 34,
      upvotes: 210,
      category: "Teaching Methods"
    },
    {
      id: "m_policy",
      code: "812640",
      title: "Education Policy Discussion",
      speaker: "Ananya Sharma",
      date: "May 12, 2025",
      time: "10:00 AM - 11:30 AM",
      duration: "1h 30m",
      status: "past",
      participants: 142,
      questionsCount: 48,
      upvotes: 356,
      category: "Policy"
    }
  ],
  questions: [
    {
      id: "q1",
      text: "How can AI be used ethically in education?",
      votes: 126,
      asked: "2h ago",
      score: 0.87,
      status: "Under Review",
      similar: 18,
      clusterSize: 18,
      askedBy: "Priya Sharma",
      assignedSpeakerId: null,
      summary: "Participants are asking how institutions can balance useful AI tools with bias checks, privacy, transparency, and teacher oversight.",
      timeline: ["Submitted", "Clustered with 18 similar questions", "Ranked #1", "Awaiting moderator action"]
    },
    {
      id: "q2",
      text: "What are the long-term impacts of remote learning?",
      votes: 98,
      asked: "1d ago",
      score: 0.74,
      status: "Answered",
      similar: 12,
      clusterSize: 12,
      askedBy: "James Wilson",
      assignedSpeakerId: null,
      summary: "The cluster focuses on learning outcomes, student isolation, access gaps, and hybrid course design.",
      timeline: ["Submitted", "Clustered with 12 similar questions", "Answered by speaker"]
    },
    {
      id: "q3",
      text: "How do we ensure data privacy in edtech platforms?",
      votes: 84,
      asked: "2d ago",
      score: 0.66,
      status: "Pending",
      similar: 6,
      clusterSize: 6,
      askedBy: "Ananya Sharma",
      assignedSpeakerId: null,
      summary: "The question centers on consent, minimal data collection, secure storage, and clear retention policies.",
      timeline: ["Submitted", "Clustered with 6 similar questions", "Answered by speaker"]
    },
    {
      id: "q4",
      text: "Can AI generate personalised learning paths for students with disabilities?",
      votes: 61,
      asked: "45m ago",
      score: 0.58,
      status: "Pending",
      similar: 4,
      clusterSize: 4,
      askedBy: "Dr. Michael Lee",
      assignedSpeakerId: null,
      summary: "Asks whether adaptive AI systems can make content truly accessible for students with various learning differences.",
      timeline: ["Submitted", "Ranked #4"]
    },
    {
      id: "q5",
      text: "What role should teachers play when AI handles grading?",
      votes: 47,
      asked: "1h ago",
      score: 0.51,
      status: "Pending",
      similar: 3,
      clusterSize: 3,
      askedBy: "Sarah Chen",
      assignedSpeakerId: null,
      summary: "Explores teacher identity and oversight in an AI-driven assessment environment.",
      timeline: ["Submitted", "Ranked #5"]
    }
  ],
  polls: [
    {
      id: "poll1",
      question: "How familiar are you with AI tools in your classroom?",
      active: true,
      endsAt: Date.now() + 5 * 60 * 1000,
      totalVotes: 87,
      options: [
        { id: "opt1", label: "Very familiar", votes: 31 },
        { id: "opt2", label: "Somewhat familiar", votes: 38 },
        { id: "opt3", label: "Not familiar at all", votes: 18 }
      ]
    }
  ],
  participants: [
    { id: "p1", name: "Priya Sharma",   initials: "PS", upvotes: 14, questions: 3 },
    { id: "p2", name: "James Wilson",   initials: "JW", upvotes: 11, questions: 2 },
    { id: "p3", name: "Sarah Chen",     initials: "SC", upvotes: 9,  questions: 4 },
    { id: "p4", name: "Ravi Kumar",     initials: "RK", upvotes: 7,  questions: 1 },
    { id: "p5", name: "Ananya Sharma",  initials: "AS", upvotes: 5,  questions: 2 }
  ],
  notifications: [
    { id: "n1", type: "Meeting Updates", title: "Education Policy Discussion is starting soon", body: "Your meeting starts in 15 minutes", time: "9:45 AM" },
    { id: "n2", type: "Questions", title: "New question in Education Policy Discussion", body: "How can AI be used ethically in education?", time: "9:30 AM" },
    { id: "n3", type: "System", title: "Meeting report is ready", body: "View insights from Education Policy Discussion", time: "May 27" }
  ]
};

module.exports = state;
