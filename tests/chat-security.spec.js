import { test, expect } from '@playwright/test';
import { closeContexts, joinRoom, sendChat, startHost } from './helpers.js';

test('@network host and joiner exchange chat through a room invite', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Host', contexts);
    const joiner = await joinRoom(browser, 'Joiner', host.roomCode, contexts);
 
    await sendChat(host.page, 'hello from host');
    await expect(joiner.page.locator('#messages')).toContainText('hello from host');

    await sendChat(joiner.page, 'hello from joiner');
    await expect(host.page.locator('#messages')).toContainText('hello from joiner');
  } finally {
    await closeContexts(contexts);
  }
});

test('@network hostile message and color are rendered as text without a dialog', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Host', contexts);
    let dialogCount = 0;
    host.page.on('dialog', async dialog => {
      dialogCount += 1;
      await dialog.dismiss();
    });
    const joiner = await joinRoom(browser, 'Untrusted peer', host.roomCode, contexts, { debug: true });
    const payload = '<img src=x onerror=alert("xss")>';
    const hostileColor = 'url("javascript:alert(1)")';

    await joiner.page.evaluate(({ message, color }) => {
      window.state.conn.send({
        type: 'message',
        nickname: 'Untrusted peer',
        message,
        color,
        timestamp: Date.now(),
        isHtml: true
      });
    }, { message: payload, color: hostileColor });

    const message = host.page.locator('#messages .message').filter({ hasText: payload }).last();
    await expect(message).toContainText(payload);
    await expect(message.locator('img, script')).toHaveCount(0);
    await expect(message.locator('.avatar')).toHaveCSS('background-color', 'rgb(96, 165, 250)');
    await expect.poll(() => dialogCount, { timeout: 1_000 }).toBe(0);
  } finally {
    await closeContexts(contexts);
  }
});

test('@network joiner cannot forge the displayed chat sender', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Owner', contexts);
    const joiner = await joinRoom(browser, 'Actual Member', host.roomCode, contexts, { debug: true });
    const messageText = 'forged sender check';

    await joiner.page.evaluate(message => {
      window.state.conn.send({ type: 'system', message: 'forged system marker' });
      window.state.conn.send({
        type: 'message',
        nickname: 'System',
        color: '#ff0000',
        message,
        isHtml: true,
        timestamp: Date.now()
      });
    }, messageText);

    const message = host.page.locator('#messages .message').filter({ hasText: messageText }).last();
    await expect(message.locator('strong')).toHaveText('Actual Member');
    await expect(message.locator('strong')).not.toHaveCSS('color', 'rgb(255, 0, 0)');
    await expect(message).toHaveClass(/left/);
    await expect(host.page.locator('#messages .message.system').filter({ hasText: 'forged system marker' })).toHaveCount(0);
  } finally {
    await closeContexts(contexts);
  }
});

test('@network GIF chat accepts only catalog IDs', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Owner', contexts);
    const joiner = await joinRoom(browser, 'GIF Sender', host.roomCode, contexts, { debug: true });
    await host.context.route('https://media.giphy.com/**', route => route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64')
    }));

    const marker = 'unknown gif was dropped';
    await joiner.page.evaluate(message => {
      window.state.conn.send({ type: 'gif', gifId: 99999, timestamp: Date.now() });
      window.state.conn.send({
        type: 'message', nickname: 'GIF Sender', color: '#60a5fa', message, timestamp: Date.now()
      });
    }, marker);
    await expect(host.page.locator('#messages')).toContainText(marker);
    await expect(host.page.locator('#messages .gif-message-img')).toHaveCount(0);

    const catalogUrl = await host.page.evaluate(async () => {
      const ui = await import('./js/ui.js');
      return ui.RICH_GIF_CATALOG[0].url;
    });
    await joiner.page.evaluate(() => {
      window.state.conn.send({ type: 'gif', gifId: 0, timestamp: Date.now() });
    });

    const gifImage = host.page.locator('#messages .gif-message-img');
    await expect(gifImage).toHaveCount(1);
    await expect(gifImage).toHaveAttribute('src', catalogUrl);
    await expect(gifImage).toHaveAttribute('alt', 'GIF');
  } finally {
    await closeContexts(contexts);
  }
});
