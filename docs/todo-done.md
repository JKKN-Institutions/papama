1. Settlement Approval/Hold (#11)

What it is: The process of paying vendors for the meals they served.
Business need: Before this, once a settlement was locked, it went straight to reconciliation — nobody had a chance to formally sign off on it. Now there's a required approval checkpoint: locked → approved → reconciled → paid. A compliance officer must approve a settlement before it can move forward — separate from the admin who locked it. This is a basic financial control (separation of duties): the person who runs payroll shouldn't be the only one who approves it.
Also fixed: Compliance officers were actually blocked from using this approval step at all due to a permissions bug — they couldn't even open the door. Fixed that.

2. Duplicate Photo Detection (#12)

What it is: Fraud protection against a vendor reusing the same meal photo to get paid twice.
How it works: Every proof photo a vendor uploads gets fingerprinted (a hash of the image). When a new photo comes in, we compare it against past photos. If it's a near-duplicate, the system automatically flags it as fraud and holds the vendor's payment for that meal until an admin reviews it.
What's new here: This detection already existed, but it was using a placeholder/workaround fraud category ("vendor anomaly") because the real "duplicate media" fraud type didn't exist in the database yet. Now it does — so fraud reports correctly say "duplicate photo" instead of a generic label. We also built a permanent evidence log of every photo fingerprint, so investigators can trace exactly which two uploads matched.

3. Institution Bulk Reporting (#15)

What it is: When pApAmA gives a batch of tokens to a partner institution (like an orphanage or old-age home) to distribute to their own residents, this report tells you what happened to that batch.
Business need: An admin hands 100 tokens to an NGO partner. Later, someone needs to answer: "Of those 100 tokens, how many were actually redeemed for meals? How many are still sitting unused? Did any expire or get reported lost?"
What it shows: A breakdown — tokens allocated / redeemed / pending / expired / blocked (lost) — for one institution's batch. It's separate from the older "meals served" report (which counts meals by which beneficiaries belong to that institution, not which specific batch of tokens they used) — these two numbers can legitimately differ, and the report is clear about why.
Why it needed work: The database had no way to trace which specific tokens came from which bulk batch — we added that link so this report can actually be built accurately.

4. Complaints & Inspection Triage (#16)

What it is: Two things bundled together — (a) how a beneficiary's complaint about a vendor gets worked through to resolution, and (b) what happens after a surprise hygiene inspection.
Complaints: A complaint moves through stages: open → investigating → resolved/dismissed. Before this change, an admin could illegally skip stages or move a closed complaint back open — there was no rule enforcing the correct order. Now that's locked down.
Inspections: If an inspector fails a vendor on a surprise visit, the vendor's quality score now automatically drops by a configured penalty amount. It does not auto-suspend the vendor — the spec explicitly says a failed inspection needs a human to review and decide on suspension, so we didn't automate that part.

5. Lost-Token Workflow (#17)

What it is: A donor or admin can report a token as lost. The old token is instantly blocked (can never be redeemed again), and a brand-new replacement token is minted with the same value, so the beneficiary/donor doesn't lose out.
Why it matters: Before this, there was genuinely no way to handle a lost token at all — it was a real gap. Now it's a one-click action.

6. Token Revalidation (#22)

What it is: Normally, a token expires automatically after 90 days (configurable) and becomes unusable. This gives an admin a way to manually extend an expired token's life — a deliberate, audited override of the normal expiry rule.
Guardrail: This feature is currently switched off by default — an admin has to explicitly turn it on before anyone can use it, matching how every other new feature in this system ships (dark until someone opts in).

7. Multi-Level Cooldown (#21)

What it is: The minimum wait time between a beneficiary's meals (e.g., "must wait 6 hours between meals").
What's new: Previously there was only ONE global cooldown number for everyone. Now there are three levels, and the most specific one wins:
- Emergency (during a declared disaster) overrides everything
- Category (e.g., pregnant women might get a shorter cooldown than the general public)
- Global (the default fallback)

This lets the admin set different rules for different vulnerable groups without touching the rule for everyone else.

8. Financial Ledgers (#18)

What it is: A complete, tamper-evident money trail. Every rupee that moves through the system gets logged into one of three "buckets": Donation (money coming in), Vendor Payable (money owed to vendors), Revenue (money the platform keeps, e.g. leftover balances).
Why it matters: This is the accounting backbone — an auditor should be able to trace any single donation all the way to the vendor who got paid for it, and prove the books balance (donations in = vendor payouts + platform revenue, exactly, to the paisa). We built a "reconcile" check that verifies this automatically.
Where it plugs in: Every donation, every approved meal proof, every settlement payout, and every refund now writes an entry to this ledger automatically.

9. Emergency/Disaster Mode (#9)

What it is: During a declared emergency (flood, cyclone, etc.), an admin can temporarily loosen the rules — e.g., raise the daily meal limit or shorten the cooldown — without permanently changing the config for normal operations.
Key detail your manager will ask about: Only one admin needs to approve this (no two-person sign-off required) — that was an open question we resolved with a sensible default. These overrides are time-boxed: if the admin sets an expiry window, the system automatically reverts the setting back to normal on its own, no one has to remember to undo it.
What we didn't build: Proof of "who counts as disaster-affected" — that rule genuinely doesn't exist yet because the client hasn't told us what proof to require. We didn't invent one.

10. Refund Workflow (#14 + #20)

What it is: A formal process for refunding a donor when a payment genuinely failed or was charged twice.
The hard rule (client-approved default): Refunds can only happen against a logged payment failure — never as a "change my mind, I want my money back." This isn't just a policy on paper — it's built into the database itself so it's technically impossible to create a refund without a real failed-payment record behind it.
How it flows: Admin logs a failed payment → donor (or admin) requests a refund against it → admin approves or rejects → on approval, the donor's credit balance is reduced and it's logged in the financial ledger.
Important nuance: This is not sending money back to the donor's bank account — donations remain non-withdrawable by policy. It's an internal credit correction (undoing a credit that shouldn't have been granted in the first place).
