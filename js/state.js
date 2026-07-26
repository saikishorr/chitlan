const state = {
  peer: null,
  conn: null,
  connections: [],
  isHost: false,
  isRoomLocked: false,
  myNickname: '',
  myColor: '#60a5fa',
  
  // Voice & Video Call State
  localStream: null,
  videoStream: null,
  activeCalls: {},
  activeVideoCalls: {},
  isMuted: false,
  isCamOn: false,
  isInCall: false,
  isInVideoMeeting: false,
  
  // Screen Share State
  screenStream: null,
  activeScreenCalls: {},
  currentScreenSharer: null,
  activeScreenSharersMap: {},
  
  // File Transfer State
  incomingFiles: {},
  outgoingFiles: {},
  
  // App & Activity State
  unreadCount: 0,
  pageFocused: true,
  sessionStartTime: null,
  sessionTimerId: null,
  
  // Statistics Counters
  messagesSent: 0,
  filesTransferred: 0
};

export default state;