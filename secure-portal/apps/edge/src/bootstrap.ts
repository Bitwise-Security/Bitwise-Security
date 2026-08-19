export default {
  fetch(): Response {
    return new Response("Staging deployment is being configured.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
} satisfies ExportedHandler;
