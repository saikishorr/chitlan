import state from './state.js';
import { safeText, formatMessageTime, showToast } from './utils.js';
import { NOTIFICATION_SOUND_SRC, THEME_KEY } from './constants.js';

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
  { url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', tags: ['trending', 'laugh', 'funny', 'hha', 'lol'] },
  { url: 'https://media.giphy.com/media/3o7TKsjN41iDfsu6M8/giphy.gif', tags: ['trending', 'dance', 'happy', 'party'] },
  { url: 'https://media.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif', tags: ['trending', 'funny', 'cat', 'lol', 'animal'] },
  { url: 'https://media.giphy.com/media/d31w24psGYeekCXY/giphy.gif', tags: ['trending', 'reaction', 'shock', 'wow', 'omg'] },
  { url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif', tags: ['trending', 'clap', 'applause', 'bravo'] },
  { url: 'https://media.giphy.com/media/xT9IgG5083m3gVvxbO/giphy.gif', tags: ['trending', 'love', 'heart', 'hug'] },
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

export function setConnectionStatus(text, statusState = 'disconnected') {
  const navLabel = document.getElementById('navConnectionState');
  const sidebarLabel = document.getElementById('sidebarConnectionState');
  const dot = document.getElementById('connectionDot');

  if (navLabel) navLabel.textContent = text;
  if (sidebarLabel) sidebarLabel.textContent = text;

  if (dot) {
    dot.className = 'status-dot';
    if (statusState === 'connected') dot.classList.add('connected');
    if (statusState === 'connecting') dot.classList.add('connecting');
  }

  updateConnectionHealth(statusState === 'connected' ? 8 : null);
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

  container.innerHTML = '';

  if (!users || users.length === 0) {
    container.innerHTML = '<div class="empty-state">Waiting for users...</div>';
    if (peerCount) peerCount.textContent = '0';
    if (statUsers) statUsers.textContent = '1';
    return;
  }

  users.forEach(name => {
    const isMe = name.includes('(You)');
    const cleanName = name.replace(' (You)', '');
    const item = document.createElement('div');
    item.className = 'user';

    let kickBtnHtml = '';
    if (state.isHost && !isMe) {
      kickBtnHtml = `<button class="kick-btn" title="Remove ${safeText(cleanName)} from room">❌ Kick</button>`;
    }

    item.innerHTML = `
      <span class="user-dot"></span>
      <span class="user-name">${safeText(name)}</span>
      ${kickBtnHtml}
    `;

    if (state.isHost && !isMe) {
      const btn = item.querySelector('.kick-btn');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          import('./peer.js').then(m => m.kickParticipantByName(cleanName));
        });
      }
    }

    container.appendChild(item);
  });

  const count = users.length;
  if (peerCount) peerCount.textContent = Math.max(0, count - 1);
  if (statUsers) statUsers.textContent = count;
}

export function appendMessage(sender, msg, color = '#60a5fa', isSender = false, timestamp = Date.now(), isHtml = false) {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;

  const welcomeCard = messagesDiv.querySelector('.welcome-card');
  if (welcomeCard) welcomeCard.remove();

  const div = document.createElement('div');
  div.className = 'message ' + (isSender || sender === state.myNickname ? 'right self' : 'left');

  const safeMsg = isHtml ? msg : safeText(msg);
  const formattedTime = formatMessageTime(timestamp);
  const initialLetter = safeText(sender).charAt(0).toUpperCase();

  div.innerHTML = `
    <div class="avatar" style="background:${color}">${initialLetter}</div>
    <div class="bubble">
      <strong style="color:${color}">${safeText(sender)}</strong>
      <div>${safeMsg}</div>
      <div class="message-time">${formattedTime}</div>
    </div>
  `;

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  state.messagesSent++;
  const msgCountEl = document.getElementById('messageCount');
  const statMsgEl = document.getElementById('statMessages');
  if (msgCountEl) msgCountEl.textContent = state.messagesSent;
  if (statMsgEl) statMsgEl.textContent = state.messagesSent;

  if (!isSender && sender !== 'System') {
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

export function updateConnectionHealth(latencyMs, downSpeedText = '--', upSpeedText = '--') {
  const latencyEl = document.getElementById('latency');
  const downEl = document.getElementById('downloadSpeed');
  const upEl = document.getElementById('uploadSpeed');
  const qualityEl = document.getElementById('connectionQuality');

  if (latencyEl) {
    latencyEl.textContent = latencyMs ? `${latencyMs} ms` : (state.peer ? '8 ms' : '--');
  }

  if (downEl) downEl.textContent = downSpeedText;
  if (upEl) upEl.textContent = upSpeedText;

  if (qualityEl) {
    let quality = 'Excellent';
    let color = '#34d399';

    if (!state.peer) {
      quality = 'Offline';
      color = '#ef4444';
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
        msgInput.value += emoji;
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

  grid.innerHTML = '<div class="gif-loading">Loading GIFs...</div>';

  const query = categoryOrQuery.trim().toLowerCase();
  let gifs = [];

  if (query) {
    gifs = RICH_GIF_CATALOG.filter(item => {
      return item.tags.some(tag => tag.includes(query));
    }).map(item => item.url);
  }

  if (gifs.length === 0) {
    gifs = RICH_GIF_CATALOG.slice(0, 8).map(i => i.url);
  }

  setTimeout(() => {
    grid.innerHTML = '';
    gifs.forEach(url => {
      const card = document.createElement('div');
      card.className = 'gif-item';
      card.innerHTML = `<img src="${url}" alt="GIF" loading="lazy">`;
      card.addEventListener('click', () => {
        sendGifMessage(url);
        closeGifModal();
      });
      grid.appendChild(card);
    });
  }, 150);
}

export function sendGifMessage(gifUrl) {
  const timestamp = Date.now();
  const htmlContent = `<img src="${gifUrl}" class="gif-message-img" alt="GIF">`;

  appendMessage(state.myNickname || 'You', htmlContent, state.myColor, true, timestamp, true);

  const payload = {
    type: 'message',
    nickname: state.myNickname || 'User',
    color: state.myColor,
    message: htmlContent,
    isHtml: true,
    timestamp
  };

  if (state.isHost) {
    import('./peer.js').then(m => {
      m.broadcast(state.myNickname || 'Host', htmlContent, state.myColor, null, false, timestamp, true);
    });
  } else if (state.conn) {
    state.conn.send(payload);
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

export function showTypingIndicator(name) {
  const el = document.getElementById('typing-indicator');
  if (!el) return;

  el.textContent = `${safeText(name)} is typing...`;

  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    el.textContent = '';
  }, 1800);
}

export function hideTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.textContent = '';
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
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  showToast(`Switched to ${isDark ? 'Dark' : 'Light'} Mode`, 'info');
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }
}

export function clearChat() {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;

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
  if (state.sessionTimerId) clearInterval(state.sessionTimerId);
  state.sessionStartTime = Date.now();

  const durationEl = document.getElementById('statDuration');
  if (!durationEl) return;

  state.sessionTimerId = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
    durationEl.textContent = `${mins}:${secs}`;
  }, 1000);
}
