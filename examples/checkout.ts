/**
 * Run with: npx tsx examples/checkout.ts
 *
 * A checkout that fails at the payment step. The point is the output: one
 * record that carries the whole attempt, not eight lines you have to reassemble.
 */
import { createChiplog, redactKeys, set, stage } from "../src/index";

const chiplog = createChiplog({
  sink: (event) => console.log(JSON.stringify(event, null, 2)),
  redact: redactKeys(["email", "cardNumber"]),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Three layers down from the entry point — no context threaded through.
async function chargeCard(amount: number): Promise<never> {
  stage("gateway_request", { provider: "stripe", amount });
  await sleep(120);
  throw new Error("card_declined: insufficient funds");
}

async function loadCart(userId: string) {
  stage("cart_loaded", { userId, items: 3, email: "buyer@example.com" });
  await sleep(15);
  return { total: 4200 };
}

await chiplog
  .run("checkout.submit", async (flow) => {
    flow.set({ orgId: "org_7f3a", userId: "usr_221" });
    stage("received");
    const cart = await loadCart("usr_221");
    stage("inventory_reserved", { warehouse: "iad" });
    await sleep(30);
    await chargeCard(cart.total);
  })
  .catch(() => process.exit(0));
