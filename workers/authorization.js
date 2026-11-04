export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validUuid(value) { return typeof value === 'string' && UUID_RE.test(value); }
export function jsonError(message, status, headers) {
  return new Response(JSON.stringify({error: message}), {status, headers});
}

// Never treat an Origin header, salon ID or client-side permission flag as authentication.
export async function authorizeSalon(request, env, salonId, options = {}) {
  if (!validUuid(salonId)) return {ok:false,status:400,error:'Ongeldig salon_id'};
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return {ok:false,status:401,error:'Log opnieuw in'};
  const apiKey = env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY;
  if (!apiKey || !env.SUPABASE_URL) return {ok:false,status:503,error:'Authenticatie niet beschikbaar'};
  try {
    const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {headers:{apikey:apiKey,Authorization:authorization}});
    if (!userResponse.ok) return {ok:false,status:401,error:'Ongeldige of verlopen sessie'};
    const user = await userResponse.json();
    if (!validUuid(user.id)) return {ok:false,status:401,error:'Ongeldige sessie'};
    const headers = {apikey:apiKey,Authorization:env.SUPABASE_SERVICE_ROLE ? `Bearer ${apiKey}` : authorization};
    const salonResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/salons?id=eq.${salonId}&select=id,owner_id,naam,plan`,{headers});
    if (!salonResponse.ok) throw new Error('Salon lookup failed');
    const salon = (await salonResponse.json())?.[0];
    if (salon?.owner_id === user.id) return {ok:true,user,salon,owner:true};
    if (salon && !options.ownerOnly && options.module) {
      const staffResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/medewerkers?salon_id=eq.${salonId}&auth_user_id=eq.${user.id}&actief=eq.true&select=id,rechten`,{headers});
      if (!staffResponse.ok) throw new Error('Staff lookup failed');
      const staff = (await staffResponse.json())?.[0];
      if (staff && (options.allowed || ['bewerken']).includes(staff.rechten?.[options.module])) {
        return {ok:true,user,salon,owner:false,staff};
      }
    }
    return {ok:false,status:403,error:'Geen toegang tot deze salon of functie'};
  } catch {
    return {ok:false,status:503,error:'Toegang kon niet worden gecontroleerd. Probeer opnieuw.'};
  }
}
