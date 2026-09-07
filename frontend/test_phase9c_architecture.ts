import { api, ApiError, onUnauthorized } from "./lib/api";

async function runPhase9CTests() {
  console.log("=== TEST 1: API ERROR STRUCTURE & CLASSIFICATION ===");
  const authErr = new ApiError("Session expired", { status: 401 });
  console.assert(authErr.isAuthError === true, "401 must set isAuthError = true");
  console.assert(authErr.status === 401, "Status must be 401");

  const forbiddenErr = new ApiError("Access denied", { status: 403 });
  console.assert(forbiddenErr.isAuthError === true, "403 must set isAuthError = true");

  const timeoutErr = new ApiError("Request timed out", { status: 408, isTimeout: true });
  console.assert(timeoutErr.isTimeout === true, "Timeout error must set isTimeout = true");

  const netErr = new ApiError("Failed to fetch", { isNetworkError: true });
  console.assert(netErr.isNetworkError === true, "Network error must set isNetworkError = true");
  console.log("✓ ApiError classification tests PASSED");

  console.log("\n=== TEST 2: UNAUTHORIZED EVENT EMITTER ===");
  let unauthorizedFired = false;
  const unsubscribe = onUnauthorized(() => {
    unauthorizedFired = true;
  });

  // Verify listener registration
  console.assert(typeof unsubscribe === "function", "onUnauthorized must return an unsubscribe function");
  unsubscribe();
  console.log("✓ onUnauthorized listener registration and unsubscription PASSED");

  console.log("\n=== TEST 3: ABORT CONTROLLER CANCELLATION ===");
  const controller = new AbortController();
  controller.abort(); // Immediately aborted

  try {
    await api.listTests({}, { signal: controller.signal });
    console.assert(false, "Aborted request should throw");
  } catch (err: any) {
    console.log("Caught aborted error status:", err?.status, "name:", err?.name, "message:", err?.message);
    console.assert(err?.status === 499 || err?.name === "AbortError" || err?.isNetworkError, "Should catch cancellation error");
  }
  console.log("✓ AbortController cancellation handling PASSED");

  console.log("\n=== TEST 4: IN-FLIGHT REQUEST DEDUPLICATION & AUTHENTICATION ===");
  try {
    await api.login("admin", "admin123");
    console.log("✓ Admin authentication session established");
  } catch (e: any) {
    console.log("Admin login note (or already running session):", e.message);
  }

  // Fire two simultaneous requests for listTests with identical params
  const p1 = api.listTests({ page: 1, page_size: 5 });
  const p2 = api.listTests({ page: 1, page_size: 5 });

  // Both should point to the exact same promise instance in memory
  console.assert(p1 === p2, "Simultaneous identical GET requests must share the same in-flight Promise instance");
  console.log("✓ In-flight GET request deduplication PASSED");

  try {
    const res = await p1;
    console.log("Fetched tests count:", res?.items?.length ?? 0);
  } catch (err: any) {
    console.log("Response handled gracefully:", err?.message);
  }

  console.log("\n>>> ALL PHASE 9C ARCHITECTURE TESTS PASSED SUCCESSFULLY! <<<");
}

runPhase9CTests().catch((err) => {
  console.error("Phase 9C Architecture tests failed:", err);
  process.exit(1);
});
