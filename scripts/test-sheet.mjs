import fs from 'fs';

async function test() {
  const envRaw = fs.readFileSync('.env.local', 'utf-8');
  const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).trim().replace(/"/g, '')];
  }));

  const GOOGLE_CLIENT_EMAIL = env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  // get token (simplified, requires jwt, we will use a quick googleapis call)
  // Wait, I can just use node-fetch and jsonwebtoken
}
test();
