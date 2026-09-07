import sys
import re
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"

ROUTES = [
    "/login",
    "/admin",
    "/admin/tests",
    "/admin/tests/new",
    "/admin/tests/779a0000-8846-4240-ad3a-e56ec6d4d320",
    "/admin/results",
    "/admin/results?test_id=779a0000-8846-4240-ad3a-e56ec6d4d320",
    "/admin/settings",
    "/admin/subjects",
    "/admin/test-series",
    "/exam",
    "/exam/8842ae4a-92e0-49aa-9b73-81d786c33922",
    "/exam/8842ae4a-92e0-49aa-9b73-81d786c33922/result",
]

def check_route(route):
    url = f"{BASE_URL}{route}"
    print(f"\n--- Testing route: {url} ---")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content_type = resp.headers.get("Content-Type", "")
            cache_ctrl = resp.headers.get("Cache-Control", "")
            html = resp.read().decode("utf-8", errors="replace")
            print(f"Document status: {status}, Content-Type: {content_type}, Cache-Control: {cache_ctrl}, Length: {len(html)}")
    except urllib.error.HTTPError as e:
        print(f"FAILED document request {url}: {e.code} {e.reason}")
        return False
    except Exception as e:
        print(f"ERROR requesting {url}: {e}")
        return False

    css_links = re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\']', html)
    css_links += re.findall(r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']stylesheet["\']', html)
    css_links = list(set(css_links))

    script_srcs = list(set(re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)))

    print(f"Found {len(css_links)} CSS link(s), {len(script_srcs)} Script src(s)")

    failed_assets = 0

    for css in css_links:
        css_url = css if css.startswith("http") else f"{BASE_URL}{css}"
        try:
            with urllib.request.urlopen(urllib.request.Request(css_url, headers={"User-Agent": "Mozilla/5.0"})) as c_resp:
                ct = c_resp.headers.get("Content-Type", "")
                cc = c_resp.headers.get("Cache-Control", "")
                if c_resp.status != 200 or "css" not in ct:
                    print(f"  [BAD CSS] {css} -> Status: {c_resp.status}, Content-Type: {ct}")
                    failed_assets += 1
                else:
                    print(f"  [OK CSS] {css} ({c_resp.status}, {ct}, Cache: {cc})")
        except Exception as e:
            print(f"  [FAIL CSS] {css} -> {e}")
            failed_assets += 1

    for js in script_srcs:
        js_url = js if js.startswith("http") else f"{BASE_URL}{js}"
        try:
            with urllib.request.urlopen(urllib.request.Request(js_url, headers={"User-Agent": "Mozilla/5.0"})) as j_resp:
                ct = j_resp.headers.get("Content-Type", "")
                if j_resp.status != 200 or ("javascript" not in ct and "application/x-javascript" not in ct):
                    print(f"  [BAD JS] {js} -> Status: {j_resp.status}, Content-Type: {ct}")
                    failed_assets += 1
                else:
                    print(f"  [OK JS] {js} ({j_resp.status}, {ct})")
        except Exception as e:
            print(f"  [FAIL JS] {js} -> {e}")
            failed_assets += 1

    if failed_assets > 0:
        print(f"Route {route} had {failed_assets} failed asset(s)!")
        return False
    return True

if __name__ == "__main__":
    all_ok = True
    for r in ROUTES:
        if not check_route(r):
            all_ok = False

    if all_ok:
        print("\n\n>>> ALL ROUTES AND ALL STATIC ASSETS VERIFIED 100% OK! <<<")
        sys.exit(0)
    else:
        print("\n\n>>> SOME ASSETS FAILED! <<<")
        sys.exit(1)
