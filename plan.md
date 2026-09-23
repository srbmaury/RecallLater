# RecallLater — Product Plan

## 1. Product Summary

**RecallLater** is a privacy-first, local-first mobile app for Android and iOS that turns things users intentionally share from other apps into useful, structured actions.

The product is built around a simple idea:

> **See something important now. Share it to RecallLater. Deal with it when it matters.**

Users can share screenshots, images, PDFs, links, text, QR codes, tickets, receipts, product pages, messages, job posts, event posters, travel content, and similar items into RecallLater.

RecallLater then:

1. understands what the shared content is,
2. extracts useful information,
3. suggests the right action,
4. stores the result locally,
5. reminds the user later when appropriate.

The app should **not** require broad access to the user's photo library, email inbox, WhatsApp, contacts, or other private data.

The user explicitly chooses what to share.

---

## 2. Product Positioning

RecallLater should **not** be positioned as:

- an AI screenshot organizer,
- another notes app,
- another generic reminder app,
- another AI chatbot,
- a cloud document archive.

The stronger positioning is:

> **The inbox for things you need to do in real life.**

Alternative messaging:

- **Turn anything on your phone into an action.**
- **Share it now. Deal with it when it matters.**
- **Your private inbox for everything you don't want to forget.**

The core product loop is:

```text
Information arrives
      ↓
User shares it
      ↓
RecallLater understands it
      ↓
A structured item is created
      ↓
An action/reminder is suggested
      ↓
RecallLater resurfaces it at the right time
      ↓
User completes or archives it
```

---

## 3. Core UX Principle

RecallLater should be **action-first**, not storage-first.

The product is not valuable because it stores screenshots.

It is valuable because it converts:

```text
Screenshot / PDF / Link / Text
              ↓
     Structured information
              +
       Useful next action
```

The ideal interaction should take only a few seconds.

Example:

```text
WhatsApp / Instagram / Amazon / Browser / Files
                         ↓
                       Share
                         ↓
                    RecallLater
                         ↓
              "Electricity Bill"
                Amount: ₹2,840
                Due: Sep 28
                         ↓
            [Remind Sep 27] [Save]
```

---

## 4. Supported Inputs

RecallLater should accept:

- screenshots,
- photos/images,
- PDFs,
- URLs,
- selected/shared text,
- QR codes,
- multiple images,
- files.

The app should appear in the system share sheet on both Android and iOS.

### Android

Use native share intents such as:

- `ACTION_SEND`
- `ACTION_SEND_MULTIPLE`

### iOS

Use a native **Share Extension**.

The app should not request full gallery access as a prerequisite for its core workflow.

---

## 5. Supported Content Categories

| Shared content | What RecallLater extracts | Suggested actions |
|---|---|---|
| Amazon / Flipkart product | Product, price, seller, URL | Track price / remind me to buy / save for later |
| Flight / train ticket | Route, booking/train/flight number, date, departure time | Add trip to calendar / remind before departure |
| Event poster | Event name, date, time, venue | Add event + location |
| WhatsApp/message screenshot | Person, requested action, context, possible deadline | Remind me to reply / create task |
| Restaurant | Name, cuisine, address/location | Save to **Places to Try** |
| Job posting | Company, role, deadline, location, URL | Save job / application deadline / company / role |
| Bill | Merchant, amount, due date | Remind to pay / mark paid |
| Product order | Product, order date, possible return window | Track return deadline |
| Coupon | Code, merchant, discount, expiry | Save coupon / remind before expiry |
| Recipe | Dish, ingredients, instructions | Save recipe / extract ingredients |
| Address | Address / business / coordinates | Save location / open in Maps |
| QR code | URL / text / Wi-Fi / contact / payment data | Extract / open / save |
| Movie / show | Name, platform if known | Add to watchlist |
| Book | Title, author | Add to reading list |
| Product receipt | Product, price, purchase date | Store invoice / warranty / return deadline |
| Instagram travel reel screenshot | Destination / landmark / place | Identify and save destination |
| Generic text | Task, dates, entities | Create reminder / save item |
| Unknown content | Useful text/entities | Save as generic inbox item |

