require('dotenv').config({ path: '/Users/clawbot/.openclaw-state-vigia/workspace/vigia-portal/server/.env' });
const Anthropic = require('@anthropic-ai/sdk');

const key = process.env.CLAUDE_API_KEY;
console.log('Key starts with:', key ? key.slice(0, 20) + '...' : 'MISSING');

const client = new Anthropic({ apiKey: key });

async function test() {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Reply with: STATUS OK' }]
  });
  console.log('Response:', msg.content[0].text);
}

test().catch(e => console.error('Error:', e.message));
