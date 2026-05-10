import { test, expect } from '@playwright/test';

const websiteAnswer = 'Yes. CloudGenesis builds premium, responsive, and professional websites for doctors, clinics, hospitals, and healthcare-led businesses.';
const fallbackAnswer = 'I can help with basic questions about CloudGenesis services, healthcare websites, mobile apps, secure platforms, pricing, and Doc AIde. For specific project requirements, please book a consultation or submit the Contact Us form.';

async function dismissIntroVideo(page) {
  const dialog = page.locator('[data-intro-video]');

  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /close intro video/i }).click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/chat', async (route) => {
    const payload = route.request().postDataJSON() as { message?: string };
    const message = String(payload.message || '').toLowerCase();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        answer: message.includes('doctor') || message.includes('website') ? websiteAnswer : fallbackAnswer,
      }),
    });
  });
});

test('intro video shows once and can be dismissed', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const dialog = page.getByRole('dialog', { name: /digital healthcare-ready platforms/i });
  await expect(dialog).toBeVisible();
  await expect(page.locator('iframe[title="CloudGenesis intro video"]')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/videoseries/);
  await expect(page.locator('iframe[title="CloudGenesis intro video"]')).toHaveAttribute('src', /list=PLmtqmcpqDN7BGi4XC6JufC_ww3xjLNYqv/);
  await expect(page.locator('iframe[title="CloudGenesis intro video"]')).not.toHaveAttribute('src', /mute=1/);

  await page.getByRole('button', { name: /close intro video/i }).click();
  await expect(dialog).toBeHidden();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(dialog).toBeHidden();
});

test('chatbot opens and closes', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissIntroVideo(page);

  const toggle = page.getByRole('button', { name: /ask cloudgenesis/i });
  const panel = page.getByRole('region', { name: /cloudgenesis assistant/i });

  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: /close assistant/i }).click();
  await expect(panel).toBeHidden();
});

test('chatbot handles FAQ, fallback, and empty input', async ({ page }) => {
  let submittedMessages = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/chat') && request.method() === 'POST') {
      submittedMessages += 1;
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissIntroVideo(page);
  await page.getByRole('button', { name: /ask cloudgenesis/i }).click();
  await page.getByRole('button', { name: /^send$/i }).click();
  expect(submittedMessages).toBe(0);

  const input = page.getByLabel(/your question/i);
  await input.fill('Do you build websites for doctors?');
  await page.getByRole('button', { name: /^send$/i }).click();
  await expect(page.getByLabel(/cloudgenesis assistant is typing/i)).toBeVisible();
  await expect(page.getByText(websiteAnswer)).toBeVisible({ timeout: 10_000 });

  await input.fill('Can you answer something very specific?');
  await input.press('Enter');
  await expect(page.getByText(fallbackAnswer)).toBeVisible({ timeout: 10_000 });
});

test('contact form remains visible', async ({ page }) => {
  await page.goto('/contactus/', { waitUntil: 'domcontentloaded' });
  await dismissIntroVideo(page);

  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Phone Number')).toBeVisible();
  await expect(page.getByRole('button', { name: /send inquiry/i })).toBeVisible();
});

test('home page has CloudGenesis title', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissIntroVideo(page);

  await expect(page).toHaveTitle(/CloudGenesis/);
});
