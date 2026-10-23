'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getProfile } from '@/lib/supabase/getProfile';
import { revalidatePath } from 'next/cache';
import { createSign } from 'crypto';
import { sanitizePhone, sanitizeEmail } from '@/lib/utils/contact';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';

export interface CubProfileFields {
  cub_first_name?: string;
  cub_last_name?: string;
  grade?: string;
  stream?: string;
  school_name?: string;
}

export interface ParentProfileFields {
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  parent_email?: string;
  preferred_language?: string;
  alternative_contact_name?: string;
  alternative_contact_phone?: string;
}

export type ProfileUpdateResult =
  | { success: true; sheetSynced: boolean; sheetError?: string }
  | { success: false; error: string };

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getGoogleWriteToken(): Promise<string> {
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const rawKey  = (process.env.GOOGLE_PRIVATE_KEY ?? '').trim();
  const privateKeyPem = rawKey.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const b64url = (s: string) =>
    Buffer.from(s).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const header   = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = b64url(JSON.stringify({
    iss:   saEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600, iat: now,
  }));
  const signingInput = `${header}.${claimSet}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput, 'utf8');
  const sig = signer.sign(privateKeyPem,'base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${sig}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body, cache:'no-store',
  });
  const td = await tokenRes.json();
  if (!td.access_token) throw new Error(`Google auth failed: ${JSON.stringify(td).slice(0,300)}`);
  return td.access_token;
}

function colLetter(idx: number): string {
  let letter=''; let n=idx+1;
  while(n>0){const rem=(n-1)%26;letter=String.fromCharCode(65+rem)+letter;n=Math.floor((n-1)/26);}
  return letter;
}

function findCol(headers: string[], ...aliases: string[]): number {
  for(const alias of aliases){
    const idx=headers.findIndex(h=>h.trim().toLowerCase()===alias.toLowerCase());
    if(idx>=0) return idx;
  }
  return -1;
}

interface SheetField { aliases: string[]; value: string; }

async function writeToSheet(sheetId:string,tab:string,cubId:string,fields:SheetField[]): Promise<{success:boolean;error?:string}> {
  try {
    const token = await getGoogleWriteToken();
    const enc = encodeURIComponent(`'${tab}'`);
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${enc}?valueRenderOption=UNFORMATTED_VALUE`,
      {headers:{Authorization:`Bearer ${token}`},cache:'no-store'}
    );
    if(!readRes.ok) return {success:false,error:`Sheets read failed (${readRes.status})`};
    const rows:any[][] = (await readRes.json()).values??[];
    if(rows.length<2) return {success:false,error:'Sheet has no data rows'};
    const headers=rows[0].map((h:any)=>String(h??'').trim().toLowerCase());
    const cubIdCol=findCol(headers,'cub id','id','cub_id','student id','student_id');
    if(cubIdCol<0) return {success:false,error:'cub_id column not found in sheet'};
    const clean=cubId.trim().toUpperCase();
    const rowIdx=rows.findIndex((r,i)=>i>0&&String(r[cubIdCol]??'').trim().toUpperCase()===clean);
    if(rowIdx<0) return {success:false,error:`Cub ${cubId} not found in sheet`};
    const rowNum=rowIdx+1;
    const updateData:{range:string;values:any[][]}[]=[];
    for(const field of fields){
      let col=findCol(headers,...field.aliases);
      if(col<0) {
        col = headers.length;
        const defaultHeaderName = field.aliases[0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        headers.push(field.aliases[0]);
        updateData.push({range:`'${tab}'!${colLetter(col)}1`,values:[[defaultHeaderName]]});
      }
      updateData.push({range:`'${tab}'!${colLetter(col)}${rowNum}`,values:[[field.value]]});
    }
    if(updateData.length===0) return {success:true};
    const writeRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({valueInputOption:'USER_ENTERED',data:updateData}),
      cache:'no-store',
    });
    if(!writeRes.ok){const e=await writeRes.text();return {success:false,error:`Sheet write failed (${writeRes.status}): ${e.slice(0,300)}`};}
    return {success:true};
  } catch(err:any){return {success:false,error:err?.message??'Unknown sheet write error'};}
}

