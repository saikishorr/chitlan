import { expect } from '@playwright/test';

const APP_PATH = '/app.html';

export async function startHost(browser, nickname, contexts, { debug = false } = {}) {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(debug ? `${APP_PATH}?debug=1` : APP_PATH);
  await page.locator('#nickname').fill(nickname);
  await page.locator('#launchBtn').evaluate(button => button.click());
  await expect(page.locator('#peer-id')).toHaveValue(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/, {
    timeout: 90_000
  });
  await expect(page.locator('#navConnectionState')).toHaveText('Connected', { timeout: 30_000 });
  return { context, page, roomCode: await page.locator('#peer-id').inputValue() };
}

export async function joinRoom(browser, nickname, roomCode, contexts, { debug = false } = {}) {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const query = new URLSearchParams({ room: roomCode });
  if (debug) query.set('debug', '1');
  await page.goto(`${APP_PATH}?${query}`);
  await expect(page.locator('#quickJoinTitle')).toHaveText(`Join room ${roomCode}`);
  await page.locator('#quickNickname').fill(nickname);
  await page.locator('#quickJoinButton').evaluate(button => button.click());
  await expect(page.locator('#navConnectionState')).toContainText('Connected to room', {
    timeout: 90_000
  });
  return { context, page };
}

export function fileCard(page, fileName) {
  return page.locator('.file-message').filter({ hasText: fileName });
}

// Clicks Accept on the receiver's offer card for this file.
export async function acceptFile(page, fileName) {
  const card = fileCard(page, fileName);
  await expect(card.locator('.file-status')).toContainText('wants to send you this file', { timeout: 60_000 });
  await card.getByRole('button', { name: 'Accept', exact: true }).click();
}

// Names of ChitLAN files currently in the browser's private file storage.
export function storedFileNames(page) {
  return page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const names = [];
    for await (const [name] of directory.entries()) {
      if (name.startsWith('chitlan-file-')) names.push(name);
    }
    return names;
  });
}

export async function closeContexts(contexts) {
  await Promise.all(contexts.map(context => context.close().catch(() => {})));
}

export async function sendChat(page, message) {
  await page.locator('#msg-input').fill(message);
  await page.locator('#send-btn').click();
}

export async function watchToast(page, message) {
  await page.evaluate(toastMessage => {
    window.__toastCounts = window.__toastCounts || {};
    window.__toastCounts[toastMessage] = 0;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.toast') && node.textContent.trim() === toastMessage) {
            window.__toastCounts[toastMessage] += 1;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }, message);
}

export async function toastCount(page, message) {
  return page.evaluate(toastMessage => window.__toastCounts?.[toastMessage] || 0, message);
}
