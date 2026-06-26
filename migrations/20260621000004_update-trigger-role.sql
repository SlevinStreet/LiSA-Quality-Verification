CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS '
DECLARE
  user_role text;
BEGIN
  -- Check if a specific role is passed in user metadata, otherwise fall back to email keyword rules
  user_role := NEW.raw_user_meta_data->>''role'';
  
  IF user_role IS NULL THEN
    IF NEW.email ILIKE ''%supervisor%'' THEN
      user_role := ''supervisor'';
    ELSIF NEW.email ILIKE ''%dev%'' OR NEW.email ILIKE ''%sys%'' THEN
      user_role := ''developer'';
    ELSE
      user_role := ''admin'';
    END IF;
  END IF;

  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, user_role)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role,
    updated_at = now();

  RETURN NEW;
END;
';
