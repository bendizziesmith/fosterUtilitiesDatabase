# HAVS Week Lifecycle and RLS Fix

## Summary

This migration fixes the critical HAVS week creation bugs and implements proper UK week ending with grace period rules.

## Critical Bugs Fixed

### Bug A: "Cannot create new week" (RLS Error)

**Root Cause**: The INSERT policy checked `auth.uid() = created_by` but the user_profiles table might not have a row for the authenticated user, causing silent failures in subqueries.

**Solution**:
1. Created `handle_new_user()` trigger on `auth.users` to auto-create user_profiles on signup
2. Created `ensure_user_profile()` fallback function for existing users
3. Updated INSERT policy to check both `created_by` and `ganger_id` ownership
4. Changed week creation to use database RPC instead of edge function

### Bug B: "User profile not found"

**Root Cause**: Users authenticated via Supabase auth but their corresponding user_profiles row was missing.

**Solution**:
1. Trigger automatically creates profile on auth.users INSERT
2. Profile links to employee via email matching
3. Fallback function `ensure_user_profile()` handles legacy users

## Week Ending Grace Period Rules

UK HAVS compliance requires submissions to be attributed correctly:

| Day | Week Ending Applied |
|-----|---------------------|
| Sunday | This Sunday |
| Monday | Previous Sunday |
| Tuesday | Previous Sunday |
| Wednesday | Next Sunday |
| Thursday | Next Sunday |
| Friday | Next Sunday |
| Saturday | Next Sunday |

**Function**: `get_havs_week_ending(reference_date, timezone_name)`

This function is used consistently across:
- Employee hub current week display
- Employee timesheet record page
- Employer dashboard default filter
- Submission logic
- "Start New HAVS Week" default selection

## Database Changes

### New Functions

1. **`handle_new_user()`** - Trigger function for auth.users INSERT
2. **`ensure_user_profile()`** - Fallback to create missing profiles
3. **`get_havs_week_ending(date, text)`** - Week ending with grace period
4. **`create_havs_week(date, uuid[])`** - Transactional week creation RPC
5. **`get_viewable_week_endings(int)`** - Returns viewable weeks (past + current)
6. **`get_startable_week_endings(uuid)`** - Returns weeks available for new week creation

### RLS Policy Changes

**havs_weeks INSERT policy** now checks:
- `auth.uid() IS NOT NULL`
- `created_by = auth.uid()`
- `ganger_id IN (SELECT employee_id FROM user_profiles WHERE id = auth.uid())`

**user_profiles policies** separated into:
- SELECT: own profile + admins can view all
- INSERT: own profile only
- UPDATE: own profile only

## Frontend Changes

### StartNewWeekModal

- Now uses `create_havs_week` RPC instead of edge function
- Week options fetched from `get_startable_week_endings`
- Disabled weeks shown for dates where week already exists
- Only current + next 2 weeks available for selection

### HavsTimesheetForm

- "View Week" selector now uses `get_viewable_week_endings`
- Shows only past weeks + current effective week
- Cannot select future weeks (must use "Start New HAVS Week")
- Grace period note displayed in UI

### HavsEmployerDashboard

- Default filter now uses `get_havs_week_ending` for effective week
- Shows active week label in header
- "All Weeks" moved to bottom of dropdown (not default)

## Week Creation Flow

1. User clicks "Start New HAVS Week"
2. Modal shows available week endings (effective + next 2)
3. User selects week and optionally carries over members
4. Frontend calls `create_havs_week` RPC
5. RPC:
   - Validates user has profile with employee_id
   - Checks no duplicate week exists
   - Creates havs_week row atomically
   - Creates ganger member row
   - Copies selected member people (not data)
   - Returns success with week data
6. Frontend navigates to new week
7. All exposure values start at 0

## Data Integrity Rules

1. **One active HAVS week per ganger per week_ending**
2. **Historic weeks are immutable** (read-only after submission)
3. **No data carries over** - Only people can be copied
4. **All exposure values reset to 0** for new weeks
5. **Audit trail maintained** via revisions table

## Acceptance Tests

- [x] New week creation works for authenticated ganger (no RLS error)
- [x] No "User profile not found" for any existing or new user
- [x] Employee cannot view/select future weeks in "View Week"
- [x] Only way to move forward is "Start New HAVS Week"
- [x] Starting a new week resets all minutes to 0 while optionally carrying over people
- [x] Employer dashboard defaults to current effective week (not All Weeks)
- [x] Build succeeds without errors
