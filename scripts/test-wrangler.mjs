/**
 * Test script using Wrangler's local mode
 * This properly uses the AI binding without needing API tokens
 * 
 * Usage:
 * 1. Start dev server: npm run dev
 * 2. Run this: node scripts/test-wrangler.mjs
 */

async function testAgent() {
  console.log("🧪 Testing OnboardingAgent via Wrangler dev server\n");

  const baseUrl = "http://localhost:8787";
  const sessionId = `test-${Date.now()}`;

  const testMessages = [
    "Hello! I'm interested in your services.",
    "I need a website for my business.",
    "My budget is around ₹50,000."
  ];

  for (let i = 0; i < testMessages.length; i++) {
    const message = testMessages[i];
    console.log(`\n📤 Message ${i + 1}: "${message}"`);

    try {
      const response = await fetch(`${baseUrl}/agent/OnboardingAgent/${sessionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: "sendMessage",
          args: [message]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error ${response.status}:`, errorText);
        continue;
      }

      const result = await response.json();
      console.log(`\n✅ Response:`, result);

      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`❌ Request failed:`, error.message);
      if (error.cause?.code === 'ECONNREFUSED') {
        console.error("\n💡 Make sure the dev server is running: npm run dev");
        process.exit(1);
      }
    }
  }

  console.log("\n\n✅ Test complete!");
}

testAgent().catch(console.error);
