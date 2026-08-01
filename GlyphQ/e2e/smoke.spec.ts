/*
 * Web smoke suite: the app boots, every tab renders, and navigation is
 * console-error-free. Native-only flows are NOT covered here and need a
 * device (Expo Go): device import (expo-document-picker), epub reading
 * (react-native-webview + file://), and the RSVP overlay entry point.
 */
import { test, expect, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test("library boots with header, add button, and status tabs", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");

  await expect(page.getByText("My Library")).toBeVisible();
  await expect(page.getByText("Add", { exact: true })).toBeVisible();
  for (const seg of ["All", "Reading", "Want", "Done", "DNF"]) {
    await expect(page.getByText(seg, { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("all five tabs render without console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");

  await page.getByRole("tab", { name: /Search/ }).click();
  await expect(page.getByPlaceholder("Title, author, or ISBN…")).toBeVisible();

  await page.getByRole("tab", { name: /Reader/ }).click();
  await expect(page.getByText(/No book selected|Reader/).first()).toBeVisible();

  await page.getByRole("tab", { name: /Analytics/ }).click();
  await expect(page.getByText("Your reading at a glance")).toBeVisible();
  await expect(page.getByText("Books Finished")).toBeVisible();

  await page.getByRole("tab", { name: /Settings/ }).click();
  await expect(page.getByText(/Settings/).first()).toBeVisible();

  await page.getByRole("tab", { name: /Library/ }).click();
  await expect(page.getByText("My Library")).toBeVisible();

  expect(errors).toEqual([]);
});

test("library search filters and empty state appears", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Search title or author…").fill("zzz-no-such-book");
  await expect(
    page.getByText(/No books match your criteria|0 books/).first()
  ).toBeVisible();
});