---

## 6. Example User Flows

### 6.1 Bill

```text
Share electricity bill
        ↓
RecallLater detects:

Electricity Bill
₹2,840
Due Sep 28
        ↓
[Remind Sep 27]
[Mark as bill]
[Save]
```

### 6.2 Product

```text
Share Amazon product
        ↓
Sony WH-1000XM6
₹24,990
        ↓
[Track Price]
[Remind Me to Buy]
[Save for Later]
```

### 6.3 Flight Ticket

```text
Share ticket PDF/image
        ↓
DEL → BLR
Sep 29 · 06:20
IndiGo 6E 6132
        ↓
[Add to Calendar]
[Remind 3h Before]
```

### 6.4 WhatsApp Message

Shared message:

> Can you send me the updated deck before we speak on Friday?

RecallLater:

```text
Task: Send updated deck
Deadline: Friday
Suggested reminder: Thursday evening

[Create Reminder]
[Edit]
```

### 6.5 Product Receipt / Warranty

```text
Sony Headphones
Purchased: Sep 23, 2026
Price: ₹24,990
Return until: Sep 30, 2026
Warranty until: Sep 23, 2027

[Track Return]
[Save Warranty]
[View Receipt]
```

---

## 7. Local-First Privacy Model

Local-first should be a core product feature.

### Default behavior

```text
Shared item
     ↓
On-device processing
     ↓
Structured data
     ↓
Stored locally
     ↓
Reminder / collection / action
```

By default:

- screenshots do not need to be uploaded,
- PDFs do not need to be uploaded,
- extracted data can stay on-device,
- reminders can work entirely locally,
- the user should be able to use the app without an account.

### Privacy promise

The onboarding experience should clearly state:

```text
Your information belongs to you.

✓ We don't scan your photo library
✓ We don't read your messages
✓ We don't read your email
✓ You choose exactly what you share
✓ Your items are stored on your device by default
✓ Screenshots aren't uploaded by default
✓ On-device processing is used whenever possible
```

---

## 8. Local Storage

Use **SQLite** for structured data.

Suggested logical storage:

```text
SQLite
├── items
├── actions
├── reminders
├── categories
├── collections
└── extraction_metadata
```

Attachments should be stored in the app's private local filesystem.

```text
App Private Storage
├── attachments/
│   ├── abc123.jpg
│   ├── invoice91.pdf
│   └── ticket44.png
└── database.sqlite
```

### Item Model

```text
Item
├── id
├── type
├── title
├── extractedText
├── metadata
├── sourceType
├── attachmentUri
├── confidence
├── createdAt
├── updatedAt
├── status
└── actions
```

Example structured item:

```json
{
  "id": "uuid",
  "type": "bill",
  "title": "Electricity Bill",
  "amount": 2840,
  "currency": "INR",
  "dueDate": "2026-09-28",
  "status": "pending",
  "confidence": 0.96
}
```

---

## 9. Optional Cloud Modes

Cloud sync should enhance the product, not be required by it.

Possible settings:

```text
Storage

● Keep everything on this device
○ Sync structured information only
○ Sync information + attachments
```

### Mode 1 — Local Only

Nothing leaves the device.

### Mode 2 — Metadata Sync

Sync only structured fields such as:

- title,
- dates,
- amounts,
- status,
- actions,
- categories,
- collection membership.

Original screenshots and PDFs remain local.

### Mode 3 — Full Backup

Structured data and attachments are securely backed up.

This can later support:

- multiple devices,
- device migration,
- web access,
- shared household inboxes.

---

## 10. AI Strategy

RecallLater should use AI, but AI should not become the interface.

The user should not feel like they are using another chatbot.

The principle is:

> **AI converts messy information into structured data. The rest of the app stays deterministic.**

---

## 11. Processing Pipeline

Recommended architecture:

