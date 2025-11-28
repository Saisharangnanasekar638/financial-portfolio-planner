// netlify/functions/openai.js
const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  // Expect POST with { prompt: "..."}
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
    const body = JSON.parse(event.body || "{}");
    if (!body.prompt) return { statusCode: 400, body: "No prompt provided" };

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return { statusCode: 500, body: "OpenAI key not configured" };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":`Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or another model you have access to
        messages: [{role:"user", content: body.prompt}],
        max_tokens: 300,
        temperature: 0.2
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: resp.status, body: txt };
    }
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content || "";
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: String(err) };
  }
};
