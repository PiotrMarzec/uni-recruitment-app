DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'verification' AND enumtypid = 'stage_type'::regtype) THEN
    ALTER TYPE "stage_type" ADD VALUE 'verification';
  END IF;
END $$;
