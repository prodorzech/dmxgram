-- Create user_likes table for tracking user likes/follows
CREATE TABLE IF NOT EXISTS public.user_likes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  liker_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  liked_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate likes: one user can only like another user once
  UNIQUE(liker_id, liked_user_id),
  
  -- Prevent self-likes at database level
  CONSTRAINT no_self_like CHECK (liker_id != liked_user_id)
);

-- Create index for fast lookups of likes by user
CREATE INDEX IF NOT EXISTS idx_user_likes_liked_user_id ON public.user_likes(liked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_likes_liker_id ON public.user_likes(liker_id);

-- Note: RLS is handled at the application level via auth middleware
