import state from './state.js';
import { safeText, formatMessageTime, showToast, scheduleTimeout, scheduleInterval, clearManagedTimeout, clearManagedInterval } from './utils.js';
import { CHAT_HISTORY_KEY, NOTIFICATION_SOUND_SRC, THEME_KEY } from './constants.js';

const typingPeers = new Map();
let gifRenderId = 0;

function chatHistoryStorageKey(roomCode = state.roomCode) {
  return roomCode ? `${CHAT_HISTORY_KEY}:${roomCode}` : '';
}

function readChatHistory(roomCode = state.roomCode) {
  const key = chatHistoryStorageKey(roomCode);
  if (!key) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item && typeof item.sender === 'string'
      && (typeof item.message === 'string' || isValidGifId(item.gifId))).slice(-200) : [];
  } catch (error) {
    return [];
  }
}

function writeChatHistory(entries, roomCode = state.roomCode) {
  const key = chatHistoryStorageKey(roomCode);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(-200)));
  } catch (error) {
    // Storage can be unavailable or full; chat should continue normally.
  }
}

function saveChatMessage(entry) {
  writeChatHistory([...readChatHistory(), entry]);
}

function renderTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (!el) return;
  const names = Array.from(typingPeers.values(), entry => entry.name).filter(Boolean);
  if (names.length === 1) el.textContent = `${names[0]} is typing`;
  else if (names.length === 2) el.textContent = `${names[0]} and ${names[1]} are typing`;
  else if (names.length > 2) el.textContent = 'Several people are typing';
  else el.textContent = '';
}

