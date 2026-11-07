-- Add publication status to beats.
-- Existing beats remain published automatically.

ALTER TABLE public.beats
ADD COLUMN is_published boolean NOT NULL DEFAULT true;

-- Replace unrestricted public beat visibility.
DROP POLICY IF EXISTS
  "Beats are viewable by everyone."
ON public.beats;

-- Everyone can read published beats.
-- Authenticated producers can also read their own
-- unpublished beats in their dashboards.
CREATE POLICY "Published or owned beats are viewable"
ON public.beats
FOR SELECT
TO public
USING (
  is_published = true
  OR producer_id = (SELECT auth.uid())
);