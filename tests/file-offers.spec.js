import { test, expect } from '@playwright/test';
import {
  acceptFile,
  closeContexts,
  fileCard,
  joinRoom,
  startHost,
  storedFileNames
} from './helpers.js';

function patternedBytes(size) {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 13 + 5) % 256;
  return bytes;
}

// Counts file chunks arriving on the host's connections from now on.
async function countHostChunks(page) {
  await page.evaluate(() => {
    window.__fileChunks = 0;
    window.state.connections.forEach(connection => connection.on('data', data => {
      if (data?.type === 'file-chunk') window.__fileChunks++;
    }));
  });
}

test('@network a declined file sends no chunks and never touches storage', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts, { debug: true });
    const joiner = await joinRoom(browser, 'File Sender', host.roomCode, contexts);
    await countHostChunks(host.page);

    await joiner.page.locator('#fileInput').setInputFiles({
      name: 'decline-me.bin',
      mimeType: 'application/octet-stream',
      buffer: patternedBytes(1024 * 1024)
    });
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());

    const hostCard = fileCard(host.page, 'decline-me.bin');
    await expect(hostCard.locator('.file-status')).toContainText('wants to send you this file', { timeout: 60_000 });
    await hostCard.getByRole('button', { name: 'Decline', exact: true }).click();

    await expect(hostCard.locator('.file-status')).toHaveText('Declined');
    await expect(fileCard(joiner.page, 'decline-me.bin').locator('.file-status')).toHaveText('Not accepted', { timeout: 30_000 });
    // Give any stray chunks time to arrive before checking that none did.
    await host.page.waitForTimeout(2_000);
    expect(await host.page.evaluate(() => window.__fileChunks)).toBe(0);
    expect(await storedFileNames(host.page)).toEqual([]);
  } finally {
    await closeContexts(contexts);
  }
});

test('@network cancelling mid-transfer stops both sides and cleans up storage', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'File Sender', host.roomCode, contexts);

    await joiner.page.locator('#fileInput').setInputFiles({
      name: 'cancel-me.bin',
      mimeType: 'application/octet-stream',
      buffer: patternedBytes(40 * 1024 * 1024)
    });
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());
    await acceptFile(host.page, 'cancel-me.bin');

    const hostCard = fileCard(host.page, 'cancel-me.bin');
    await expect(hostCard.locator('.file-status')).toHaveText(/Receiving… [1-9]/, { timeout: 60_000 });
    await fileCard(joiner.page, 'cancel-me.bin').getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(fileCard(joiner.page, 'cancel-me.bin').locator('.file-status')).toHaveText('Cancelled');
    await expect(hostCard.locator('.file-status')).toHaveText('Cancelled by File Sender', { timeout: 30_000 });
    await expect(hostCard.getByRole('link', { name: /Download/ })).toHaveCount(0);
    await expect.poll(() => storedFileNames(host.page), { timeout: 10_000 }).toEqual([]);
  } finally {
    await closeContexts(contexts);
  }
});

test('@network two dropped files are queued and both arrive', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'File Sender', host.roomCode, contexts);

    await joiner.page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['first file contents'], 'first.txt', { type: 'text/plain' }));
      transfer.items.add(new File(['second file contents'], 'second.txt', { type: 'text/plain' }));
      document.querySelector('.chat-container').dispatchEvent(new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true
      }));
    });
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());
    await expect(fileCard(joiner.page, 'first.txt').locator('.file-queue-note')).toHaveText('Queued (1 more)');

    await acceptFile(host.page, 'first.txt');
    await expect(fileCard(host.page, 'first.txt').locator('.file-status')).toHaveText('File received', { timeout: 60_000 });
    await acceptFile(host.page, 'second.txt');
    await expect(fileCard(host.page, 'second.txt').locator('.file-status')).toHaveText('File received', { timeout: 60_000 });

    await expect(fileCard(joiner.page, 'first.txt').locator('.file-status')).toHaveText('File sent');
    await expect(fileCard(joiner.page, 'second.txt').locator('.file-status')).toHaveText('File sent');
  } finally {
    await closeContexts(contexts);
  }
});
