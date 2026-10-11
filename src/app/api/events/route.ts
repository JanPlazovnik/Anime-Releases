import { dataEvents } from "@/lib/events";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const onChange = () => send("data: change\n\n");
      const ping = setInterval(() => send(": ping\n\n"), 25_000);

      dataEvents.on("change", onChange);
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        dataEvents.off("change", onChange);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