```text
                    Shared item
                         │
            ┌────────────┴────────────┐
            │                         │
           Text                  Image / PDF
            │                         │
            │                        OCR
            │                         │
            └────────────┬────────────┘
                         │
                         ▼
                 Extracted content
                         │
                         ▼
               Deterministic parser
                         │
            ┌────────────┴────────────┐
            │                         │
      High confidence             Ambiguous
            │                         │
            ▼                         ▼
        Use result              Local AI
                                      │
                                Still unsure?
                                      │
                           ┌──────────┴─────────┐
                           │                    │
                          No                   Yes
                           │                    │
                           ▼                    ▼
                     Use result        Optional cloud AI
                           │                    │
                           └──────────┬─────────┘
                                      ▼
                               Structured item
                                      │
                                      ▼
                               Suggested action
```

---

## 12. Deterministic Parsing First

Not everything requires an LLM.

Use normal parsing for:

- dates,
- currency,
- URLs,
- email addresses,
- phone numbers,
- QR codes,
- flight numbers,
- train numbers,
- order IDs,
- tracking numbers,
- coupon codes,
- coordinates,
- common expiry phrases,
- obvious bill due-date patterns.

Example:

```text
₹2,840
Due Date: 28/09/2026
```

should not require an expensive AI call.

---

## 13. AI Use Cases

AI is useful when the content is ambiguous.

Examples:

### Classification

Determine whether content represents:

- a bill,
- purchase,
- event,
- job,
- restaurant,
- travel booking,
- message,
- deadline,
- coupon,
- recipe,
- book,
- movie,
- generic item.

### Information Extraction

Extract:

- dates,
- amounts,
- products,
- destinations,
- companies,
- roles,
- requested actions,
- people,
- places,
- deadlines.

### Intent Understanding

Example:

> Can you send me the document before we speak on Friday?

Result:

```json
{
  "type": "task",
  "title": "Send document",
  "deadline": "2026-09-25",
  "suggestedAction": "REMINDER",
  "confidence": 0.84
}
```

### Visual Understanding

Useful for:

- travel screenshots,
- event posters,
- product screenshots,
- restaurant posts,
- receipts with complex layouts,
- screenshots where text alone is insufficient.

---

## 14. On-Device AI

The long-term preference should be to run smaller models locally wherever practical.

Potential local tasks:

- classification,
- intent detection,
- entity extraction,
- summarization,
- screenshot understanding,
- embeddings for semantic search.

Benefits:

```text
No mandatory cloud request
Lower latency
Lower recurring cost
Better privacy
Works offline
```

Cloud AI should be an optional fallback for complex cases.

The user should know when content would leave the device.

---

## 15. OCR and Native Capabilities

Recommended:

### iOS

- Apple Vision for OCR where appropriate,
- native QR scanning,
- native calendar APIs,
- local notifications,
- Share Extension.

### Android

- ML Kit for OCR where appropriate,
- QR/barcode scanning,
- native calendar APIs,
- local notifications,
- share intents.

The raw image should not be uploaded merely to extract obvious text.

---

## 16. Cross-Platform Architecture

Recommended mobile stack:

- **React Native**
- **TypeScript**
- small native integrations in Swift and Kotlin.

Architecture:

```text
                  React Native
                       │
             ┌─────────┴──────────┐
             │                    │
            iOS                Android
             │                    │
           Swift                 Kotlin
             │                    │
      Share Extension         Share Intents
      Native OCR             Native OCR
      Notifications          Notifications
      Calendar               Calendar
```

React Native should handle most shared product logic:

- UI,
- navigation,
- SQLite,
- collections,
- local search,
- item management,
- reminder configuration,
- settings,
- AI orchestration.

---

## 17. Main Screens

### 17.1 Today

Focus only on items requiring attention.

```text
TODAY

⚡ Electricity Bill
₹2,840 · Due tomorrow
[Done] [Later]

💬 Reply to Rahul
From WhatsApp
Today 7 PM
[Done] [Later]
```

### 17.2 Inbox

