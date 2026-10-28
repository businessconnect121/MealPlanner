exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY env var not set' }) };
  }
  let payload;
  try { payload = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const { model, body } = payload;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  return {
    statusCode: resp.status,
    headers: { 'content-type': 'application/json' },
    body: text
  };
};