export const EMOJI_DATABASE = [
  { emoji: '😀', keywords: ['smile', 'happy', 'grin', 'face', 'joy'] },
  { emoji: '😃', keywords: ['smile', 'happy', 'big', 'joy'] },
  { emoji: '😄', keywords: ['laugh', 'happy', 'smile', 'eyes'] },
  { emoji: '😁', keywords: ['beam', 'grin', 'teeth', 'happy'] },
  { emoji: '😆', keywords: ['laugh', 'lol', 'haha', 'satisfied'] },
  { emoji: '😅', keywords: ['sweat', 'laugh', 'relief', 'nervous'] },
  { emoji: '🤣', keywords: ['rofl', 'laugh', 'floor', 'lol'] },
  { emoji: '😂', keywords: ['tears', 'joy', 'lol', 'haha', 'crying'] },
  { emoji: '🙂', keywords: ['slightly', 'smile', 'fine'] },
  { emoji: '🙃', keywords: ['upside', 'silly', 'sarcasm'] },
  { emoji: '😉', keywords: ['wink', 'flirt', 'joke'] },
  { emoji: '😊', keywords: ['blush', 'warm', 'happy', 'smile'] },
  { emoji: '😇', keywords: ['halo', 'angel', 'innocent'] },
  { emoji: '🥰', keywords: ['love', 'hearts', 'adore', 'sweet'] },
  { emoji: '😍', keywords: ['love', 'heart', 'eyes', 'crush'] },
  { emoji: '🤩', keywords: ['star', 'eyes', 'excited', 'wow'] },
  { emoji: '😘', keywords: ['kiss', 'love', 'blow'] },
  { emoji: '😗', keywords: ['kissing', 'duck'] },
  { emoji: '😚', keywords: ['kissing', 'closed'] },
  { emoji: '😋', keywords: ['yum', 'food', 'delicious', 'tasty'] },
  { emoji: '😛', keywords: ['tongue', 'silly'] },
  { emoji: '😜', keywords: ['wink', 'tongue', 'crazy', 'joke'] },
  { emoji: '🤪', keywords: ['zany', 'goofy', 'crazy'] },
  { emoji: '😝', keywords: ['squint', 'tongue', 'lol'] },
  { emoji: '🤑', keywords: ['money', 'dollar', 'cash', 'rich'] },
  { emoji: '🤗', keywords: ['hug', 'warm', 'welcome'] },
  { emoji: '🤭', keywords: ['giggle', 'oops', 'secret'] },
  { emoji: '🤫', keywords: ['shh', 'quiet', 'silence', 'secret'] },
  { emoji: '🤔', keywords: ['think', 'ponder', 'wonder', 'hmm'] },
  { emoji: '🤐', keywords: ['zipper', 'silent', 'shut'] },
  { emoji: '🤨', keywords: ['eyebrow', 'skeptical', 'doubt'] },
  { emoji: '😐', keywords: ['neutral', 'poker', 'meh'] },
  { emoji: '😑', keywords: ['expressionless', 'annoyed', 'done'] },
  { emoji: '😶', keywords: ['speechless', 'silent'] },
  { emoji: '😏', keywords: ['smirk', 'sly', 'flirt'] },
  { emoji: '😒', keywords: ['unamused', 'bored', 'meh'] },
  { emoji: '🙄', keywords: ['roll', 'eyes', 'whatever'] },
  { emoji: '😬', keywords: ['grimace', 'awkward', 'oops'] },
  { emoji: '🤥', keywords: ['lying', 'pinocchio', 'lie'] },
  { emoji: '😌', keywords: ['relieved', 'calm', 'peaceful'] },
  { emoji: '😔', keywords: ['pensive', 'sad', 'sorry'] },
  { emoji: '😪', keywords: ['sleepy', 'tired', 'snooze'] },
  { emoji: '🤤', keywords: ['drool', 'yummy', 'hungry'] },
  { emoji: '😴', keywords: ['sleeping', 'zzz', 'night'] },
  { emoji: '😷', keywords: ['mask', 'sick', 'virus', 'covid'] },
  { emoji: '🤒', keywords: ['thermometer', 'fever', 'sick'] },
  { emoji: '🤕', keywords: ['bandage', 'hurt', 'injury'] },
  { emoji: '🤢', keywords: ['nauseated', 'sick', 'disgust'] },
  { emoji: '🤮', keywords: ['vomit', 'puke', 'gross'] },
  { emoji: '🤧', keywords: ['sneeze', 'tissue', 'cold'] },
  { emoji: '🥵', keywords: ['hot', 'heat', 'sweat'] },
  { emoji: '🥶', keywords: ['cold', 'freezing', 'ice'] },
  { emoji: '🥴', keywords: ['woozy', 'drunk', 'dizzy'] },
  { emoji: '😵', keywords: ['dizzy', 'dead', 'shock'] },
  { emoji: '🤯', keywords: ['mindblown', 'explosion', 'boom', 'wow'] },
  { emoji: '🤠', keywords: ['cowboy', 'hat', 'yeehaw'] },
  { emoji: '🥳', keywords: ['party', 'celebrate', 'tada', 'birthday'] },
  { emoji: '😎', keywords: ['cool', 'sunglasses', 'boss'] },
  { emoji: '🤓', keywords: ['nerd', 'geek', 'glasses'] },
  { emoji: '🧐', keywords: ['monocle', 'investigate', 'search'] },
  { emoji: '👍', keywords: ['thumbsup', 'like', 'yes', 'good', 'ok', 'agree'] },
  { emoji: '👎', keywords: ['thumbsdown', 'dislike', 'no', 'bad'] },
  { emoji: '👊', keywords: ['punch', 'fist', 'bump'] },
  { emoji: '✊', keywords: ['fist', 'power', 'solidarity'] },
  { emoji: '🤞', keywords: ['crossed', 'fingers', 'luck', 'hope'] },
  { emoji: '✌️', keywords: ['peace', 'victory', 'two'] },
  { emoji: '🤟', keywords: ['love', 'rock', 'hand'] },
  { emoji: '🤘', keywords: ['rock', 'horns', 'metal'] },
  { emoji: '👌', keywords: ['ok', 'perfect', 'nice', 'good'] },
  { emoji: '🤌', keywords: ['chef', 'italian', 'pinched'] },
  { emoji: '👈', keywords: ['left', 'point'] },
  { emoji: '👉', keywords: ['right', 'point'] },
  { emoji: '👆', keywords: ['up', 'point'] },
  { emoji: '👇', keywords: ['down', 'point'] },
  { emoji: '✋', keywords: ['stop', 'hand', 'highfive'] },
  { emoji: '👋', keywords: ['wave', 'hello', 'hi', 'bye'] },
  { emoji: '💪', keywords: ['bicep', 'strong', 'power', 'gym', 'flex'] },
  { emoji: '🙏', keywords: ['pray', 'thanks', 'thankyou', 'please', 'hope'] },
  { emoji: '🤝', keywords: ['handshake', 'deal', 'agree', 'partner'] },
  { emoji: '🐶', keywords: ['dog', 'puppy', 'pet', 'animal', 'woof'] },
  { emoji: '🐱', keywords: ['cat', 'kitty', 'pet', 'animal', 'meow'] },
  { emoji: '🐭', keywords: ['mouse', 'rat', 'animal'] },
  { emoji: '🐹', keywords: ['hamster', 'pet', 'cute'] },
  { emoji: '🐰', keywords: ['rabbit', 'bunny', 'easter'] },
  { emoji: '🦊', keywords: ['fox', 'animal', 'clever'] },
  { emoji: '🐻', keywords: ['bear', 'animal', 'teddy'] },
  { emoji: '🐼', keywords: ['panda', 'cute', 'bamboo'] },
  { emoji: '🐨', keywords: ['koala', 'australia'] },
  { emoji: '🐯', keywords: ['tiger', 'cat', 'wild'] },
  { emoji: '🦁', keywords: ['lion', 'king', 'roar'] },
  { emoji: '🐮', keywords: ['cow', 'moo', 'farm'] },
  { emoji: '🐷', keywords: ['pig', 'oink', 'farm'] },
  { emoji: '🐸', keywords: ['frog', 'toad', 'kermit'] },
  { emoji: '🐵', keywords: ['monkey', 'ape', 'cute'] },
  { emoji: '🙈', keywords: ['see', 'no', 'evil', 'monkey', 'shy'] },
  { emoji: '🙉', keywords: ['hear', 'no', 'evil', 'monkey'] },
  { emoji: '🙊', keywords: ['speak', 'no', 'evil', 'monkey', 'secret'] },
  { emoji: '🐔', keywords: ['chicken', 'rooster', 'hen'] },
  { emoji: '🐧', keywords: ['penguin', 'bird', 'cold'] },
  { emoji: '🐦', keywords: ['bird', 'tweet', 'fly'] },
  { emoji: '🦄', keywords: ['unicorn', 'magic', 'horse'] },
  { emoji: '🍕', keywords: ['pizza', 'food', 'cheese', 'slice', 'italian'] },
  { emoji: '🍟', keywords: ['fries', 'french', 'food', 'fastfood'] },
  { emoji: '🍔', keywords: ['burger', 'hamburger', 'food', 'fastfood'] },
  { emoji: '🌭', keywords: ['hotdog', 'sausage', 'food'] },
  { emoji: '🌮', keywords: ['taco', 'mexican', 'food'] },
  { emoji: '🍿', keywords: ['popcorn', 'movie', 'cinema', 'snack'] },
  { emoji: '🍩', keywords: ['donut', 'doughnut', 'sweet', 'food'] },
  { emoji: '🍦', keywords: ['icecream', 'sweet', 'cold', 'dessert'] },
  { emoji: '🎂', keywords: ['cake', 'birthday', 'party', 'celebrate'] },
  { emoji: '☕', keywords: ['coffee', 'tea', 'drink', 'morning'] },
  { emoji: '🍺', keywords: ['beer', 'cheers', 'drink', 'alcohol'] },
  { emoji: '🥂', keywords: ['clinking', 'cheers', 'celebrate', 'toast'] },
  { emoji: '💡', keywords: ['light', 'bulb', 'idea', 'bright'] },
  { emoji: '🔥', keywords: ['fire', 'flame', 'lit', 'hot', 'burn'] },
  { emoji: '⚡', keywords: ['zap', 'lightning', 'electric', 'fast', 'thunder'] },
  { emoji: '✨', keywords: ['sparkles', 'magic', 'clean', 'shine', 'star'] },
  { emoji: '🎉', keywords: ['tada', 'party', 'celebrate', 'popper'] },
  { emoji: '❤️', keywords: ['heart', 'love', 'red', 'like'] },
  { emoji: '💔', keywords: ['broken', 'heart', 'sad', 'breakup'] },
  { emoji: '💯', keywords: ['hundred', 'score', 'perfect', '100'] },
  { emoji: '🚀', keywords: ['rocket', 'launch', 'fast', 'space', 'moon'] }
];