async function verifyOwnership(cubId:string) {
  try {
    const sysSession = await getSystemAdminSession();
    if (sysSession?.role === 'super_admin') return;
  } catch {
    // fall through
  }
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) throw new Error('Unauthorized');
  const profile=await getProfile(supabase,user.id);
  if(!profile) throw new Error('Profile not found');
  if(profile.role==='admin') return;
  const effectiveName=profile.sheet_rep_name||profile.full_name;
  const {data:cub}=await supabase.from('cubs').select('relationship_owner').eq('cub_id',cubId).single();
  if(!cub||cub.relationship_owner!==effectiveName) throw new Error('Unauthorized — you do not own this cub');
}

async function verifyFamilyOwnership(familyId: number) {
  try {
    const sysSession = await getSystemAdminSession();
    if (sysSession?.role === 'super_admin') return;
  } catch {
    // fall through
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const profile = await getProfile(supabase, user.id);
  if (!profile) throw new Error('Profile not found');
  if (profile.role === 'admin') return;
  const effectiveName = profile.sheet_rep_name || profile.full_name;
  const { data: fam } = await supabase.from('families').select('relationship_owner').eq('id', familyId).single();
  if (!fam || fam.relationship_owner !== effectiveName) throw new Error('Unauthorized — you do not own this family');
}

async function getSheetConfig(db:ReturnType<typeof getServiceClient>) {
  const {data}=await db.from('app_config').select('key,value').in('key',['sheet_directory_id','sheet_directory_tab']);
  const map:Record<string,string>={};
  for(const row of data??[]) map[row.key]=row.value;
  return {sheetId:map['sheet_directory_id']??null,tab:map['sheet_directory_tab']??'Master'};
}

export async function updateCubProfile(cubId:string,fields:CubProfileFields): Promise<ProfileUpdateResult> {
  if(!cubId?.trim()) return {success:false,error:'Cub ID is required'};
  try{await verifyOwnership(cubId);}catch(err:any){return {success:false,error:err.message};}
  const db=getServiceClient();
  const masterUpdate:Record<string,any>={updated_at:new Date().toISOString()};
  if(fields.cub_first_name!==undefined) masterUpdate.cub_first_name=fields.cub_first_name.trim();
  if(fields.cub_last_name!==undefined)  masterUpdate.cub_last_name=fields.cub_last_name.trim();
  if(Object.keys(masterUpdate).length>1){
    const {error}=await db.from('master_cubs').update(masterUpdate).eq('cub_id',cubId);
    if(error) return {success:false,error:`master_cubs update: ${error.message}`};
  }
  const cubsUpdate:Record<string,any>={updated_at:new Date().toISOString()};
  if(fields.grade!==undefined)       cubsUpdate.grade=fields.grade.trim();
  if(fields.stream!==undefined)      cubsUpdate.stream=fields.stream.trim();
  if(fields.school_name!==undefined) cubsUpdate.school_name=fields.school_name.trim();
  if(Object.keys(cubsUpdate).length>1){
    const {error}=await db.from('cubs').update(cubsUpdate).eq('cub_id',cubId);
    if(error) return {success:false,error:`cubs update: ${error.message}`};
  }
  revalidatePath('/directory');
  const sheetFields:SheetField[]=[];
  if(fields.cub_first_name!==undefined) sheetFields.push({aliases:['cub first name','first name','cub first','firstname'],value:fields.cub_first_name.trim()});
  if(fields.cub_last_name!==undefined)  sheetFields.push({aliases:['cub last name','last name','cub last','lastname'],value:fields.cub_last_name.trim()});
  if(fields.grade!==undefined)          sheetFields.push({aliases:['grade'],value:fields.grade.trim()});
  if(fields.stream!==undefined)         sheetFields.push({aliases:['stream'],value:fields.stream.trim()});
  if(fields.school_name!==undefined)    sheetFields.push({aliases:['school name','school','school_name'],value:fields.school_name.trim()});
  if(sheetFields.length===0) return {success:true,sheetSynced:false};
  const {sheetId,tab}=await getSheetConfig(db);
  if(!sheetId) return {success:true,sheetSynced:false,sheetError:'Sheet ID not configured'};
  const result=await writeToSheet(sheetId,tab,cubId,sheetFields);
  return {success:true,sheetSynced:result.success,sheetError:result.error};
}

export async function updateParentProfile(cubId:string,fields:ParentProfileFields): Promise<ProfileUpdateResult> {
  if(!cubId?.trim()) return {success:false,error:'Cub ID is required'};
  try{await verifyOwnership(cubId);}catch(err:any){return {success:false,error:err.message};}
  const db=getServiceClient();
  const {data:currentMaster}=await db.from('master_cubs').select('parent_phone,parent_email').eq('cub_id',cubId).single();
  if(!currentMaster) return {success:false,error:'Could not find master record for this cub'};
  const oldPhone = sanitizePhone(currentMaster.parent_phone);
  const oldEmail = sanitizeEmail(currentMaster.parent_email);
  const masterUpdate:Record<string,any>={updated_at:new Date().toISOString()};
  if(fields.parent_first_name!==undefined) masterUpdate.parent_first_name=fields.parent_first_name.trim();
  if(fields.parent_last_name!==undefined)  masterUpdate.parent_last_name=fields.parent_last_name.trim();
  if(fields.parent_phone!==undefined)      masterUpdate.parent_phone=fields.parent_phone.trim();
  if(fields.parent_email!==undefined)      masterUpdate.parent_email=sanitizeEmail(fields.parent_email) ?? null;
  if(fields.preferred_language!==undefined) masterUpdate.preferred_language=fields.preferred_language.trim();
  if(fields.alternative_contact_name!==undefined) masterUpdate.alternative_contact_name=fields.alternative_contact_name.trim();
  if(fields.alternative_contact_phone!==undefined) masterUpdate.alternative_contact_phone=fields.alternative_contact_phone.trim();

  if(Object.keys(masterUpdate).length<=1) return {success:true,sheetSynced:false};
  let siblingQ=db.from('master_cubs').select('cub_id');
  if(oldPhone && oldEmail) siblingQ=siblingQ.or(`parent_phone.eq.${oldPhone},parent_email.eq.${oldEmail}`);
  else if(oldPhone) siblingQ=siblingQ.eq('parent_phone',oldPhone);
  else if(oldEmail) siblingQ=siblingQ.eq('parent_email',oldEmail);
  else siblingQ=siblingQ.eq('cub_id',cubId);
  const {data:siblingRows}=await siblingQ;
  const allCubIds:string[]=(siblingRows??[]).map((r:any)=>r.cub_id);
  if(!allCubIds.includes(cubId)) allCubIds.push(cubId);
  const {error:mcErr}=await db.from('master_cubs').update(masterUpdate).in('cub_id',allCubIds);
  if(mcErr) return {success:false,error:`master_cubs update: ${mcErr.message}`};
  
  const famUpdate:Record<string,any>={updated_at:new Date().toISOString()};
  if(fields.parent_first_name!==undefined) famUpdate.parent_first_name=fields.parent_first_name.trim();
  if(fields.parent_last_name!==undefined)  famUpdate.parent_last_name=fields.parent_last_name.trim();
  if(fields.parent_phone!==undefined)      famUpdate.parent_phone=fields.parent_phone.trim();
  if(fields.parent_email!==undefined)      famUpdate.parent_email=fields.parent_email.trim().toLowerCase();
  if(fields.preferred_language!==undefined) famUpdate.preferred_language=fields.preferred_language.trim();
  if(fields.alternative_contact_name!==undefined) famUpdate.alternative_contact_name=fields.alternative_contact_name.trim();
  if(fields.alternative_contact_phone!==undefined) famUpdate.alternative_contact_phone=fields.alternative_contact_phone.trim();
  
  if(oldPhone) await db.from('families').update(famUpdate).eq('parent_phone',oldPhone);
  else if(oldEmail) await db.from('families').update(famUpdate).eq('parent_email',oldEmail);

  // Also update cubs table with contact preferences
  const cubsPrefUpdate:Record<string,any>={updated_at:new Date().toISOString()};
  if(fields.preferred_language!==undefined) cubsPrefUpdate.preferred_language=fields.preferred_language.trim();
  if(fields.alternative_contact_name!==undefined) cubsPrefUpdate.alternative_contact_name=fields.alternative_contact_name.trim();
  if(fields.alternative_contact_phone!==undefined) cubsPrefUpdate.alternative_contact_phone=fields.alternative_contact_phone.trim();
  if(Object.keys(cubsPrefUpdate).length>1) {
    await db.from('cubs').update(cubsPrefUpdate).in('cub_id',allCubIds);
  }

  revalidatePath('/directory');
  const sheetFields:SheetField[]=[];
  if(fields.parent_first_name!==undefined) sheetFields.push({aliases:['parent first name','parent first','guardian first name'],value:fields.parent_first_name.trim()});
  if(fields.parent_last_name!==undefined)  sheetFields.push({aliases:['parent last name','parent last','guardian last name'],value:fields.parent_last_name.trim()});
  if(fields.parent_phone!==undefined)      sheetFields.push({aliases:['parent phone','phone','guardian phone','contact'],value:fields.parent_phone.trim()});
  if(fields.parent_email!==undefined)      sheetFields.push({aliases:['parent email','email','guardian email'],value:fields.parent_email.trim().toLowerCase()});
  if(fields.preferred_language!==undefined) sheetFields.push({aliases:['preferred mode of language','preferred language','mode of language','language'],value:fields.preferred_language.trim()});
  if(fields.alternative_contact_name!==undefined) sheetFields.push({aliases:['alternative contact name','alt contact name','alternative name','alt name'],value:fields.alternative_contact_name.trim()});
  if(fields.alternative_contact_phone!==undefined) sheetFields.push({aliases:['alternative number','alternative contact number','alternative phone','alt phone','alt number'],value:fields.alternative_contact_phone.trim()});

  if(sheetFields.length===0) return {success:true,sheetSynced:false};
  const {sheetId,tab}=await getSheetConfig(db);
  if(!sheetId) return {success:true,sheetSynced:false,sheetError:'Sheet ID not configured'};
  const writeResults=await Promise.all(allCubIds.map(id=>writeToSheet(sheetId,tab,id,sheetFields)));
  const failed=writeResults.filter(r=>!r.success);
  return {
    success:true,
    sheetSynced:failed.length===0,
    sheetError:failed.map(r=>r.error).filter(Boolean).join('; ')||undefined,
  };
}

export async function updateFamilyProfile(familyId: number, fields: ParentProfileFields): Promise<ProfileUpdateResult> {
  if (!familyId) return { success: false, error: 'Family ID is required' };
  try { await verifyFamilyOwnership(familyId); } catch (err: any) { return { success: false, error: err.message }; }
  const db = getServiceClient();
  const { data: fam } = await db.from('families').select('parent_phone, parent_email').eq('id', familyId).single();
  if (!fam) return { success: false, error: 'Family not found' };

  const oldPhone = sanitizePhone(fam.parent_phone);
  const oldEmail = sanitizeEmail(fam.parent_email);

  const famUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
  if (fields.parent_first_name !== undefined) famUpdate.parent_first_name = fields.parent_first_name.trim();
  if (fields.parent_last_name !== undefined)  famUpdate.parent_last_name = fields.parent_last_name.trim();
  if (fields.parent_phone !== undefined)      famUpdate.parent_phone = fields.parent_phone.trim();
  if (fields.parent_email !== undefined)      famUpdate.parent_email = sanitizeEmail(fields.parent_email) ?? null;
  if (fields.preferred_language !== undefined) famUpdate.preferred_language = fields.preferred_language.trim();
  if (fields.alternative_contact_name !== undefined) famUpdate.alternative_contact_name = fields.alternative_contact_name.trim();
  if (fields.alternative_contact_phone !== undefined) famUpdate.alternative_contact_phone = fields.alternative_contact_phone.trim();

  const { error: famErr } = await db.from('families').update(famUpdate).eq('id', familyId);
  if (famErr) return { success: false, error: `families update: ${famErr.message}` };

  const masterUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
  if (fields.parent_first_name !== undefined) masterUpdate.parent_first_name = fields.parent_first_name.trim();
  if (fields.parent_last_name !== undefined)  masterUpdate.parent_last_name = fields.parent_last_name.trim();
  if (fields.parent_phone !== undefined)      masterUpdate.parent_phone = fields.parent_phone.trim();
  if (fields.parent_email !== undefined)      masterUpdate.parent_email = sanitizeEmail(fields.parent_email) ?? null;
  if (fields.preferred_language !== undefined) masterUpdate.preferred_language = fields.preferred_language.trim();
  if (fields.alternative_contact_name !== undefined) masterUpdate.alternative_contact_name = fields.alternative_contact_name.trim();
  if (fields.alternative_contact_phone !== undefined) masterUpdate.alternative_contact_phone = fields.alternative_contact_phone.trim();

  let allCubIds: string[] = [];
  if (oldPhone || oldEmail) {
    let siblingQ = db.from('master_cubs').select('cub_id');
    if (oldPhone && oldEmail) {
      siblingQ = siblingQ.or(`parent_phone.eq.${oldPhone},parent_email.eq.${oldEmail}`);
    } else if (oldPhone) {
      siblingQ = siblingQ.eq('parent_phone', oldPhone);
    } else if (oldEmail) {
      siblingQ = siblingQ.eq('parent_email', oldEmail);
    }
    const { data: siblingRows } = await siblingQ;
    allCubIds = (siblingRows ?? []).map((r: any) => r.cub_id);
    if (allCubIds.length > 0) {
      const { error: mcErr } = await db.from('master_cubs').update(masterUpdate).in('cub_id', allCubIds);
      if (mcErr) console.error('master_cubs update error during family update:', mcErr.message);

      const cubsPrefUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
      if (fields.preferred_language !== undefined) cubsPrefUpdate.preferred_language = fields.preferred_language.trim();
      if (fields.alternative_contact_name !== undefined) cubsPrefUpdate.alternative_contact_name = fields.alternative_contact_name.trim();
      if (fields.alternative_contact_phone !== undefined) cubsPrefUpdate.alternative_contact_phone = fields.alternative_contact_phone.trim();
      if (Object.keys(cubsPrefUpdate).length > 1) {
        await db.from('cubs').update(cubsPrefUpdate).in('cub_id', allCubIds);
      }
    }
  }

  revalidatePath('/directory');

  const sheetFields: SheetField[] = [];
  if (fields.parent_first_name !== undefined) sheetFields.push({ aliases: ['parent first name', 'parent first', 'guardian first name'], value: fields.parent_first_name.trim() });
  if (fields.parent_last_name !== undefined)  sheetFields.push({ aliases: ['parent last name', 'parent last', 'guardian last name'], value: fields.parent_last_name.trim() });
  if (fields.parent_phone !== undefined)      sheetFields.push({ aliases: ['parent phone', 'phone', 'guardian phone', 'contact'], value: fields.parent_phone.trim() });
  if (fields.parent_email !== undefined)      sheetFields.push({ aliases: ['parent email', 'email', 'guardian email'], value: fields.parent_email.trim().toLowerCase() });
  if (fields.preferred_language !== undefined) sheetFields.push({ aliases: ['preferred mode of language', 'preferred language', 'mode of language', 'language'], value: fields.preferred_language.trim() });
  if (fields.alternative_contact_name !== undefined) sheetFields.push({ aliases: ['alternative contact name', 'alt contact name', 'alternative name', 'alt name'], value: fields.alternative_contact_name.trim() });
  if (fields.alternative_contact_phone !== undefined) sheetFields.push({ aliases: ['alternative number', 'alternative contact number', 'alternative phone', 'alt phone', 'alt number'], value: fields.alternative_contact_phone.trim() });

  if (sheetFields.length === 0 || allCubIds.length === 0) return { success: true, sheetSynced: false };

  const { sheetId, tab } = await getSheetConfig(db);
  if (!sheetId) return { success: true, sheetSynced: false, sheetError: 'Sheet ID not configured' };

  const writeResults = await Promise.all(allCubIds.map(id => writeToSheet(sheetId, tab, id, sheetFields)));
  const failed = writeResults.filter(r => !r.success);
  return {
    success: true,
    sheetSynced: failed.length === 0,
    sheetError: failed.map(r => r.error).filter(Boolean).join('; ') || undefined,
  };
}

export async function updateCubAndParentProfile(
  cubId: string,
  cubFields: CubProfileFields,
  parentFields: ParentProfileFields
): Promise<ProfileUpdateResult> {
  if (!cubId?.trim()) return { success: false, error: 'Cub ID is required' };
  try { await verifyOwnership(cubId); } catch (err: any) { return { success: false, error: err.message }; }
  const db = getServiceClient();

  const { data: currentMaster } = await db.from('master_cubs').select('parent_phone,parent_email').eq('cub_id', cubId).single();
  const oldPhone = sanitizePhone(currentMaster?.parent_phone);
  const oldEmail = sanitizeEmail(currentMaster?.parent_email);

  const masterSelfUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
  if (cubFields.cub_first_name !== undefined) masterSelfUpdate.cub_first_name = cubFields.cub_first_name.trim();
  if (cubFields.cub_last_name !== undefined)  masterSelfUpdate.cub_last_name = cubFields.cub_last_name.trim();
  if (cubFields.grade !== undefined)          masterSelfUpdate.grade = cubFields.grade.trim();
  if (cubFields.stream !== undefined)         masterSelfUpdate.stream = cubFields.stream.trim();
  if (cubFields.school_name !== undefined)    masterSelfUpdate.school_name = cubFields.school_name.trim();

  const cubsUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
  if (cubFields.grade !== undefined)          cubsUpdate.grade = cubFields.grade.trim();
  if (cubFields.stream !== undefined)         cubsUpdate.stream = cubFields.stream.trim();
  if (cubFields.school_name !== undefined)    cubsUpdate.school_name = cubFields.school_name.trim();
  if (parentFields.preferred_language !== undefined) cubsUpdate.preferred_language = parentFields.preferred_language.trim();
  if (parentFields.alternative_contact_name !== undefined) cubsUpdate.alternative_contact_name = parentFields.alternative_contact_name.trim();
  if (parentFields.alternative_contact_phone !== undefined) cubsUpdate.alternative_contact_phone = parentFields.alternative_contact_phone.trim();
  if (Object.keys(cubsUpdate).length > 1) {
    const { error: cErr } = await db.from('cubs').update(cubsUpdate).eq('cub_id', cubId);
    if (cErr) return { success: false, error: `cubs update: ${cErr.message}` };
  }

  const parentUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
  if (parentFields.parent_first_name !== undefined) parentUpdate.parent_first_name = parentFields.parent_first_name.trim();
  if (parentFields.parent_last_name !== undefined)  parentUpdate.parent_last_name = parentFields.parent_last_name.trim();
  if (parentFields.parent_phone !== undefined)      parentUpdate.parent_phone = parentFields.parent_phone.trim();
  if (parentFields.parent_email !== undefined)      parentUpdate.parent_email = sanitizeEmail(parentFields.parent_email) ?? null;
  if (parentFields.preferred_language !== undefined) parentUpdate.preferred_language = parentFields.preferred_language.trim();
  if (parentFields.alternative_contact_name !== undefined) parentUpdate.alternative_contact_name = parentFields.alternative_contact_name.trim();
  if (parentFields.alternative_contact_phone !== undefined) parentUpdate.alternative_contact_phone = parentFields.alternative_contact_phone.trim();

  let siblingQ = db.from('master_cubs').select('cub_id');
  if (oldPhone && oldEmail) siblingQ = siblingQ.or(`parent_phone.eq.${oldPhone},parent_email.eq.${oldEmail}`);
  else if (oldPhone) siblingQ = siblingQ.eq('parent_phone', oldPhone);
  else if (oldEmail) siblingQ = siblingQ.eq('parent_email', oldEmail);
  else siblingQ = siblingQ.eq('cub_id', cubId);

  const { data: siblingRows } = await siblingQ;
  const allCubIds: string[] = (siblingRows ?? []).map((r: any) => r.cub_id);
  if (!allCubIds.includes(cubId)) allCubIds.push(cubId);

  if (Object.keys(parentUpdate).length > 1) {
    const { error: pErr } = await db.from('master_cubs').update(parentUpdate).in('cub_id', allCubIds);
    if (pErr) return { success: false, error: `master_cubs parent update: ${pErr.message}` };

    if (oldPhone) await db.from('families').update(parentUpdate).eq('parent_phone', oldPhone);
    else if (oldEmail) await db.from('families').update(parentUpdate).eq('parent_email', oldEmail);

    const cubsPrefUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
    if (parentFields.preferred_language !== undefined) cubsPrefUpdate.preferred_language = parentFields.preferred_language.trim();
    if (parentFields.alternative_contact_name !== undefined) cubsPrefUpdate.alternative_contact_name = parentFields.alternative_contact_name.trim();
    if (parentFields.alternative_contact_phone !== undefined) cubsPrefUpdate.alternative_contact_phone = parentFields.alternative_contact_phone.trim();
    if (Object.keys(cubsPrefUpdate).length > 1) {
      await db.from('cubs').update(cubsPrefUpdate).in('cub_id', allCubIds);
    }
  }

  if (Object.keys(masterSelfUpdate).length > 1) {
    const { error: mErr } = await db.from('master_cubs').update(masterSelfUpdate).eq('cub_id', cubId);
    if (mErr) return { success: false, error: `master_cubs update: ${mErr.message}` };
  }

  revalidatePath('/directory');

  const cubSheetFields: SheetField[] = [];
  if (cubFields.cub_first_name !== undefined) cubSheetFields.push({ aliases: ['cub first name', 'first name', 'cub first', 'firstname'], value: cubFields.cub_first_name.trim() });
  if (cubFields.cub_last_name !== undefined)  cubSheetFields.push({ aliases: ['cub last name', 'last name', 'cub last', 'lastname'], value: cubFields.cub_last_name.trim() });
  if (cubFields.grade !== undefined)          cubSheetFields.push({ aliases: ['grade'], value: cubFields.grade.trim() });
  if (cubFields.stream !== undefined)         cubSheetFields.push({ aliases: ['stream'], value: cubFields.stream.trim() });
  if (cubFields.school_name !== undefined)    cubSheetFields.push({ aliases: ['school name', 'school', 'school_name'], value: cubFields.school_name.trim() });

  const parentSheetFields: SheetField[] = [];
  if (parentFields.parent_first_name !== undefined) parentSheetFields.push({ aliases: ['parent first name', 'parent first', 'guardian first name'], value: parentFields.parent_first_name.trim() });
  if (parentFields.parent_last_name !== undefined)  parentSheetFields.push({ aliases: ['parent last name', 'parent last', 'guardian last name'], value: parentFields.parent_last_name.trim() });
  if (parentFields.parent_phone !== undefined)      parentSheetFields.push({ aliases: ['parent phone', 'phone', 'guardian phone', 'contact'], value: parentFields.parent_phone.trim() });
  if (parentFields.parent_email !== undefined)      parentSheetFields.push({ aliases: ['parent email', 'email', 'guardian email'], value: parentFields.parent_email.trim().toLowerCase() });
  if (parentFields.preferred_language !== undefined) parentSheetFields.push({ aliases: ['preferred mode of language', 'preferred language', 'mode of language', 'language'], value: parentFields.preferred_language.trim() });
  if (parentFields.alternative_contact_name !== undefined) parentSheetFields.push({ aliases: ['alternative contact name', 'alt contact name', 'alternative name', 'alt name'], value: parentFields.alternative_contact_name.trim() });
  if (parentFields.alternative_contact_phone !== undefined) parentSheetFields.push({ aliases: ['alternative number', 'alternative contact number', 'alternative phone', 'alt phone', 'alt number'], value: parentFields.alternative_contact_phone.trim() });

  const { sheetId, tab } = await getSheetConfig(db);
  if (!sheetId) return { success: true, sheetSynced: false, sheetError: 'Sheet ID not configured' };

  const thisCubFields = [...cubSheetFields, ...parentSheetFields];
  const writePromises: Promise<{ success: boolean; error?: string }>[] = [];
  if (thisCubFields.length > 0) {
    writePromises.push(writeToSheet(sheetId, tab, cubId, thisCubFields));
  }

  if (parentSheetFields.length > 0) {
    const siblingIds = allCubIds.filter(id => id !== cubId);
    for (const sibId of siblingIds) {
      writePromises.push(writeToSheet(sheetId, tab, sibId, parentSheetFields));
    }
  }

  const results = await Promise.all(writePromises);
  const failed = results.filter(r => !r.success);

  return {
    success: true,
    sheetSynced: failed.length === 0,
    sheetError: failed.map(r => r.error).filter(Boolean).join('; ') || undefined,
  };
}

// ─── Save Preferred Language (bypasses approval queue) ──────────────────────
// This is an instant-apply action: any rep can change the parent's preferred language
// without going through the contact_edit_requests approval workflow.
export async function savePreferredLanguage(
  { cubId, familyId, language }: { cubId?: string; familyId?: number; language: string }
): Promise<ProfileUpdateResult> {
  const lang = language.trim();
  if (!lang) return { success: false, error: 'Language is required' };
  if (!cubId && !familyId) return { success: false, error: 'Either cubId or familyId is required' };

  const db = getServiceClient();
  const now = new Date().toISOString();

  let allCubIds: string[] = [];
  let oldPhone: string | null = null;
  let oldEmail: string | null = null;

  if (cubId) {
    // Resolve parent contact from the cub to find all siblings
    const { data: master } = await db.from('master_cubs').select('parent_phone, parent_email').eq('cub_id', cubId).single();
    if (!master) return { success: false, error: 'Cub not found' };
    oldPhone = sanitizePhone(master.parent_phone);
    oldEmail = sanitizeEmail(master.parent_email);

    let siblingQ = db.from('master_cubs').select('cub_id');
    if (oldPhone && oldEmail) siblingQ = siblingQ.or(`parent_phone.eq.${oldPhone},parent_email.eq.${oldEmail}`);
    else if (oldPhone) siblingQ = siblingQ.eq('parent_phone', oldPhone);
    else if (oldEmail) siblingQ = siblingQ.eq('parent_email', oldEmail);
    else siblingQ = siblingQ.eq('cub_id', cubId);
    const { data: siblingRows } = await siblingQ;
    allCubIds = (siblingRows ?? []).map((r: any) => r.cub_id);
    if (!allCubIds.includes(cubId)) allCubIds.push(cubId);
  } else if (familyId) {
    const { data: fam } = await db.from('families').select('parent_phone, parent_email').eq('id', familyId).single();
    if (!fam) return { success: false, error: 'Family not found' };
    oldPhone = sanitizePhone(fam.parent_phone);
    oldEmail = sanitizeEmail(fam.parent_email);

    if (oldPhone || oldEmail) {
      let siblingQ = db.from('master_cubs').select('cub_id');
      if (oldPhone && oldEmail) siblingQ = siblingQ.or(`parent_phone.eq.${oldPhone},parent_email.eq.${oldEmail}`);
      else if (oldPhone) siblingQ = siblingQ.eq('parent_phone', oldPhone);
      else siblingQ = siblingQ.eq('parent_email', oldEmail!);
      const { data: siblingRows } = await siblingQ;
      allCubIds = (siblingRows ?? []).map((r: any) => r.cub_id);
    }
  }

  // Update master_cubs
  if (allCubIds.length > 0) {
    await db.from('master_cubs').update({ preferred_language: lang, updated_at: now }).in('cub_id', allCubIds);
    await db.from('cubs').update({ preferred_language: lang, updated_at: now }).in('cub_id', allCubIds);
  }

  // Update families
  if (familyId) {
    await db.from('families').update({ preferred_language: lang, updated_at: now }).eq('id', familyId);
  } else if (oldPhone) {
    await db.from('families').update({ preferred_language: lang, updated_at: now }).eq('parent_phone', oldPhone);
  } else if (oldEmail) {
    await db.from('families').update({ preferred_language: lang, updated_at: now }).eq('parent_email', oldEmail);
  }

  revalidatePath('/directory');

  // Sync to Google Sheet for each cub
  if (allCubIds.length > 0) {
    const sheetFields: SheetField[] = [
      { aliases: ['preferred mode of language', 'preferred language', 'mode of language', 'language'], value: lang },
    ];
    const { sheetId, tab } = await getSheetConfig(db);
    if (sheetId) {
      const results = await Promise.all(allCubIds.map(id => writeToSheet(sheetId, tab, id, sheetFields)));
      const failed = results.filter(r => !r.success);
      return {
        success: true,
        sheetSynced: failed.length === 0,
        sheetError: failed.map(r => r.error).filter(Boolean).join('; ') || undefined,
      };
    }
  }

  return { success: true, sheetSynced: false };
}
