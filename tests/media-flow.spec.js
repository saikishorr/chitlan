import { test, expect } from '@playwright/test';
import { closeContexts, joinRoom, startHost } from './helpers.js';

// Audio elements that are playing a live remote stream.
function liveRemoteAudioCount(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('audio[id^="audio-"]'))
    .filter(audio => audio.srcObject?.getAudioTracks().some(track => track.readyState === 'live'))
    .length);
}

test('@network a member without a mic hears the call, sees the banner once, and stops hearing after leaving', async ({ browser }) => {
  test.setTimeout(240_000);
  const contexts = [];
  try {
    const host = await startHost(browser, 'Caller', contexts);
    const listener = await joinRoom(browser, 'Listener', host.roomCode, contexts, { debug: true });
    await expect(listener.page.locator('#userNames .user-name')).toHaveCount(2);
    await expect(listener.page.locator('#incoming-call-banner')).toHaveCount(0);

    // The host starts a call after the listener is already in the room.
    await host.page.locator('#voiceToggleBtn').evaluate(button => button.click());
    const banner = listener.page.locator('#incoming-call-banner');
    await expect(banner).toContainText('Caller started a voice call', { timeout: 30_000 });
    await expect.poll(() => liveRemoteAudioCount(listener.page), { timeout: 30_000 }).toBe(1);
    // Listening must never turn the listener's own mic on.
    expect(await listener.page.evaluate(() => window.state.localStream)).toBeNull();

    await banner.getByRole('button', { name: 'Not now' }).click();
    await expect(banner).toHaveCount(0);

    // A third person joining causes roster updates; the listen-only call must survive them.
    await joinRoom(browser, 'Late Joiner', host.roomCode, contexts);
    await expect(listener.page.locator('#userNames .user-name')).toHaveCount(3);
    await listener.page.waitForTimeout(5_000);
    expect(await liveRemoteAudioCount(listener.page)).toBe(1);
    // The banner was dismissed and nobody new started a call, so it stays hidden.
    await expect(banner).toHaveCount(0);

    // Joining and then leaving the call stops listen-only audio.
    await listener.page.locator('#voiceToggleBtn').evaluate(button => button.click());
    await expect(listener.page.locator('#leaveBtn')).toBeVisible({ timeout: 30_000 });
    await listener.page.locator('#leaveBtn').click();
    await listener.page.waitForTimeout(8_000);
    expect(await liveRemoteAudioCount(listener.page)).toBe(0);

    // The host leaves, so nobody is in a call any more.
    await host.page.locator('#leaveBtn').click();
    await expect(banner).toHaveCount(0);
  } finally {
    await closeContexts(contexts);
  }
});
