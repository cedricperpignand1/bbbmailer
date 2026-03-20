/**
 * Run this LOCALLY (not on Vercel) to generate an Instagram session from your residential IP.
 *
 *   node scripts/ig-login.mjs
 *
 * Then paste the output JSON into the "Import Session" box in the Instagram tab.
 */
import { IgApiClient, IgCheckpointError } from "instagram-private-api";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const username = await ask("Instagram username: ");
const password = await ask("Instagram password: ");

const ig = new IgApiClient();
ig.state.generateDevice(username.trim());

try { await ig.simulate.preLoginFlow(); } catch { /* ignore */ }

try {
  await ig.account.login(username.trim(), password.trim());
} catch (e) {
  if (e instanceof IgCheckpointError || e?.constructor?.name === "IgCheckpointError") {
    console.log("\nInstagram requires verification. Requesting code...");
    try { await ig.challenge.auto(true); } catch { /* ignore */ }
    const code = await ask("Enter the verification code sent to your phone/email: ");
    await ig.challenge.sendSecurityCode(code.trim());
    console.log("✓ Verified!");
  } else {
    console.error("Login failed:", e.message ?? String(e));
    rl.close();
    process.exit(1);
  }
}

// currentUser() can also trigger checkpoint — handle it too
try {
  const user = await ig.account.currentUser();
  console.log(`\n✓ Logged in as @${user.username} (${user.full_name})\n`);
} catch (e) {
  if (e instanceof IgCheckpointError || e?.constructor?.name === "IgCheckpointError") {
    console.log("\nInstagram needs another verification. Requesting code...");
    try { await ig.challenge.auto(true); } catch { /* ignore */ }
    const code = await ask("Enter the verification code sent to your phone/email: ");
    await ig.challenge.sendSecurityCode(code.trim());
    console.log("✓ Verified! Continuing...");
  } else {
    // Non-checkpoint errors here are usually fine — session is still valid
    console.log("(currentUser check skipped — session should still be valid)");
  }
}

try { await ig.simulate.postLoginFlow(); } catch { /* ignore */ }

const serialized = await ig.state.serialize();
delete serialized.constants;

console.log("\n=== COPY EVERYTHING BELOW THIS LINE ===\n");
console.log(JSON.stringify(serialized));
console.log("\n=== COPY EVERYTHING ABOVE THIS LINE ===");

rl.close();