export const EMOJI_CATEGORIES = {
  smileys: EMOJI_DATABASE.slice(0, 58).map(e => e.emoji),
  gestures: EMOJI_DATABASE.slice(58, 77).map(e => e.emoji),
  animals: EMOJI_DATABASE.slice(77, 98).map(e => e.emoji),
  food: EMOJI_DATABASE.slice(98, 109).map(e => e.emoji),
  objects: EMOJI_DATABASE.slice(109, 114).map(e => e.emoji),
  symbols: EMOJI_DATABASE.slice(114).map(e => e.emoji)
};

export const RICH_GIF_CATALOG = [
  { url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', trending: true, tags: ['trending', 'laugh', 'funny', 'hha', 'lol'] },
  { url: 'https://media.giphy.com/media/3o7TKsjN41iDfsu6M8/giphy.gif', trending: true, tags: ['trending', 'dance', 'happy', 'party'] },
  { url: 'https://media.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif', trending: true, tags: ['trending', 'funny', 'cat', 'lol', 'animal'] },
  { url: 'https://media.giphy.com/media/d31w24psGYeekCXY/giphy.gif', trending: true, tags: ['trending', 'reaction', 'shock', 'wow', 'omg'] },
  { url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif', trending: true, tags: ['trending', 'clap', 'applause', 'bravo'] },
  { url: 'https://media.giphy.com/media/xT9IgG5083m3gVvxbO/giphy.gif', trending: true, tags: ['trending', 'love', 'heart', 'hug'] },
  { url: 'https://media.giphy.com/media/l3fQf1OEAq0iri9RC/giphy.gif', tags: ['funny', 'meme', 'joke', 'fail'] },
  { url: 'https://media.giphy.com/media/xT9IgN8YKRGByGv528/giphy.gif', tags: ['funny', 'laugh', 'crazy', 'fun'] },
  { url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif', tags: ['funny', 'popcorn', 'movie', 'wait'] },
  { url: 'https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif', tags: ['funny', 'dog', 'cute', 'spin'] },
  { url: 'https://media.giphy.com/media/l0HlVJROD4h4vFupG/giphy.gif', tags: ['funny', 'minion', 'jump', 'joy'] },
  { url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', tags: ['reaction', 'wow', 'mindblown', 'boom'] },
  { url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif', tags: ['reaction', 'blink', 'confused', 'what'] },
  { url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif', tags: ['reaction', 'nod', 'yes', 'agree'] },
  { url: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif', tags: ['reaction', 'love', 'heart', 'kiss'] },
  { url: 'https://media.giphy.com/media/l2JIdnF6aJcAqzDgY/giphy.gif', tags: ['party', 'dance', 'celebrate', 'tada'] },
  { url: 'https://media.giphy.com/media/3o7TKDkDbIDJieKbVm/giphy.gif', tags: ['party', 'cheers', 'drink', 'beer'] },
  { url: 'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif', tags: ['party', 'confetti', 'disco', 'dance'] },
  { url: 'https://media.giphy.com/media/13cptIwEQzsZOE/giphy.gif', tags: ['anime', 'fight', 'power', 'cool'] },
  { url: 'https://media.giphy.com/media/1081WjFuvDbaWC/giphy.gif', tags: ['anime', 'run', 'fast', 'naruto'] },
  { url: 'https://media.giphy.com/media/kX7OWlNvL253e/giphy.gif', tags: ['anime', 'cute', 'eat', 'food'] },
  { url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', tags: ['gaming', 'mario', 'win', 'game'] },
  { url: 'https://media.giphy.com/media/l3vR85PnGsBwu1PfG/giphy.gif', tags: ['gaming', 'controller', 'play', 'gamer'] },
  { url: 'https://media.giphy.com/media/3oEduV4NOSCI48G4Wk/giphy.gif', tags: ['gaming', 'pixel', 'arcade', 'retro'] }
];

function isValidGifId(gifId) {
  return Number.isInteger(gifId) && gifId >= 0 && gifId < RICH_GIF_CATALOG.length;
}

export function setConnectionStatus(text, statusState = 'disconnected') {
  const navLabel = document.getElementById('navConnectionState');
  const sidebarLabel = document.getElementById('sidebarConnectionState');
  const detailLabel = document.getElementById('connection-state-detail');
  const dot = document.getElementById('connectionDot');

  if (navLabel) navLabel.textContent = text;
  if (sidebarLabel) sidebarLabel.textContent = text;
  if (detailLabel) detailLabel.textContent = text;

  if (dot) {
    dot.className = 'status-dot';
    if (statusState === 'connected') dot.classList.add('connected');
    if (statusState === 'connecting') dot.classList.add('connecting');
  }

  if (statusState !== 'connected' || !state.connectionHealthMeasured) updateConnectionHealth(null);
}

export function showConfirmDialog(message, { title = 'Please confirm', confirmText = 'Allow', cancelText = 'Cancel' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'chitlan-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;background:var(--modal-overlay-85);display:grid;place-items:center;padding:20px;';
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'width:min(420px,100%);background:var(--modal-bg);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:22px;box-shadow:0 20px 60px var(--shadow-dark-50);';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const description = document.createElement('p');
    description.textContent = message;
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:20px;';
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(value);
    };
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dialog-button';
    cancel.textContent = cancelText;
    cancel.addEventListener('click', () => finish(false));
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'dialog-button primary';
    confirm.textContent = confirmText;
    confirm.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false);
    });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') finish(false);
    });
    actions.append(cancel, confirm);
    panel.append(heading, description, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    confirm.focus();
  });
}

export function updateProfileUI(nickname, color, role) {
  const avatar = document.getElementById('profileAvatar');
  const nameLabel = document.getElementById('profileName');
  const roleLabel = document.getElementById('profileRole');
  const currentRoleLabel = document.getElementById('currentRole');
  const hostControls = document.getElementById('hostControls');

  if (avatar) {
    avatar.textContent = (nickname || 'G').charAt(0).toUpperCase();
    avatar.style.background = color || 'var(--primary)';
  }

  if (nameLabel) nameLabel.textContent = nickname || 'Guest User';
  if (roleLabel) roleLabel.textContent = role === 'host' ? 'Host' : 'Peer';
  if (currentRoleLabel) currentRoleLabel.textContent = role === 'host' ? 'Host' : 'Peer';

  if (hostControls) {
    hostControls.style.display = role === 'host' ? 'flex' : 'none';
  }
}

export function renderUserList(users) {
  const container = document.getElementById('userNames');
  const peerCount = document.getElementById('peerCount');
  const statUsers = document.getElementById('statUsers');

  if (!container) return;

  container.replaceChildren();

  if (!users || users.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Waiting for users...';
    container.appendChild(empty);
    if (peerCount) peerCount.textContent = '0';
    if (statUsers) statUsers.textContent = '1';
    return;
  }

  users.forEach(member => {
    const name = member.nickname || 'Peer';
    const isMe = member.peerId === state.peer?.id;
    const cleanName = name;
    const displayName = `${name}${isMe ? ' (You)' : ''}`;
    const item = document.createElement('div');
    item.className = 'user';

    let kickBtnHtml = '';
    if (state.isHost && !isMe) {
      kickBtnHtml = `<button class="kick-btn" title="Remove ${safeText(cleanName)} from room">❌ Kick</button>`;
    }

    const dot = document.createElement('span');
    dot.className = 'user-dot';
    const label = document.createElement('span');
    label.className = 'user-name';
    label.textContent = displayName;
    item.append(dot, label);

    if (state.isHost && !isMe) {
      const btn = document.createElement('button');
      btn.className = 'kick-btn';
      btn.type = 'button';
      btn.textContent = 'Kick';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        import('./peer.js').then(m => m.kickParticipant(member.peerId));
      });
      item.appendChild(btn);
      if (member.isSharing) {
        const stopShareBtn = document.createElement('button');
        stopShareBtn.className = 'kick-btn';
        stopShareBtn.type = 'button';
        stopShareBtn.textContent = 'Stop sharing';
        stopShareBtn.addEventListener('click', e => {
          e.stopPropagation();
          import('./screen.js').then(module => module.forceStopScreenShare(member.peerId));
        });
        item.appendChild(stopShareBtn);
      }
    }

    container.appendChild(item);
  });

  const count = users.length;
  if (peerCount) peerCount.textContent = Math.max(0, count - 1);
  if (statUsers) statUsers.textContent = count;
}

