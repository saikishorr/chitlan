import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  closeContexts,
  joinRoom,
  startHost,
  toastCount,
  watchToast
} from './helpers.js';

test('@network all three room members appear in every roster', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const first = await joinRoom(browser, 'Member A', host.roomCode, contexts);
    const second = await joinRoom(browser, 'Member B', host.roomCode, contexts);

    for (const page of [host.page, first.page, second.page]) {
      const roster = page.locator('#userNames .user-name');
      await expect(roster).toHaveCount(3);
      const names = await roster.allTextContents();
      for (const nickname of ['Room Host', 'Member A', 'Member B']) {
        expect(names.some(name => name.trim().startsWith(nickname))).toBeTruthy();
      }
    }
  } finally {
    await closeContexts(contexts);
  }
});

test('@network 2 MB file transfer completes once for sender and receiver', async ({ browser }) => {
  const contexts = [];
  const sentToast = 'File sent successfully!';
  const receivedToast = 'File transfer completed!';
  const expectedBytes = Buffer.alloc(2 * 1024 * 1024);
  for (let index = 0; index < expectedBytes.length; index++) {
    expectedBytes[index] = (index * 31 + 7) % 256;
  }
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'File Sender', host.roomCode, contexts);
    await watchToast(joiner.page, sentToast);
    await watchToast(host.page, receivedToast);

    await joiner.page.locator('#fileInput').setInputFiles({
      name: 'playwright-2mb.bin',
      mimeType: 'application/octet-stream',
      buffer: expectedBytes
    });
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());
    await expect(joiner.page.locator('.file-message .file-status.success')).toHaveText('File sent', {
      timeout: 90_000
    });
    await expect(host.page.locator('.file-message .file-status.success')).toHaveText('File received', {
      timeout: 90_000
    });
    await expect.poll(() => toastCount(joiner.page, sentToast), { timeout: 5_000 }).toBe(1);
    await expect.poll(() => toastCount(host.page, receivedToast), { timeout: 5_000 }).toBe(1);

    const downloadPromise = host.page.waitForEvent('download');
    await host.page.getByRole('link', { name: 'Download playwright-2mb.bin' }).click();
    const download = await downloadPromise;
    const downloadedBytes = await readFile(await download.path());
    expect(downloadedBytes.length).toBe(expectedBytes.length);
    expect(downloadedBytes).toEqual(expectedBytes);

    await host.page.locator('#disconnectBtn').click();
    await expect.poll(() => host.page.evaluate(async () => {
      const directory = await navigator.storage.getDirectory();
      const names = [];
      for await (const [name] of directory.entries()) {
        if (name.startsWith('chitlan-file-')) names.push(name);
      }
      return names;
    }), { timeout: 10_000 }).toEqual([]);
  } finally {
    await closeContexts(contexts);
  }
});

test('@network SVG file has a download link but no inline image preview', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'SVG Sender', host.roomCode, contexts);
    await joiner.page.locator('#fileInput').setInputFiles({
      name: 'sample.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')
    });
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());

    const receivedFile = host.page.locator('.file-message').filter({ hasText: 'sample.svg' });
    await expect(receivedFile.locator('.file-status')).toHaveText('File received', { timeout: 90_000 });
    await expect(receivedFile.locator('.file-preview img')).toHaveCount(0);
    await expect(receivedFile.getByRole('link', { name: 'Download sample.svg' })).toBeVisible();
  } finally {
    await closeContexts(contexts);
  }
});

test('@network host can kick a joiner and the joiner sees the removal message', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'To Be Removed', host.roomCode, contexts);

    const memberRow = host.page.locator('#userNames .user').filter({ hasText: 'To Be Removed' });
    await memberRow.locator('button.kick-btn').click();
    await host.page.locator('.chitlan-dialog-overlay').getByRole('button', { name: 'Kick', exact: true }).click();

    await expect(joiner.page.locator('#messages')).toContainText('You were removed from the room by the host.');
  } finally {
    await closeContexts(contexts);
  }
});
