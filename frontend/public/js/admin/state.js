/* Admin Panel Shared State */
export const state = {
  currentPage: 'overview',
  selectedMeetingId: null,
  selectedUserId: null,
  meetingDetailTab: 'questions',
  meetingContextMenu: null,
  showDeleteModal: false,
  deleteMeetingId: null,
  // Auth state — populated on mount by verifying JWT
  currentUser: null,   // { id, name, email, role, picture }
  isSuperadmin: false,
};
