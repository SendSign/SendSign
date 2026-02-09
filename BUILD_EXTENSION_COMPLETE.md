# CoSeal BUILD_RECIPE_EXTENSION — Steps 24-26 Complete 🎯

**Date:** February 8, 2026  
**Status:** Extension features implemented, ready for integration testing

---

## Summary

Successfully completed Steps 24, 25, and 26 from the BUILD_RECIPE_EXTENSION document, closing the remaining parity gaps with DocuSign's advanced features.

---

## Step 24 — Delegated Signing & Custody Transfer ✅

### 24.1 Delegated Signing

**What it does:** Allows signers to transfer their signing responsibility to another person.

**Implemented:**
- ✅ Added `delegatedFrom` UUID column to `signers` table (references `signers.id`)
- ✅ Created `POST /api/sign/:token/delegate` endpoint
  - Validates signer status (must be `pending` or `notified` - can't delegate after starting)
  - Creates new signer record with fresh token
  - Reassigns all fields from original to delegate
  - Voids original signer's token (status set to `delegated`)
  - Logs audit event with delegation chain
  - Sends signing notification to delegate
- ✅ Added delegation UI to signing page (`SigningPage.tsx`)
  - "Delegate to someone else" banner shown before any fields are filled
  - Modal with delegate name and email input
  - Confirmation flow with proper UX
- ✅ Updated Certificate of Completion to show delegation chain
  - Format: "↳ Delegated from: [name] ([email]) on [date]"

**Files Modified:**
- `src/db/schema.ts` — Added `delegatedFrom` column
- `src/api/routes/signing.ts` — Added delegation endpoint
- `src/crypto/completionCert.ts` — Updated certificate to show delegation
- `signing-ui/src/pages/SigningPage.tsx` — Added delegation modal and UI

### 24.2 Custody Transfer

**What it does:** Allows envelope ownership to be transferred from one sender to another.

**Implemented:**
- ✅ Created `PUT /api/envelopes/:id/transfer` endpoint
  - Request body: `{ newOwnerId: string }`
  - Validates: only current owner can transfer
  - Validates: envelope status must be `draft`, `sent`, or `in_progress`
  - Updates `created_by` field
  - Logs audit event: `transferred` with old/new owner metadata

**Files Modified:**
- `src/api/routes/envelopes.ts` — Added transfer endpoint

---

## Step 25 — Locked Templates & Shared Folders ✅

### 25.1 Locked Templates

**What it does:** Admin-controlled templates that users can instantiate but not modify.

**Implemented:**
- ✅ Added columns to `templates` table:
  - `isLocked` BOOLEAN (default false)
  - `lockedBy` TEXT (user who locked it)
  - `lockedAt` TIMESTAMPTZ
- ✅ Created template management endpoints:
  - `PUT /api/templates/:id/lock` — Lock a template (only creator or admin)
  - `PUT /api/templates/:id/unlock` — Unlock a template (only locker or admin)
  - `POST /api/templates/:id/duplicate` — Create unlocked copy with name "[Original] (Copy)"
  - Updated `PUT /api/templates/:id` — Rejects edits with 403 if locked
  - Updated `DELETE /api/templates/:id` — Rejects deletion with 403 if locked

**Files Modified:**
- `src/db/schema.ts` — Added lock columns to templates table
- `src/api/routes/templates.ts` — Added lock/unlock/duplicate endpoints, updated update/delete

### 25.2 Shared Folders

**What it does:** Folder organization for envelopes with sharing capabilities.

**Implemented:**
- ✅ Created `folders` table:
  - Supports nested folders (`parentId` references `folders.id`)
  - Created by user with `sharedWith` array for sharing
- ✅ Created `envelope_folders` junction table:
  - Many-to-many relationship (envelopes can be in multiple folders)
- ✅ Created folder CRUD endpoints:
  - `POST /api/folders` — Create folder (with optional parent and sharing)
  - `GET /api/folders` — List folders for user (owned + shared)
  - `GET /api/folders/:id` — Get specific folder
  - `PUT /api/folders/:id` — Update folder name and sharing
  - `DELETE /api/folders/:id` — Delete folder (preserves envelopes)
  - `POST /api/folders/:id/envelopes` — Add envelope(s) to folder
  - `DELETE /api/folders/:id/envelopes/:envelopeId` — Remove envelope from folder
  - `GET /api/folders/:id/envelopes` — List envelopes in folder

**Files Modified:**
- `src/db/schema.ts` — Added `folders` and `envelope_folders` tables
- `src/api/routes/envelopes.ts` — Added all folder endpoints

---

## Step 26 — Delayed Routing ✅

**What it does:** Timer-based delays between signing steps (cooling-off periods, regulatory waiting periods).

**Implemented:**
- ✅ Added `delayedUntil` TIMESTAMPTZ column to `signers` table
- ✅ Extended routing rules to support delay action:
  - `condition: 'after_signer_completes'`
  - `action: 'delay'`
  - `delayHours: number`
  - `then: 'advance_to_next'`
- ✅ Updated `signingOrder.ts` → `onSignerCompleted()`:
  - Checks for delay routing rules after signer completion
  - Sets `delayedUntil` timestamp on next signer(s)
  - Sets signer status to `delayed`
  - Logs audit event: `delayed` with metadata
  - Does NOT send notification immediately
- ✅ Created `src/workflow/delayProcessor.ts`:
  - `processDelayedSigners()` — Finds signers where `status = 'delayed'` and `delayed_until <= now()`
  - Updates status to `notified`, clears `delayed_until`
  - Sends signing notification to delayed signer
  - Logs audit event: `delay_completed`
  - Designed to run via hourly cron job
- ✅ Added `setSignerDelayed()` helper for programmatically setting delays

**Files Modified:**
- `src/db/schema.ts` — Added `delayedUntil` column to signers
- `src/workflow/signingOrder.ts` — Updated routing logic with delay support
- `src/workflow/delayProcessor.ts` — Created delay processor (new file)

---

## Database Schema Changes

All schema changes implemented in `src/db/schema.ts`:

```typescript
// signers table additions
delegatedFrom: uuid('delegated_from').references(() => signers.id),
delayedUntil: timestamp('delayed_until', { withTimezone: true }),

// templates table additions
isLocked: boolean('is_locked').notNull().default(false),
lockedBy: text('locked_by'),
lockedAt: timestamp('locked_at', { withTimezone: true }),

// New folders table
export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references(() => folders.id),
  createdBy: text('created_by').notNull(),
  sharedWith: text('shared_with').array().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// New envelope_folders junction table
export const envelopeFolders = pgTable('envelope_folders', {
  envelopeId: uuid('envelope_id').notNull().references(() => envelopes.id),
  folderId: uuid('folder_id').notNull().references(() => folders.id),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## API Endpoints Added

### Delegation & Transfer
- `POST /api/sign/:token/delegate` — Delegate signing to another person
- `PUT /api/envelopes/:id/transfer` — Transfer envelope ownership

### Template Locking
- `PUT /api/templates/:id` — Update template (rejects if locked)
- `DELETE /api/templates/:id` — Delete template (rejects if locked)
- `PUT /api/templates/:id/lock` — Lock a template
- `PUT /api/templates/:id/unlock` — Unlock a template
- `POST /api/templates/:id/duplicate` — Create unlocked copy

### Folders
- `POST /api/folders` — Create folder
- `GET /api/folders` — List folders for user
- `GET /api/folders/:id` — Get folder
- `PUT /api/folders/:id` — Update folder
- `DELETE /api/folders/:id` — Delete folder
- `POST /api/folders/:id/envelopes` — Add envelopes to folder
- `DELETE /api/folders/:id/envelopes/:envelopeId` — Remove envelope from folder
- `GET /api/folders/:id/envelopes` — List envelopes in folder

---

## UI Changes

### Signing Page Enhancements
- Added delegation banner (only visible before any fields are filled)
- Added delegation modal with name and email inputs
- User-friendly "Can't sign right now? Delegate to someone else" prompt
- Proper loading states and error handling

---

## Testing Recommendations

### Delegation Testing
1. Create envelope with 2 signers (sequential)
2. Open signing link for signer 1
3. Click "Delegate to someone else"
4. Enter delegate name/email, confirm
5. Verify original token voided, new token created
6. Verify delegate receives notification
7. Verify fields reassigned to delegate
8. Verify Certificate of Completion shows delegation chain

### Custody Transfer Testing
1. Create envelope as user A
2. Transfer envelope to user B via API
3. Verify `created_by` updated in database
4. Verify audit trail logged transfer event
5. Try to transfer completed envelope → verify rejection

### Template Locking Testing
1. Create template as admin
2. Lock template via API
3. Try to edit locked template → verify 403 rejection
4. Try to delete locked template → verify 403 rejection
5. Duplicate locked template → verify copy is unlocked
6. Unlock template → verify edits allowed again

### Folder Testing
1. Create folder via API
2. Add 3 envelopes to folder
3. List folder contents → verify all 3 envelopes present
4. Create nested folder (parent_id set)
5. Share folder with another user (add to sharedWith array)
6. List folders as shared user → verify shared folder visible
7. Delete folder → verify envelopes still exist, just removed from folder

### Delayed Routing Testing
1. Create envelope with routing rule: delay 2 hours after signer 1
2. Signer 1 completes
3. Verify signer 2 status = `delayed`, `delayed_until` set to now + 2 hours
4. Verify signer 2 does NOT receive notification yet
5. Manually run `processDelayedSigners()` after delay period
6. Verify signer 2 status = `notified`, notification sent
7. Verify audit trail shows `delayed` and `delay_completed` events

---

## Cron Job Requirements

**Add to scheduled tasks:**

```typescript
// Every hour, process delayed signers
import { processDelayedSigners } from './workflow/delayProcessor.js';

cron.schedule('0 * * * *', async () => {
  const count = await processDelayedSigners();
  console.log(`Processed ${count} delayed signers`);
});
```

---

## Migration Notes

When deploying these changes, run the following SQL (via Drizzle migration):

```sql
-- Add delegation support
ALTER TABLE signers ADD COLUMN delegated_from UUID REFERENCES signers(id);
ALTER TABLE signers ADD COLUMN delayed_until TIMESTAMPTZ;

-- Add template locking
ALTER TABLE templates ADD COLUMN is_locked BOOLEAN DEFAULT false;
ALTER TABLE templates ADD COLUMN locked_by TEXT;
ALTER TABLE templates ADD COLUMN locked_at TIMESTAMPTZ;

-- Create folders
CREATE TABLE folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES folders(id),
    created_by  TEXT NOT NULL,
    shared_with TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_folders_created_by ON folders(created_by);

-- Create envelope-folder junction
CREATE TABLE envelope_folders (
    envelope_id UUID NOT NULL REFERENCES envelopes(id),
    folder_id   UUID NOT NULL REFERENCES folders(id),
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (envelope_id, folder_id)
);

CREATE INDEX idx_envelope_folders_envelope ON envelope_folders(envelope_id);
CREATE INDEX idx_envelope_folders_folder ON envelope_folders(folder_id);
```

---

## What's Next

**Remaining Extension Steps (not implemented):**
- Step 27 — RBAC (Role-Based Access Control)
- Step 28 — Advanced Analytics Dashboard
- Step 29 — Mobile SDK
- Step 30 — Blockchain Anchoring

**Integration Tasks:**
- Update E2E test suite to cover new features
- Update API documentation with new endpoints
- Add Cowork plugin commands for delegation and folder management
- Update CHANGELOG for v1.1.0

---

## Files Created/Modified

### New Files
- `src/workflow/delayProcessor.ts` — Delay processor for cooling-off periods

### Modified Files (Schema)
- `src/db/schema.ts` — Added columns to signers, templates; created folders and envelope_folders tables

### Modified Files (Backend)
- `src/api/routes/signing.ts` — Added delegation endpoint
- `src/api/routes/envelopes.ts` — Added transfer endpoint, folder endpoints
- `src/api/routes/templates.ts` — Added lock/unlock/duplicate, updated update/delete
- `src/workflow/signingOrder.ts` — Added delay routing logic
- `src/crypto/completionCert.ts` — Added delegation chain display

### Modified Files (Frontend)
- `signing-ui/src/pages/SigningPage.tsx` — Added delegation UI

---

**CoSeal now includes enterprise-grade delegation, folder organization, template locking, and delayed routing features — closing the remaining parity gaps with DocuSign!**

Built with Claude Sonnet 4.5 in Agent mode.
