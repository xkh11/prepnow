// ============================================================================
// PrepNow — OpenAI proxy (Supabase Edge Function)
//
// Purpose: keep the OpenAI API key OFF the client. The browser calls this
// function; the function holds the key as a server-side secret (OPENAI_API_KEY)
// and forwards interview answers to the OpenAI Responses API.
//
// Security:
//   - Only signed-in users may call it. The JWT (verified by the Supabase
//     platform before this code runs) must have role "authenticated";
//     anonymous callers are rejected with 401.
//   - The OpenAI key is read from Deno.env and never returned to the client.
//
// Deploy (dashboard): Edge Functions -> create function "openai-proxy" ->
//   paste this file -> Deploy. Then add a secret OPENAI_API_KEY = <your key>.
// Deploy (CLI):  supabase functions deploy openai-proxy
//                supabase secrets set OPENAI_API_KEY=<your key>
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Decode (not verify) the JWT payload. The Supabase platform has already
// verified the signature by the time this runs, so we only read the role.
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Require a signed-in user (reject the anonymous role)
  if (jwtRole(req.headers.get("Authorization")) !== "authenticated") {
    return json({ error: "Sign in required" }, 401);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({ error: "Server is missing OPENAI_API_KEY" }, 500);
  }

  let payload: {
    question?: { text?: string; expected_points?: string };
    transcript?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const question = payload.question ?? {};
  const transcript = payload.transcript ?? "";

  // Prompt is built server-side so clients can't repurpose the key for
  // arbitrary OpenAI calls.
  const openaiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content:
            `You are an expert interview coach evaluating a candidate's response to an interview question. Analyze the response and provide structured feedback.

Respond in this exact JSON format:
{
    "score": <number 0-100>,
    "overall": "<brief overall assessment>",
    "strengths": ["<strength 1>", "<strength 2>"],
    "improvements": ["<improvement 1>", "<improvement 2>"],
    "missingPoints": ["<missing point 1>"],
    "exampleAnswer": "<brief example of a strong answer>",
    "tips": ["<tip 1>", "<tip 2>"]
}

The expected key points for this question are: ${question.expected_points ?? ""}`,
        },
        {
          role: "user",
          content:
            `Interview Question: "${question.text ?? ""}"\n\nCandidate's Answer: "${transcript}"\n\nPlease evaluate this answer.`,
        },
      ],
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
    }),
  });

  // Pass the OpenAI response straight back to the browser (same shape the
  // front end already parses), preserving the status code.
  const responseBody = await openaiRes.text();
  return new Response(responseBody, {
    status: openaiRes.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
