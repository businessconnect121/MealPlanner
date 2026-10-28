// Netlify Function — proxies nutrition analysis to Gemini Flash
// API key lives here (env var), never in the browser
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY not configured in Netlify env vars' }),
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { prompt } = body;
  if (!prompt) return { statusCode: 400, body: 'Missing prompt' };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data?.error?.message || 'Gemini API error' }),
      };
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw || '{}');
    console.log('Gemini raw response:', JSON.stringify(data).slice(0, 500));
    if (!text) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Empty response from Gemini', debug: JSON.stringify(data).slice(0, 300) }),
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
