-- Create user_likes table for tracking user likes/follows
CREATE TABLE IF NOT EXISTS public.user_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  liked_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate likes: one user can only like another user once
  UNIQUE(liker_id, liked_user_id),
  
  -- Prevent self-likes at database level
  CONSTRAINT no_self_like CHECK (liker_id != liked_user_id)
);

-- Create index for fast lookups of likes by user
CREATE INDEX IF NOT EXISTS idx_user_likes_liked_user_id ON public.user_likes(liked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_likes_liker_id ON public.user_likes(liker_id);

-- Enable Row-Level Security (RLS) for privacy
ALTER TABLE public.user_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view who liked a user (public information)
CREATE POLICY "Anyone can view likes" 
  ON public.user_likes 
  FOR SELECT 
  USING (true);

-- Policy: Users can only add likes under their own user_id
CREATE POLICY "Users can only like as themselves" 
  ON public.user_likes 
  FOR INSERT 
  WITH CHECK (auth.uid() = liker_id);

-- Policy: Users can only remove their own likes
CREATE POLICY "Users can only unlike their own likes" 
  ON public.user_likes 
  FOR DELETE 
  USING (auth.uid() = liker_id);
