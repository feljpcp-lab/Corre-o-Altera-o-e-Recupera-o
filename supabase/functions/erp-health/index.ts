import { createClient } from "jsr:@supabase/supabase-js@2";
Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method Not Allowed",{status:405});
  const auth=req.headers.get("Authorization");
  if(!auth) return Response.json({ok:false,error:"unauthorized"},{status:401});
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")?.split(",")[0] || Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user) return Response.json({ok:false,error:"unauthorized"},{status:401});
  const {data,error:dbError}=await supabase.from("ordens_servico").select("id").limit(1);
  return Response.json({ok:!dbError,user_id:user.id,database:!dbError,checked_at:new Date().toISOString(),sample_rows:data?.length||0});
});