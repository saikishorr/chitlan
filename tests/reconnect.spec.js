import { test, expect } from '@playwright/test';
import { closeContexts, joinRoom, sendChat, startHost } from './helpers.js';

// Must be longer than RECONNECT_GRACE_MS in js/peer.js, so the old connection's
// delayed close handling has run before we check the roster.
const AFTER_GRACE_MS = 12_000;

async function hostRosterNames(page) {
  return (await page.locator('#userNames .user-name').allTextContents()).map(name => name.trim());
}

test('@network a joiner that reconnects appears once and still receives chat', async ({ browser }) => {
  test.setTimeout(240_000);
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'Rejoiner', host.roomCode, contexts, { debug: true });
    await expect(host.page.locator('#userNames .user-name')).toHaveCount(2);

    const reconnectNotices = host.page.locator('#messages .message.system', { hasText: 'Rejoiner reconnected' });

    for (let attempt = 1; attempt <= 3; attempt++) {
      await joiner.page.evaluate(() => window.state.conn.close());
      await expect(reconnectNotices).toHaveCount(attempt, { timeout: 60_000 });
      await expect(joiner.page.locator('#navConnectionState')).toContainText('Connected to room', { timeout: 60_000 });
      expect(await hostRosterNames(host.page)).toEqual(['Room Host (You)', 'Rejoiner']);
    }

    // Let the replaced connections' close events and the departure grace period run out.
    await host.page.waitForTimeout(AFTER_GRACE_MS);

    expect(await hostRosterNames(host.page)).toEqual(['Room Host (You)', 'Rejoiner']);
    await expect(host.page.locator('#messages')).not.toContainText('Rejoiner left the room');
    await expect(host.page.locator('#messages')).not.toContainText('Rejoiner (2)');

    await sendChat(host.page, 'still here after reconnects');
    await expect(joiner.page.locator('#messages')).toContainText('still here after reconnects');

    await sendChat(joiner.page, 'joiner can still talk');
    await expect(host.page.locator('#messages')).toContainText('joiner can still talk');
  } finally {
    await closeContexts(contexts);
  }
});
