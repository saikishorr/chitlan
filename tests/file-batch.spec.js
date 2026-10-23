import { test, expect } from '@playwright/test';
import {
  closeContexts,
  fileCard,
  joinRoom,
  startHost,
  storedFileNames
} from './helpers.js';

function smallFile(name) {
  return { name, mimeType: 'text/plain', buffer: Buffer.from('Contents of ' + name) };
}

test('file tray appends selections, removes files and clears everything', async ({ page }) => {
  await page.goto('/app.html');
  const tray = page.locator('#selectedFile');
  const sendButton = page.locator('#sendFileBtn');

  await page.locator('#fileInput').setInputFiles([
    smallFile('tray-first.txt'),
    smallFile('tray-second.txt')
  ]);
  await page.locator('#fileInput').setInputFiles(smallFile('tray-third.txt'));

  await expect(tray.locator('li')).toHaveCount(3);
  await expect(tray).toContainText('tray-first.txt');
  await expect(tray).toContainText('tray-second.txt');
  await expect(tray).toContainText('tray-third.txt');
  await tray.getByRole('button', { name: 'Remove tray-second.txt', exact: true }).click();

  await expect(tray.locator('li')).toHaveCount(2);
  await expect(tray).not.toContainText('tray-second.txt');
  await expect(sendButton).toHaveText('Send 2 files');
  await tray.getByRole('button', { name: 'Clear all', exact: true }).click();

  await expect(tray.locator('li')).toHaveCount(0);
  await expect(tray).toHaveText('No files selected');
  await expect(sendButton).toBeDisabled();
});

test('@network getting a batch accepts all three files without more clicks', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'Batch Sender', host.roomCode, contexts);
    const names = ['batch-first.txt', 'batch-second.txt', 'batch-third.txt'];

    await joiner.page.locator('#fileInput').setInputFiles(names.map(smallFile));
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());

    const firstCard = fileCard(host.page, names[0]);
    await expect(firstCard.locator('.file-status')).toContainText('wants to send you this file', { timeout: 60_000 });
    await firstCard.getByRole('button', { name: 'Get all 3 files', exact: true }).click();

    for (const name of names) {
      await expect(fileCard(host.page, name).locator('.file-status')).toHaveText('File received', { timeout: 60_000 });
      await expect(fileCard(joiner.page, name).locator('.file-status')).toHaveText('File sent', { timeout: 30_000 });
    }
  } finally {
    await closeContexts(contexts);
  }
});

test('@network skipping a batch rejects both files without storing them', async ({ browser }) => {
  const contexts = [];
  try {
    const host = await startHost(browser, 'Room Host', contexts);
    const joiner = await joinRoom(browser, 'Batch Sender', host.roomCode, contexts);
    const names = ['skip-first.txt', 'skip-second.txt'];

    await joiner.page.locator('#fileInput').setInputFiles(names.map(smallFile));
    await joiner.page.locator('#sendFileBtn').evaluate(button => button.click());

    const firstCard = fileCard(host.page, names[0]);
    await expect(firstCard.locator('.file-status')).toContainText('wants to send you this file', { timeout: 60_000 });
    await firstCard.getByRole('button', { name: 'Skip all', exact: true }).click();

    for (const name of names) {
      await expect(fileCard(joiner.page, name).locator('.file-status')).toHaveText('Not accepted', { timeout: 30_000 });
    }
    await expect(fileCard(host.page, names[1]).locator('.file-status')).toHaveText('Skipped (batch)');
    expect(await storedFileNames(host.page)).toEqual([]);
  } finally {
    await closeContexts(contexts);
  }
});
