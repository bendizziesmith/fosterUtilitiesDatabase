/*
  # Add Anonymous Access Policy for Vehicles

  1. Security
    - Allow anonymous users to view vehicles for login flow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vehicles' AND policyname = 'Anonymous users can view vehicles'
  ) THEN
    CREATE POLICY "Anonymous users can view vehicles"
      ON vehicles FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;