export function appendMessage(sender, msg, color = '#60a5fa', isSender = false, timestamp = Date.now(), fromPeerId = null, { persist = true, notify = true, gifId = null } = {}) {
  if (gifId !== null && !isValidGifId(gifId)) return;
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;

  const welcomeCard = messagesDiv.querySelector('.welcome-card');
  if (welcomeCard) welcomeCard.remove();

  const div = document.createElement('div');
  const isOwnMessage = isSender || (!!fromPeerId && fromPeerId === state.peer?.id);
  div.className = 'message ' + (isOwnMessage ? 'right self' : 'left');

  const formattedTime = formatMessageTime(timestamp);
  const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#60a5fa';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.backgroundColor = safeColor;
  avatar.textContent = String(sender || '').charAt(0).toUpperCase();
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const senderLabel = document.createElement('strong');
  senderLabel.style.color = safeColor;
  senderLabel.textContent = sender || 'Peer';
  const content = document.createElement('div');
  if (gifId !== null) {
    const image = document.createElement('img');
    image.src = RICH_GIF_CATALOG[gifId].url;
    image.alt = 'GIF';
    image.className = 'gif-message-img';
    image.addEventListener('error', () => image.remove(), { once: true });
    content.appendChild(image);
  } else {
    content.textContent = String(msg ?? '');
  }
  const messageTime = document.createElement('div');
  messageTime.className = 'message-time';
  messageTime.textContent = formattedTime;
  bubble.append(senderLabel, content, messageTime);
  div.append(avatar, bubble);

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  state.messagesSent++;
  const msgCountEl = document.getElementById('messageCount');
  const statMsgEl = document.getElementById('statMessages');
  if (msgCountEl) msgCountEl.textContent = state.messagesSent;
  if (statMsgEl) statMsgEl.textContent = state.messagesSent;

  if (persist && sender !== 'System') {
    saveChatMessage({
      sender: String(sender || 'Peer'),
      message: String(msg ?? ''),
      color: safeColor,
      timestamp: Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now(),
      ...(gifId !== null ? { gifId } : {}),
      fromPeerId,
      isOwn: isOwnMessage
    });
  }

  if (notify && !isOwnMessage && sender !== 'System') {
    playNotificationSound();

    if (!state.pageFocused) {
      state.unreadCount++;
      document.title = `(${state.unreadCount}) ChitLAN`;
    }
  }
}

