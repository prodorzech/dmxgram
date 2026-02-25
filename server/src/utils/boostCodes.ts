import { getSupabase } from '../database';

export interface BoostCodeUse {
  userId: string;
  username: string;
  usedAt: Date;
}

export interface BoostCode {
  code: string;
  durationDays: number;
  maxUses: number;
  usesLeft: number;
  createdAt: Date;
  note?: string;
  usedBy: BoostCodeUse[];
}

function rowToCode(row: any, uses: any[] = []): BoostCode {
  return {
    code: row.code,
    durationDays: row.duration_days,
    maxUses: row.max_uses,
    usesLeft: row.uses_left,
    createdAt: new Date(row.created_at),
    note: row.note ?? undefined,
    usedBy: uses.map(u => ({
      userId: u.user_id,
      username: u.username,
      usedAt: new Date(u.used_at),
    })),
  };
}

/** Generate a random alphanumeric code, e.g. "BOOST-A3FX92" */
export async function createBoostCode(durationDays: number, maxUses: number, note?: string): Promise<BoostCode> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 8; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  const code = `BOOST-${rand}`;

  const { data, error } = await getSupabase()
    .from('boost_codes')
    .insert({
      code,
      duration_days: durationDays,
      max_uses: maxUses,
      uses_left: maxUses,
      note: note ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createBoostCode DB error: ${error.message}`);
  return rowToCode(data, []);
}

/** Returns the code entry if valid and has uses remaining, otherwise null */
export async function validateBoostCode(code: string): Promise<BoostCode | null> {
  const { data, error } = await getSupabase()
    .from('boost_codes')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .gt('uses_left', 0)
    .single();

  if (error || !data) return null;
  return rowToCode(data, []);
}

/**
 * Mark the code as used by a user.
 * Returns false if code not found, exhausted, or already used by this user.
 */
export async function redeemBoostCode(code: string, userId: string, username: string): Promise<boolean> {
  const supabase = getSupabase();
  const normalised = code.toUpperCase().trim();

  // Fetch latest code row
  const { data: codeRow, error: fetchErr } = await supabase
    .from('boost_codes')
    .select('uses_left')
    .eq('code', normalised)
    .single();

  if (fetchErr || !codeRow || codeRow.uses_left <= 0) return false;

  // Check if this user already used it
  const { data: existing } = await supabase
    .from('boost_code_uses')
    .select('id')
    .eq('code', normalised)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return false;

  // Insert use record (UNIQUE constraint prevents double-use race)
  const { error: insertErr } = await supabase
    .from('boost_code_uses')
    .insert({ code: normalised, user_id: userId, username });

  if (insertErr) return false;

  // Decrement uses_left
  await supabase
    .from('boost_codes')
    .update({ uses_left: codeRow.uses_left - 1 })
    .eq('code', normalised);

  return true;
}

/** Delete a code (and its uses via CASCADE) */
export async function deleteBoostCode(code: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from('boost_codes')
    .delete({ count: 'exact' })
    .eq('code', code.toUpperCase().trim());

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Undo a redemption (rollback) — removes the use record and restores uses_left.
 * Used when the downstream user-update fails so the code isn't wasted.
 */
export async function undoRedeemBoostCode(code: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const normalised = code.toUpperCase().trim();
  try {
    await supabase.from('boost_code_uses').delete().eq('code', normalised).eq('user_id', userId);
    // Re-read uses_left and increment (safer than blind +1)
    const { data } = await supabase.from('boost_codes').select('uses_left').eq('code', normalised).single();
    if (data) {
      await supabase.from('boost_codes').update({ uses_left: data.uses_left + 1 }).eq('code', normalised);
    }
  } catch (e) {
    console.error('undoRedeemBoostCode failed:', e);
  }
}

/** List all codes with their redemption history */
export async function listBoostCodes(): Promise<BoostCode[]> {
  const supabase = getSupabase();

  const { data: codes, error: codesErr } = await supabase
    .from('boost_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (codesErr || !codes) return [];

  // Fetch all uses in a single query
  const { data: uses } = await supabase
    .from('boost_code_uses')
    .select('*');

  const usesMap: Record<string, any[]> = {};
  for (const u of (uses ?? [])) {
    if (!usesMap[u.code]) usesMap[u.code] = [];
    usesMap[u.code].push(u);
  }

  return codes.map((row: any) => rowToCode(row, usesMap[row.code] ?? []));
}
