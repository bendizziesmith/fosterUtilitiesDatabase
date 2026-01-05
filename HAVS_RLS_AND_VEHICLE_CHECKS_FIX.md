# HAVS Week Creation RLS Fix & Vehicle Check List Update

## Critical Fixes Implemented

### 1. HAVS Week Creation RLS Policy Fix

**Problem**: Creating new HAVS weeks failed with RLS policy violation error.

**Root Cause**: The `havs_weeks` table was missing the `created_by` column required by RLS policies to verify the authenticated user has permission to create records.

**Solution**:
- Added `created_by UUID NOT NULL` column to `havs_weeks` table
- Backfilled existing records with appropriate user IDs
- Updated RLS INSERT policy to check `auth.uid() = created_by`
- Updated edge function to set `created_by: user.id` on insert
- Added authorization check to ensure users only create weeks for themselves

**Database Migration**: `add_created_by_to_havs_weeks`
```sql
-- Added created_by column
ALTER TABLE havs_weeks ADD COLUMN created_by uuid NOT NULL;

-- New INSERT policy
CREATE POLICY "Employees can create their own havs weeks"
ON havs_weeks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);
```

**Edge Function Update**: `start-havs-week/index.ts`
- Validates user profile exists
- Verifies user can only create weeks for their own employee_id
- Sets `created_by: user.id` on week creation
- Prevents unauthorized week creation

### 2. Vehicle & Plant Check List Update

**Problem**: Old checklist was too generic and didn't reflect actual UK site requirements.

**Solution**: Replaced entire checklist with comprehensive H&S compliant items.

**New Checklist** (10 items):
1. All van wheels, tyres, mirrors, windscreen and lights
2. No damage, dents, scrapes, cracks or defects
3. All internal instruments, E-Management light
4. Digger & trailer – wheels, tracks, jockey wheel & electrics
5. Pecker & buckets, quick hitch, hoses & couplers
6. Cutting tools – Stihl saw, floor saw & dust suppression
7. Trench rammer
8. Cable locator & genny
9. Petrol breaker, fuel cans & spill kit
10. All PPE – Fire extinguisher 2kg, first aid kit, eye wash & RAMS

**Files Updated**:
- `src/apps/employee/components/SingleQuestionInspection.tsx` - Updated checklist
- All UI labels changed from "Vehicle Check" to "Vehicle & Plant Check":
  - `src/components/TabNavigation.tsx`
  - `src/apps/admin/components/InspectionDetails.tsx`
  - `src/apps/admin/components/DailyComplianceChart.tsx`
  - `src/apps/admin/components/InspectionTable.tsx`
  - `src/apps/admin/AdminApp.tsx`

## Security Improvements

### Authorization Flow
1. User authenticates with JWT
2. Edge function validates token
3. Fetches user profile to verify employee_id
4. Ensures `ganger_id` in request matches user's `employee_id`
5. Sets `created_by` to `auth.uid()` for RLS compliance
6. RLS policy validates on insert

### Data Integrity
- One active HAVS week per ganger
- Users can only create weeks for themselves
- All week creation auditable via `created_by` field
- Previous weeks remain immutable

## Testing Checklist

- [ ] Employee can create new HAVS week
- [ ] Cannot create duplicate weeks
- [ ] Cannot create weeks for other employees
- [ ] RLS policy blocks unauthorized inserts
- [ ] Vehicle & Plant Check shows all 10 new items
- [ ] All defect workflows function correctly
- [ ] Build succeeds without errors

## Compliance Notes

This update ensures:
- Proper audit trail for HAVS week creation
- Legal H&S compliance for vehicle & plant checks
- Matches real UK construction site requirements
- Supports HSE inspection requirements