export function appendSystemMessage(msg) {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;

  const welcomeCard = messagesDiv.querySelector('.welcome-card');
  if (welcomeCard) welcomeCard.remove();

  const div = document.createElement('div');
  div.className = 'message system';
  div.innerHTML = `
    <div class="system-bubble">
      <span>🔔 ${safeText(msg)}</span>
      <time>${formatMessageTime(Date.now())}</time>
    </div>
  `;

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  addActivityItem('System Notification', msg);
}

export function updateConnectionHealth(latencyMs) {
  const latencyEl = document.getElementById('latency');
  const qualityEl = document.getElementById('connectionQuality');

  const hasConnection = !!state.peer && (!!state.conn || !!(state.isHost && state.connections.length));
  state.connectionHealthMeasured = hasConnection && Number.isFinite(latencyMs);
  if (latencyEl) latencyEl.textContent = !hasConnection ? 'Offline' : (state.connectionHealthMeasured ? `${latencyMs} ms` : 'Measuring...');

  if (qualityEl) {
    let quality = 'Measuring...';
    let color = '#94a3b8';

    if (!hasConnection) {
      quality = 'Offline';
      color = '#ef4444';
    } else if (!state.connectionHealthMeasured) {
      quality = 'Measuring...';
      color = '#94a3b8';
    } else if (latencyMs < 70) {
      quality = 'Excellent';
      color = '#34d399';
    } else if (latencyMs && latencyMs > 300) {
      quality = 'Poor';
      color = '#f59e0b';
    } else if (latencyMs && latencyMs > 150) {
      quality = 'Fair';
      color = '#fbbf24';
    } else if (latencyMs && latencyMs > 70) {
      quality = 'Good';
      color = '#22d3ee';
    }

    qualityEl.textContent = quality;
    qualityEl.style.color = color;
  }
}

