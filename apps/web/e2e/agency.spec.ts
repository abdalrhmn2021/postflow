import { expect, test, type Page } from "@playwright/test";

// One agency per test run: names that can't clash with an earlier run's.
const RUN = `pw${Date.now().toString(36)}`;
const PASSWORD = "a-long-password";

async function signUp(page: Page, who: string) {
  await page.goto("/ar/register");
  await page.fill("input[name=agencyName]", `وكالة ${who}`);
  await page.fill("input[name=slug]", `${RUN}-${who}`);
  await page.fill("input[name=name]", "عبد الرحمن");
  await page.fill("input[name=email]", `${who}@${RUN}.test`);
  await page.fill("input[name=password]", PASSWORD);
  await page.getByRole("button", { name: "أنشئ الحساب" }).click();
  await expect(page).toHaveURL(/\/ar\/dashboard/);
}

async function addClient(page: Page, name: string, approval = false) {
  await page.goto("/ar/dashboard/brands/new");
  await page.fill("input[name=name]", name);
  if (approval) await page.check("input[name=requiresApproval]");
  await page.getByRole("button", { name: "أضف العميل" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().split("/").pop()!;
}

test("an agency signs up, logs out and back in, and switches language", async ({ page }) => {
  await signUp(page, "a");
  await expect(page.getByRole("heading", { name: "أهلاً عبد الرحمن" })).toBeVisible();

  await page.getByRole("button", { name: "تسجيل خروج" }).click();
  await expect(page).toHaveURL(/\/ar\/login/);
  await page.goto("/ar/dashboard");
  await expect(page).toHaveURL(/\/ar\/login\?next=/); // the dashboard needs a login

  await page.fill("input[name=email]", `a@${RUN}.test`);
  await page.fill("input[name=password]", "wrong-password");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText("الإيميل أو كلمة السر غلط.")).toBeVisible();

  await page.fill("input[name=password]", PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/ar\/dashboard/); // back where they were going

  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("a post from draft to the calendar", async ({ page }) => {
  await signUp(page, "b");
  const brandId = await addClient(page, "برجر هم");

  await page.goto(`/ar/dashboard/posts/new?brand=${brandId}`);
  await page.fill("textarea[name=caption]", "عرض الجمعة 🍔 #برجر");
  await page.getByRole("button", { name: "فيسبوك" }).click();

  // Scheduling without a time is caught before anything is sent.
  await page.getByRole("button", { name: "جدول المنشور" }).click();
  await expect(page.getByText("اختار وقت")).toBeVisible();

  // Tomorrow at 18:30, in the client's time zone.
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
  await page.fill("input[name=scheduledAt]", `${tomorrow}T18:30`);
  await page.getByRole("button", { name: "جدول المنشور" }).click();
  await expect(page.getByText("انجدول المنشور ✓")).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/dashboard\/posts\/[\w-]+$/); // it has its own page now

  // On the calendar's week, at its time.
  await page.goto(`/ar/dashboard/posts?view=week&date=${tomorrow}`);
  const card = page.getByRole("link", { name: /18:30/ });
  await expect(card).toContainText("برجر هم");
  await expect(card).toContainText("مجدول");
});

test("the client approves a post through the review link, with no account", async ({ page, browser }) => {
  await signUp(page, "c");
  const brandId = await addClient(page, "كوفي كورنر", true);

  await page.goto(`/ar/dashboard/posts/new?brand=${brandId}`);
  await page.fill("textarea[name=caption]", "قهوة الصبح ☕ بـ 5 شيكل");
  await page.getByRole("button", { name: "فيسبوك" }).click();
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
  await page.fill("input[name=scheduledAt]", `${tomorrow}T09:00`);

  // Not approved yet: can't be scheduled.
  await page.getByRole("button", { name: "جدول المنشور" }).click();
  await expect(page.getByText("العميل لسا ما وافق على هاد المنشور")).toBeVisible();

  await page.getByRole("button", { name: "ابعت للعميل للموافقة" }).click();
  await expect(page.getByText("بانتظار العميل ⏳")).toBeVisible();
  const postUrl = page.url();

  // The review link, from the client's page.
  await page.goto(`/ar/dashboard/brands/${brandId}`);
  await page.getByRole("button", { name: "اعمل رابط مراجعة" }).click();
  const link = await page.locator("#review-link").inputValue();

  // The client: a separate browser, no cookies.
  const client = await (await browser.newContext()).newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "منشورات «كوفي كورنر» للموافقة" })).toBeVisible();
  await expect(client.getByText("قهوة الصبح ☕ بـ 5 شيكل").first()).toBeVisible();
  await client.getByRole("button", { name: "موافق ✓" }).click();
  await expect(client.getByText("وافقت عليه ✓")).toBeVisible();
  await client.context().close();

  // Back at the agency: approved, and now it can be scheduled.
  await page.goto(postUrl);
  await expect(page.getByText("وافق العميل ✓")).toBeVisible();
  await page.getByRole("button", { name: "جدول المنشور" }).click();
  await expect(page.getByText("انجدول المنشور ✓")).toBeVisible();
});
