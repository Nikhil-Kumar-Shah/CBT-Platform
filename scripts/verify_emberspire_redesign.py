import asyncio
import os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = r"C:\Users\Nikhil Kumar Shah\.gemini\antigravity-ide\brain\8a1208f3-f30c-46b6-baba-649a38c46aad"

async def run_verification():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)

        # 1. Desktop Context (1440x900)
        context_desktop = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context_desktop.new_page()

        print("[1] Verifying Landing Page (Dark Theme)...")
        await page.goto("http://localhost:3000/", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_landing_dark.png"))
        print("  [OK] Saved emberspire_landing_dark.png")

        print("[2] Toggling to Light Theme on Landing Page...")
        toggle_btn = page.locator("button[title*='Light'], button[aria-label*='light'], button[title*='Dark'], button[aria-label*='dark']").first
        await toggle_btn.click()
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_landing_light.png"))
        print("  [OK] Saved emberspire_landing_light.png")

        print("[3] Verifying Candidate Entry Page (/exam in Light and Dark)...")
        await page.goto("http://localhost:3000/exam", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_candidate_entry_light.png"))
        print("  [OK] Saved emberspire_candidate_entry_light.png")
        # Toggle back to dark
        toggle_btn = page.locator("button[title*='Dark'], button[aria-label*='dark'], button[title*='Light']").first
        await toggle_btn.click()
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_candidate_entry_dark.png"))
        print("  [OK] Saved emberspire_candidate_entry_dark.png")

        print("[4] Logging into Admin Portal...")
        await page.goto("http://localhost:3000/login", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_login_dark.png"))
        await page.fill('input[type="text"]', "admin")
        await page.fill('input[type="password"]', "admin123")
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/admin**", timeout=10000)
        print("  [OK] Logged in successfully!")

        print("[5] Verifying Admin Dashboard (Dark Theme)...")
        await page.goto("http://localhost:3000/admin", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_admin_dashboard_dark.png"))
        print("  [OK] Saved emberspire_admin_dashboard_dark.png")

        print("[6] Toggling to Light Theme on Admin Dashboard...")
        toggle_btn = page.locator("button[title*='Light'], button[aria-label*='light']").first
        await toggle_btn.click()
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_admin_dashboard_light.png"))
        print("  [OK] Saved emberspire_admin_dashboard_light.png")

        print("[7] Verifying System Health in Light and Dark Theme...")
        await page.goto("http://localhost:3000/admin/health", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_system_health_light.png"))
        print("  [OK] Saved emberspire_system_health_light.png")
        toggle_btn = page.locator("button[title*='Dark'], button[aria-label*='dark'], button[title*='Light']").first
        await toggle_btn.click()
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_system_health_dark.png"))
        print("  [OK] Saved emberspire_system_health_dark.png")

        print("[8] Verifying Universal Audit Center in Dark Theme...")
        await page.goto("http://localhost:3000/admin/audit", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_universal_audit_dark.png"))
        print("  [OK] Saved emberspire_universal_audit_dark.png")

        await context_desktop.close()

        # 2. Mobile Context (iPhone 14/15 size: 390x844)
        print("[9] Testing Dedicated Mobile Viewport (390x844)...")
        context_mobile = await browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        mobile_page = await context_mobile.new_page()
        await mobile_page.goto("http://localhost:3000/exam", wait_until="networkidle")
        await mobile_page.screenshot(path=os.path.join(SCREENSHOT_DIR, "emberspire_mobile_candidate_entry.png"))
        print("  [OK] Saved emberspire_mobile_candidate_entry.png")

        await context_mobile.close()
        await browser.close()
        print("\n=== ALL EMBERSPIRE REDESIGN BROWSER VERIFICATIONS COMPLETED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(run_verification())