export function renderEmojis(category = 'smileys', query = '') {
  const grid = document.getElementById('emojiGrid');
  if (!grid) return;

  grid.innerHTML = '';
  let emojis = [];

  const trimmedQuery = query.trim().toLowerCase();

  if (trimmedQuery) {
    emojis = EMOJI_DATABASE.filter(item => {
      return item.emoji === trimmedQuery || item.keywords.some(k => k.includes(trimmedQuery));
    }).map(e => e.emoji);

    if (emojis.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 20px; font-size: 13px;">No matching emojis found</div>';
      return;
    }
  } else {
    emojis = EMOJI_CATEGORIES[category] || EMOJI_CATEGORIES.smileys;
  }

  emojis.forEach(emoji => {
    const item = document.createElement('div');
    item.className = 'emoji-item';
    item.textContent = emoji;
    item.addEventListener('click', () => {
      const msgInput = document.getElementById('msg-input');
      if (msgInput) {
        const start = msgInput.selectionStart ?? msgInput.value.length;
        const end = msgInput.selectionEnd ?? start;
        msgInput.setRangeText(emoji, start, end, 'end');
        msgInput.focus();
      }
    });
    grid.appendChild(item);
  });
}

export function toggleEmojiPicker() {
  const popover = document.getElementById('emojiPicker');
  if (!popover) return;

  const isVisible = popover.style.display !== 'none';
  if (isVisible) {
    popover.style.display = 'none';
  } else {
    popover.style.display = 'flex';
    renderEmojis('smileys');
  }
}