Recently shared items.

```text
INBOX

📦 Sony Headphones
Return by Sep 28

🎟 DevFest
Oct 5 · Bengaluru

🍜 Burma Burma
Places to Try

📖 Designing Data-Intensive Applications
Reading List
```

### 17.3 Collections

Automatically generated collections:

```text
🛒 Buy Later
🍜 Places to Try
💼 Jobs
🎬 Watchlist
📚 Reading List
✈️ Travel Ideas
🎟 Events
🧾 Receipts
🎟 Coupons
🛡 Warranties
```

The user should not have to organize every item manually.

### 17.4 Search

Support queries such as:

- sony,
- bills,
- jobs,
- restaurants,
- things expiring this month,
- books,
- upcoming trips,
- items due this week.

V1 can use SQLite search.

Later versions can add local embeddings and semantic search.

---

## 18. Remind Until Done

This should be a major product differentiator.

A normal reminder is easy to dismiss and forget.

RecallLater should support unresolved obligations.

Example:

```text
Electricity bill
Due Sep 28

Remind:
✓ Sep 27 · 7 PM
✓ Sep 28 · 9 AM

Until:
● I mark it done
○ Due date passes
```

Users should control reminder intensity.

Suggested reminder modes:

- Save only
- Remind once
- Remind until done
- Critical deadline

Avoid notification spam.

---

## 19. Price Tracking

Price tracking is one of the few features that naturally requires server-side work.

Example:

```text
Amazon Product
Current price: ₹8,499

Alert below:
₹7,500
```

Privacy-friendly design:

```text
Screenshot → stays local
Product URL / identifier → may be sent to server
Price polling → server
Price alert → push/local notification
```

Do not upload the entire screenshot merely to track price.

---

## 20. Calendar Integration

For:

- flights,
- trains,
- events,
- interviews,
- appointments,
- deadlines.

Offer an explicit action:

```text
[Add to Calendar]
```

Always show extracted details before writing to the calendar.

---

## 21. Places

For:

- restaurants,
- cafes,
- hotels,
- travel destinations,
- addresses,
- landmarks.

Create a **Places to Try** / **Travel Ideas** experience.

Example:

```text
Burma Burma
Bengaluru

Source: Instagram

[Open Maps]
[Visited]
```

---

## 22. Jobs

A job post can become:

```text
Software Engineer II
Company: Stripe
Location: Bengaluru
Deadline: Oct 10
Source: LinkedIn

Status: Saved

[Apply]
[Applied]
```

Later, job status can evolve into:

```text
Saved → Applied → Interview → Closed
```

This should remain a collection inside RecallLater rather than turning the whole app into a job tracker.

---

## 23. Coupons

Example:

```text
Swiggy
Code: DINNER200
₹200 OFF
Expires: Sep 30

[Copy Code]
[Remind Sep 29]
```

Expired coupons can be automatically archived.

---

## 24. Recipes

Example:

```text
Paneer Butter Masala

Ingredients:
□ Paneer
□ Tomato
□ Onion
□ Butter
□ Cream
□ Garam masala

[Save Recipe]
[Add Ingredients to List]
```

A grocery-list integration can be added later.

---

## 25. QR Codes

Detect QR codes automatically.

Possible cases:

### URL

```text
QR detected
https://example.com/event

[Open]
[Save]
```

### Wi-Fi

```text
Wi-Fi QR
SSID: HomeWiFi

[Connect]
```

### Contact

```text
Contact QR

John Smith
+91 ...

[Save Contact]
```

Any permission-sensitive action should require explicit user confirmation.

---

## 26. Offline Behavior

Most of RecallLater should work offline.

Offline-capable features:

- saving screenshots,
- saving PDFs,
- OCR,
- deterministic parsing,
- reminders,
- collections,
- local search,
- QR extraction,
- reading/watch lists,
- receipt storage,
- generic tasks,
- local classification if an on-device model is available.

Internet should only be required for things such as:

