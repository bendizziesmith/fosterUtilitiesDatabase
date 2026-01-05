# HAVS Week Lifecycle Fix

## Problem Solved
Fixed critical data safety issue where changing weeks would reuse previous week data, violating legal health and safety compliance requirements.

## Changes Implemented

### 1. Backend Edge Function
**File**: `supabase/functions/start-havs-week/index.ts`

New secure endpoint for creating HAVS weeks:
- Validates that week doesn't already exist (prevents duplicates)
- Creates new week record with `status: 'draft'`
- Creates ganger member entry
- Optionally carries over gang members (people only, no data)
- NEVER copies exposure data, totals, comments, or submission state

### 2. Start New Week Modal
**File**: `src/apps/employee/components/StartNewWeekModal.tsx`

Complete modal workflow:
- Week selector with grace period logic (Mon/Tue applies to previous week)
- Shows next 2 upcoming Sundays and previous 2 weeks (read-only)
- Gang member checkboxes with clear warning about data reset
- Explicit audit warning that all values start at zero
- Creates week via secure API call

### 3. HAVS Form Updates
**File**: `src/apps/employee/components/HavsTimesheetForm.tsx`

Critical behavior changes:
- Removed auto-creation logic (`loadOrCreateHavsWeek` → `loadHavsWeek`)
- Added "Start New HAVS Week" button (primary action, top right)
- Shows clear message when no week exists for selected date
- Week selector now navigation-only with helper text
- Loads new week immediately after creation

## Data Safety Guarantees

1. **One Record Per Week**: Each employee gets exactly one HAVS record per week
2. **Immutable Snapshots**: Previous weeks remain unchanged for audit purposes
3. **Zero Initial State**: All new weeks start with 0 exposure minutes
4. **No Data Bleed**: Equipment data, comments, and totals never carry over
5. **Explicit Creation**: Weeks only created through intentional user action

## User Flow

### Creating a New Week
1. Employee clicks "Start New HAVS Week" button
2. Modal opens with:
   - Week ending selector (defaults to previous Sunday with grace period)
   - Optional gang member carry-over (people only, not data)
   - Clear audit warning about zero values
3. Employee confirms
4. New week created via API
5. Page reloads into new week with empty timesheets

### Viewing Past Weeks
1. Employee clicks week selector
2. Modal shows available weeks for viewing
3. Helper text directs to "Start New HAVS Week" for creation
4. Selecting week navigates to that week (no data mutation)

## Legal Compliance

This fix ensures:
- Each week is an independent legal record
- No accidental data reuse between weeks
- Clear audit trail of week creation
- Prevents HSE compliance violations
- Maintains data integrity for inspections