export function openGifModal() {
  const modal = document.getElementById('gifModal');
  if (modal) {
    modal.style.display = 'flex';
    loadGifs('trending');
  }
}

export function closeGifModal() {
  const modal = document.getElementById('gifModal');
  if (modal) modal.style.display = 'none';
}

export function loadGifs(categoryOrQuery = 'trending') {
  const grid = document.getElementById('gifGrid');
  if (!grid) return;
  const renderId = ++gifRenderId;
  const query = categoryOrQuery.trim().toLowerCase();
  const gifs = query === 'trending'
    ? RICH_GIF_CATALOG.filter(item => item.trending)
    : RICH_GIF_CATALOG.filter(item => item.tags.some(tag => tag.includes(query)));
  grid.replaceChildren();

  const showEmptyMessage = () => {
    if (renderId !== gifRenderId) return;
    if (grid.querySelector('.gif-item')) return;
    const empty = document.createElement('div');
    empty.className = 'gif-empty';
    empty.textContent = query ? `No GIFs for '${categoryOrQuery.trim()}'` : 'No GIFs available';
    grid.replaceChildren(empty);
  };

  if (gifs.length === 0) {
    showEmptyMessage();
    return;
  }

  gifs.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gif-item';
    const image = document.createElement('img');
    image.src = item.url;
    image.alt = 'GIF';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      card.remove();
      showEmptyMessage();
    }, { once: true });
    card.addEventListener('click', () => {
      sendGifMessage(RICH_GIF_CATALOG.indexOf(item));
      closeGifModal();
    });
    card.appendChild(image);
    grid.appendChild(card);
  });
}

export function sendGifMessage(gifId) {
  if (!isValidGifId(gifId)) return;
  const timestamp = Date.now();
  appendMessage(state.myNickname || 'You', '', state.myColor, true, timestamp, state.peer?.id || null, { gifId });

  if (state.isHost) {
    import('./peer.js').then(m => {
      m.broadcastGif(gifId, timestamp);
    });
  } else if (state.conn) {
    state.conn.send({ type: 'gif', gifId, timestamp });
  }

  showToast('GIF sent!', 'success');
}

