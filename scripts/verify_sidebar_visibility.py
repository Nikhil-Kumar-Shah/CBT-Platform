import sys
import time
from playwright.sync_api import sync_playwright

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("\n--- 1. Testing Public Home Page ('/') ---")
        page.goto("http://localhost:3000/")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        sidebar_count = page.locator(".admin-sidebar, .app-sidebar").count()
        admin_shell_count = page.locator(".admin-shell").count()
        print(f"Sidebar count on '/': {sidebar_count} (Expected: 0)")
        print(f"Admin shell count on '/': {admin_shell_count} (Expected: 0)")
        assert sidebar_count == 0, f"Sidebar rendered on '/'! Count: {sidebar_count}"
        assert admin_shell_count == 0, f"Admin shell rendered on '/'! Count: {admin_shell_count}"

        # Check body/container width and margin
        body_box = page.evaluate("() => ({ width: document.body.clientWidth, innerWidth: window.innerWidth, marginLeft: window.getComputedStyle(document.body).marginLeft })")
        print(f"Body dimensions on '/': {body_box}")
        assert body_box["width"] == body_box["innerWidth"], "Body does not span full viewport width!"

        # Refresh test
        page.reload()
        page.wait_for_load_state("networkidle")
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar appeared after refresh on '/'!"

        print("\n--- 2. Testing Student Exam Gateway ('/exam') ---")
        page.goto("http://localhost:3000/exam")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        sidebar_count = page.locator(".admin-sidebar, .app-sidebar").count()
        print(f"Sidebar count on '/exam': {sidebar_count} (Expected: 0)")
        assert sidebar_count == 0, f"Sidebar rendered on '/exam'! Count: {sidebar_count}"

        exam_container = page.evaluate("""() => {
            const el = document.querySelector('div[style*=\"min-height\"]') || document.body;
            const style = window.getComputedStyle(el);
            return { marginLeft: style.marginLeft, paddingLeft: style.paddingLeft };
        }""")
        print(f"Exam container styles: {exam_container}")

        # Refresh test
        page.reload()
        page.wait_for_load_state("networkidle")
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar appeared after refresh on '/exam'!"

        print("\n--- 3. Testing Login Page ('/login') ---")
        page.goto("http://localhost:3000/login")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        sidebar_count = page.locator(".admin-sidebar, .app-sidebar").count()
        print(f"Sidebar count on '/login': {sidebar_count} (Expected: 0)")
        assert sidebar_count == 0, f"Sidebar rendered on '/login'! Count: {sidebar_count}"

        # Verify card is centered
        card_bounds = page.locator(".card").first.bounding_box()
        if card_bounds:
            center_x = card_bounds["x"] + card_bounds["width"] / 2
            viewport_center_x = 1280 / 2
            offset_from_center = abs(center_x - viewport_center_x)
            print(f"Login card center: {center_x}px, Viewport center: {viewport_center_x}px (Offset: {offset_from_center:.1f}px)")
            assert offset_from_center < 10, f"Login card is not centered! Shifted by {offset_from_center}px"

        print("\n--- 4. Testing Direct Unauthenticated Access to Admin Routes ---")
        # Direct access to /admin
        page.goto("http://localhost:3000/admin")
        page.wait_for_url("**/login", timeout=8000)
        print(f"Direct '/admin' redirected to: {page.url}")
        assert "/login" in page.url, f"Expected redirect to /login, got: {page.url}"
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar displayed after unauthenticated redirect!"

        # Direct access to /admin/results
        page.goto("http://localhost:3000/admin/results")
        page.wait_for_url("**/login", timeout=8000)
        print(f"Direct '/admin/results' redirected to: {page.url}")
        assert "/login" in page.url, f"Expected redirect to /login, got: {page.url}"
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar displayed after unauthenticated redirect!"

        print("\n--- 5. Testing Admin Login and Authenticated Admin Layout ---")
        page.fill("input#identifier, input[type='text'], input[placeholder*='username' i], input[placeholder*='email' i]", "admin")
        page.fill("input#password, input[type='password']", "admin123")
        page.click("button[type='submit']")

        # Should navigate to /admin/tests
        page.wait_for_url("**/admin/tests", timeout=10000)
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        print(f"Logged in successfully. Current URL: {page.url}")

        sidebar_count = page.locator(".admin-sidebar, .app-sidebar").count()
        print(f"Sidebar count on authenticated '/admin/tests': {sidebar_count} (Expected: 1)")
        assert sidebar_count == 1, "Sidebar missing on authenticated admin route!"

        sidebar_box = page.locator(".admin-sidebar, .app-sidebar").first.bounding_box()
        print(f"Sidebar bounding box: {sidebar_box}")
        assert sidebar_box["width"] >= 240, f"Sidebar width unexpected: {sidebar_box['width']}"

        main_content_margin = page.evaluate("""() => {
            const el = document.querySelector('.admin-main-content, .app-main-content');
            return el ? window.getComputedStyle(el).marginLeft : null;
        }""")
        print(f"Admin main content margin-left: {main_content_margin} (Expected: 250px)")
        assert main_content_margin == "250px", f"Expected admin content margin 250px, got {main_content_margin}"

        time.sleep(1)
        # Navigate between admin pages
        print("Navigating to Dashboard (/admin)...")
        page.click("a[href='/admin']")
        page.wait_for_url("**/admin", timeout=8000)
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 1, "Sidebar disappeared on /admin!"

        print("Navigating to Results (/admin/results)...")
        page.click("a[href='/admin/results']")
        page.wait_for_url("**/admin/results", timeout=8000)
        page.wait_for_load_state("networkidle")
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 1, "Sidebar disappeared on /admin/results!"

        # Refresh authenticated page
        print("Refreshing /admin/results...")
        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 1, "Sidebar disappeared after refresh on /admin/results!"
        assert "/admin/results" in page.url

        print("\n--- 6. Testing Logout Flow ---")
        # Click logout in sidebar
        logout_btn = page.locator(".sidebar-logout-btn, button:has-text('Logout')")
        assert logout_btn.count() > 0, "Logout button not found in sidebar!"
        logout_btn.click()

        # Should redirect to /login
        page.wait_for_url("**/login", timeout=10000)
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)
        print(f"After logout, URL: {page.url}")

        sidebar_count_after_logout = page.locator(".admin-sidebar, .app-sidebar").count()
        admin_shell_after_logout = page.locator(".admin-shell").count()
        print(f"Sidebar count after logout: {sidebar_count_after_logout} (Expected: 0)")
        print(f"Admin shell count after logout: {admin_shell_after_logout} (Expected: 0)")
        assert sidebar_count_after_logout == 0, "Sidebar still exists in DOM after logout!"
        assert admin_shell_after_logout == 0, "Admin shell still exists in DOM after logout!"

        # Verify card is centered after logout
        card_bounds = page.locator(".card").first.bounding_box()
        if card_bounds:
            center_x = card_bounds["x"] + card_bounds["width"] / 2
            offset_from_center = abs(center_x - 1280 / 2)
            print(f"Login card offset after logout: {offset_from_center:.1f}px")
            assert offset_from_center < 10, "Login card is shifted after logout!"

        print("\n--- 7. Testing Navigation Outside Admin Post-Logout ---")
        page.goto("http://localhost:3000/exam")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar present on /exam post-logout!"

        # Browser Back button
        page.go_back()
        page.wait_for_load_state("networkidle")
        assert "/login" in page.url
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar present on back navigation to /login!"

        # Direct navigation to /admin now that logged out
        page.goto("http://localhost:3000/admin")
        page.wait_for_url("**/login", timeout=8000)
        assert page.locator(".admin-sidebar, .app-sidebar").count() == 0, "Sidebar present after post-logout access to /admin!"

        print("\n--- 8. Console Error Verification ---")
        critical_errors = [e for e in console_errors if "favicon" not in e.lower() and "failed to load resource" not in e.lower()]
        print(f"Critical console errors: {len(critical_errors)}")
        if critical_errors:
            print("Errors:", critical_errors)
        assert len(critical_errors) == 0, f"Uncaught console errors detected: {critical_errors}"

        browser.close()
        print("\n=======================================================")
        print("ALL SIDEBAR VISIBILITY & LAYOUT TESTS PASSED 100%!")
        print("=======================================================")

if __name__ == "__main__":
    run_tests()
