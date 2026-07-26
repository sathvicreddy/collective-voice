/* Admin Panel Shared State */
export const state = {
  currentPage: 'overview',
  selectedMeetingId: 1,
  selectedUserId: 1,
  meetingDetailTab: 'questions',
  meetingContextMenu: null,
  showDeleteModal: false,
  deleteMeetingId: null,
  // Auth state — populated on mount by verifying JWT
  currentUser: null,   // { id, name, email, role, picture }
  isSuperadmin: false,
};