- price tracking,
- cloud backup,
- cross-device sync,
- optional enhanced AI,
- online place enrichment,
- external metadata lookup.

---

## 27. Backend Strategy

### V1

A meaningful first version can be built with almost no backend:

```text
React Native
+
SQLite
+
Private local filesystem
+
On-device OCR
+
Local notifications
+
Native share integration
```

### Backend becomes necessary for:

- price tracking,
- optional cloud AI,
- encrypted cloud backup,
- cross-device sync,
- shared household inboxes,
- push notifications originating from remote checks,
- external enrichment.

If/when needed, a simple backend can use:

- Node.js or FastAPI,
- PostgreSQL,
- S3-compatible object storage.

Avoid premature microservices, Kafka, Kubernetes, or other infrastructure unless usage actually demands it.

---

## 28. Suggested Technical Stack

| Layer | Choice |
|---|---|
| Mobile | React Native + TypeScript |
| iOS native integration | Swift |
| Android native integration | Kotlin |
| Local database | SQLite |
| Local file storage | Private app filesystem |
| OCR iOS | Apple Vision |
| OCR Android | ML Kit |
| QR | Native APIs / ML Kit |
| Notifications | Native local notifications |
| Calendar | Native OS calendar APIs |
| Local AI | Small on-device model where practical |
| Cloud AI | Optional fallback |
| Backend | Node.js or FastAPI when required |
| Cloud DB | PostgreSQL |
| Object storage | S3-compatible storage |

---

## 29. V1 Scope

Do not ship every category at once.

The first version should prove the core behavior:

> **I received something important → I shared it to RecallLater → it understood it → it resurfaced it when useful.**

### Inputs

- screenshot,
- image,
- PDF,
- URL,
- text.

### Content Types

- bill,
- message/deadline,
- event,
- purchase,
- receipt,
- travel,
- generic item.

### Actions

- save,
- remind,
- remind until done,
- add to calendar,
- mark complete,
- archive.

### Screens

- Today,
- Inbox,
- Collections,
- Search,
- Settings.

---

## 30. V1.5 Scope

Add:

- jobs,
- coupons,
- places,
- books,
- movies/shows,
- recipes,
- QR flows,
- warranties,
- return tracking.

---

## 31. V2 Scope

Potential additions:

- price tracking,
- local semantic search,
- travel destination recognition,
- encrypted cloud backup,
- cross-device sync,
- shared household inboxes,
- widgets,
- richer local models,
- smart recurring workflows.

---

## 32. North-Star UX

The product should always optimize for this:

```text
See something important
        ↓
Share
        ↓
RecallLater

"We found:

Electricity Bill
₹2,840
Due Sep 28

Remind Sep 27?"

        ↓

[Save]

        ↓

Done
```

The user should not need to:

- manually enter the amount,
- manually type the date,
- manually create a folder,
- manually copy the title,
- navigate through several screens.

---

## 33. Product Success Criteria

Before investing heavily in backend infrastructure or advanced AI, validate the behavior.

Key questions:

- Do users naturally remember to share items into RecallLater?
- Do extracted actions save enough time to feel worth it?
- Do users trust local-first processing?
- Do reminders bring people back at the right time?
- Do users create recurring behavior around the app?

A useful early activation metric:

> **Percentage of new users who save 3+ real items in their first 7 days.**

A useful retention signal:

> **Users return because RecallLater resurfaced something they genuinely needed to act on.**

---

## 34. Principles

1. **Local-first by default.**
2. **No broad gallery/email/message access required.**
3. **Action-first, not archive-first.**
4. **AI should be invisible when possible.**
5. **Use deterministic parsing before AI.**
6. **Cloud processing should be optional wherever possible.**
7. **Show extracted information before creating consequential actions.**
8. **Avoid notification spam.**
9. **Do not require signup for first use.**
10. **Optimize for a 2–3 tap share-to-action workflow.**

---

## 35. One-Line Vision

> **RecallLater is a private, intelligent inbox that turns anything users intentionally share from their phone into something useful they can act on later.**