export function addActivityItem(title, subtitle) {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;

  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-dot"></div>
    <div>
      <p>${safeText(title)}</p>
      <span>${safeText(subtitle)}</span>
    </div>
  `;

  feed.prepend(item);

  while (feed.children.length > 8) {
    feed.removeChild(feed.lastChild);
  }
}

export function showTypingIndicator(name, peerId = '') {
  const key = peerId || `name:${String(name || 'Peer')}`;
  const existing = typingPeers.get(key);
  if (existing) clearManagedTimeout(existing.timeoutId);
  const timeoutId = scheduleTimeout(() => {
    typingPeers.delete(key);
    renderTypingIndicator();
  }, 1800);
  typingPeers.set(key, { name: String(name || 'Peer'), timeoutId });
  renderTypingIndicator();
}

export function hideTypingIndicator(peerId = null) {
  if (peerId == null) {
    typingPeers.forEach(entry => clearManagedTimeout(entry.timeoutId));
    typingPeers.clear();
  } else {
    const entry = typingPeers.get(peerId);
    if (entry) clearManagedTimeout(entry.timeoutId);
    typingPeers.delete(peerId);
  }
  renderTypingIndicator();
}

export function playNotificationSound() {
  const sound = document.getElementById('notificationSound');
  if (!sound) return;

  if (sound.getAttribute('src') !== NOTIFICATION_SOUND_SRC) {
    sound.setAttribute('src', NOTIFICATION_SOUND_SRC);
    sound.load();
  }

  sound.currentTime = 0;
  sound.play().catch(() => {});
}

export function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch (error) {}
  showToast(`Switched to ${isLight ? 'Light' : 'Dark'} Mode`, 'info');
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (error) {}
  const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
  const useLight = saved === 'light' || (saved !== 'dark' && prefersLight);
  document.body.classList.toggle('light', useLight);
  document.documentElement.style.colorScheme = useLight ? 'light' : 'dark';
}

export function restoreChatHistory(roomCode = state.roomCode) {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;
  const welcomeCard = messagesDiv.querySelector('.welcome-card')?.cloneNode(true);
  const history = readChatHistory(roomCode);
  state.messagesSent = 0;
  const msgCountEl = document.getElementById('messageCount');
  const statMsgEl = document.getElementById('statMessages');
  if (msgCountEl) msgCountEl.textContent = '0';
  if (statMsgEl) statMsgEl.textContent = '0';
  messagesDiv.replaceChildren();
  if (history.length) {
    const divider = document.createElement('div');
    divider.className = 'message history-divider';
    divider.textContent = 'Earlier messages';
    messagesDiv.appendChild(divider);
    history.forEach(entry => {
      if (entry.isHtml) {
        appendMessage(entry.sender, '[GIF]', entry.color, !!entry.isOwn, entry.timestamp, entry.fromPeerId || null, {
          persist: false,
          notify: false
        });
      } else {
        appendMessage(entry.sender, entry.message, entry.color, !!entry.isOwn, entry.timestamp, entry.fromPeerId || null, {
          persist: false,
          notify: false,
          ...(isValidGifId(entry.gifId) ? { gifId: entry.gifId } : {})
        });
      }
    });
  } else {
    if (welcomeCard) {
      messagesDiv.appendChild(welcomeCard);
    } else {
      const card = document.createElement('div');
      card.className = 'welcome-card';
      const heading = document.createElement('h2');
      heading.textContent = 'Your room is ready';
      const description = document.createElement('p');
      description.textContent = 'Messages will appear here.';
      card.append(heading, description);
      messagesDiv.appendChild(card);
    }
  }
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

export function exportChat() {
  const history = readChatHistory();
  const lines = history.map(entry => {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const message = entry.isHtml || isValidGifId(entry.gifId) ? '[GIF]' : entry.message;
    return `[${timestamp}] ${entry.sender}: ${message}`;
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chitlan-chat-${state.roomCode || 'history'}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function clearChat() {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;

  const storageKey = chatHistoryStorageKey();
  if (storageKey) {
    try { localStorage.removeItem(storageKey); } catch (error) {}
  }

  messagesDiv.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-icon">🚀</div>
      <h2>Chat Cleared</h2>
      <p>Workspace message history has been cleared.</p>
    </div>
  `;
  state.messagesSent = 0;
  const msgCountEl = document.getElementById('messageCount');
  const statMsgEl = document.getElementById('statMessages');
  if (msgCountEl) msgCountEl.textContent = '0';
  if (statMsgEl) statMsgEl.textContent = '0';

  showToast('Chat history cleared', 'info');
}

export function startSessionTimer() {
  clearManagedInterval(state.sessionTimerId);
  state.sessionStartTime = Date.now();

  const durationEl = document.getElementById('statDuration');
  if (!durationEl) return;

  state.sessionTimerId = scheduleInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
    durationEl.textContent = `${mins}:${secs}`;
  }, 1000);
}
