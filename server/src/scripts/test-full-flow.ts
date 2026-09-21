/**
 * test-full-flow.ts — Tests full HTTP API workflow against the running Express server
 */
async function run() {
  const baseUrl = 'http://localhost:5000/api/conversations/dental-intake/message';

  console.log('1. Initializing session...');
  let res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  let data = await res.json();
  const sessionId = data.sessionId;
  console.log(`Initialized: sessionId=${sessionId} | reply="${data.reply}"\n`);

  const turns = [
    // 1. Name: fail first, ask again here itself, then succeed
    { input: 'Eight Seven Six Two Double Four Double Two Nine', desc: '1. Name - fail (user spoke numbers)' },
    { input: 'Srija U H', desc: '1. Name - succeed' },

    // 2. Phone: fail first (9 digits), ask again here itself, then succeed
    { input: '876244229', desc: '2. Phone - fail (9 digits)' },
    { input: '8762442297', desc: '2. Phone - succeed (10 digits)' },

    // 3. Date: fail first, ask again here itself, then succeed
    { input: 'whenever you are free', desc: '3. Date - fail' },
    { input: 'next Monday', desc: '3. Date - succeed' },

    // 4. Time: fail first, ask again here itself, then succeed
    { input: 'any time works', desc: '4. Time - fail' },
    { input: 'at two', desc: '4. Time - succeed' },

    // 5. Closing / Confirmation
    { input: 'yes please book it', desc: '5. Confirmation - closing message' },
  ];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    console.log(`Turn ${i + 1} (${turn.desc}): Sending "${turn.input}"...`);
    res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: turn.input }),
    });
    data = await res.json();
    console.log(`  AI Reply: "${data.reply}"`);
    console.log(`  Fields:`, data.extractedFields);
    console.log(`  isCompleted: ${data.isCompleted}\n`);
  }
}

run().catch(console.error);
