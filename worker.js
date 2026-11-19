export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Admin login endpoint
    if (url.pathname === "/admin/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const password = body.password;

        if (!password || !env.ADMIN_PASSWORD || !env.ADMIN_TOKEN_SECRET) {
          return new Response(
            JSON.stringify({
              status: "error",
              message: "Admin authentication is not configured"
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }

        if (password !== env.ADMIN_PASSWORD) {
          return new Response(
            JSON.stringify({
              status: "error",
              message: "Invalid admin password"
            }),
            {
              status: 401,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }

        return new Response(
          JSON.stringify({
            status: "success",
            message: "Admin login successful"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      } catch {
        return new Response(
          JSON.stringify({
            status: "error",
            message: "Invalid request"
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    // Serve the existing static dashboard
    return env.ASSETS.fetch(request);
  }
};
