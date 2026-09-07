import { NextRequest, NextResponse } from "next/server";

const BACKEND_INTERNAL_BASE =
  process.env.INTERNAL_API_URL || "http://127.0.0.1:8000/api";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  const pathParts = params.path || [];
  const targetPath = pathParts.join("/");
  const targetUrl = new URL(`${BACKEND_INTERNAL_BASE}/${targetPath}`);

  // Forward query string
  targetUrl.search = request.nextUrl.search;

  // Build forward headers
  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Exclude host header to avoid backend routing confusion
    if (lowerKey !== "host" && lowerKey !== "connection") {
      forwardHeaders.set(key, value);
    }
  });

  // Extract body if present
  let body: ArrayBuffer | undefined = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.arrayBuffer();
    } catch (_) {
      // Body empty or unreadable
    }
  }

  try {
    const backendResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const responseBody = await backendResponse.arrayBuffer();
    const responseHeaders = new Headers();

    backendResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Skip content-encoding/length to allow Next.js server to handle transfer-encoding
      if (lowerKey !== "content-encoding" && lowerKey !== "content-length") {
        responseHeaders.append(key, value);
      }
    });

    // Handle multiple Set-Cookie headers properly
    const setCookies = backendResponse.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      responseHeaders.delete("set-cookie");
    }

    const response = new NextResponse(responseBody, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });

    for (const cookie of setCookies) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch (err: any) {
    const isConnRefused = err?.cause?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED");
    const isTimeout = err?.name === "TimeoutError" || err?.message?.includes("timeout");
    const statusCode = isTimeout ? 504 : 503;
    const detail = isTimeout
      ? "The service request timed out. Please try again."
      : isConnRefused
      ? "Service is temporarily unavailable. Please try again in a few moments."
      : "An unexpected network error occurred. Please try again in a few moments.";

    return NextResponse.json(
      { detail },
      { status: statusCode }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function OPTIONS(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx);
}
