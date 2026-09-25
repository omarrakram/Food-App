# What AKALT needs from a supermarket's catalogue

One page, to send to the partner before any integration work starts.

**Send it in whatever you already produce.** CSV, Excel, a database export, an
API — AKALT will write the importer for your format. What matters is the
fields, not the shape, and a spreadsheet you already generate weekly is a
better starting point than a new endpoint nobody maintains.

---

## The fields

### Required — without these a product cannot be sold

| Field | Why | Example |
|---|---|---|
| **SKU / product code** | Your stable identifier. Everything AKALT stores points at this, so it must not change when a price or a name does. | `41288` |
| **Product name (English)** | What the customer reads. | `Sunflower Oil 2.7L` |
| **Price** | In piastres, or in pounds with a stated currency. Whichever you already use — AKALT converts once, at import, rather than guessing per row. | `21500` or `215.00 EGP` |
| **Branch** | Prices and stock differ per branch, so every row must say which branch it is about. One file per branch is fine. | `MAADI-01` |
| **Availability** | `in stock` / `out of stock` / `low` — or a numeric quantity, from which AKALT derives those. | `in stock` |

### Strongly wanted — the product is much worse without them

| Field | What it changes |
|---|---|
| **Product name (Arabic)** | Half of AKALT is in Arabic. Without this the app shows an English name inside an Arabic sentence, which reads as broken. |
| **Pack size and unit** | `2.7 L`, `500 g`, `12 pieces`. This is how AKALT works out that a recipe needing 300 g means buying one 500 g pack rather than two. Without it, the app cannot say how much to buy and has to ask the customer. |
| **Category** | Your own aisle or department. Speeds up mapping your SKUs onto AKALT's ingredients enormously, and reduces the number a human has to check by hand. |
| **Brand** | Customers choose by it, and it makes two similar SKUs distinguishable. |
| **Image URL** | A shelf with no pictures converts worse. Not blocking. |

### Allergens and dietary data — please read the note below

| Field | Format |
|---|---|
| **Allergens** | The list this product contains: gluten, dairy, eggs, peanuts, tree nuts, soy, fish, shellfish, sesame. |
| **Allergen data published?** | A yes/no per product, or a statement that the whole feed carries allergen data. **This is a different question from "the allergen list is empty".** |
| **Dietary suitability** | Vegan / vegetarian / halal / other, where you publish it. |

**Why the second row matters more than it looks.** A product with an empty
allergen list is either one you have declared free of allergens, or one nobody
has published data about. For a customer with a nut allergy those are opposite
answers, and AKALT will never treat the second as the first. Its rule is
absolute: **unknown is never safe.** A product with no published allergen data
is not offered to a customer who has declared an allergy — it is not hidden
from everyone, and it is not quietly assumed harmless.

The consequence is worth stating plainly before launch: **if the feed carries
no allergen data at all, then for a customer with a declared allergy almost
nothing in the catalogue will be selectable automatically.** That is the
correct behaviour and AKALT will not weaken it. It is also a commercial
decision about what the pilot looks like, and it needs making before the
integration, not after. See the three options in `PILOT_READINESS.md` § B3.

---

## What AKALT keeps separate, and why it matters to you

Your rows stay yours. AKALT stores them in `merchant_products` exactly as sent,
and holds the link to its own canonical ingredient vocabulary in a **third,
separate table** — with a confidence score, a source, and a human verification
flag on every link.

That means:

* re-sending your feed never touches the mappings, and re-checking a mapping
  never touches your data;
* a wrong mapping (`Chilli Oil` matched to `olive oil`) is blocked in one row,
  not by editing your catalogue;
* nothing AKALT infers is ever written back into your data as though you had
  said it.

---

## Refresh

| Question | AKALT's need |
|---|---|
| How often can you send prices? | Daily is ideal. Weekly is workable. Anything staler than that and the basket a customer builds is a statement about last week. |
| How often can you send stock? | More often than prices, if possible. Stock is the field that makes a picker's morning difficult. |
| Full file or changes only? | Either. Say which, because a partial file treated as a full one delists your whole catalogue. |
| How will you send it? | SFTP, an email attachment, a URL AKALT fetches, or an API. Whatever you already do. |

## Branches, for the pilot

For each branch in the pilot:

* branch code and name (English and Arabic);
* the **districts it delivers to** — by name is fine, AKALT maps them to its
  own area keys. GPS is not required and is not used;
* delivery fee;
* minimum order value, if any;
* typical delivery time;
* opening hours, or simply whether it is currently accepting orders.

## What AKALT does NOT need

Stated so nobody spends time on it: no stock quantities beyond in/out, no
supplier data, no cost prices, no margins, no customer data, no loyalty data,
no GPS coordinates, and no API for placing orders — AKALT's own dashboard is
the pilot's order channel.
