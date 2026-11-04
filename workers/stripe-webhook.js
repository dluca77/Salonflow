export async function verifyStripeEvent(payload,header,secret){
 if(!secret)throw new Error('Webhook secret missing');
 const parts=(header||'').split(',').map(x=>x.split('='));
 const timestamp=parts.find(([k])=>k==='t')?.[1];
 if(!/^\d+$/.test(timestamp||''))throw new Error('Invalid timestamp');
 const age=Date.now()/1000-Number(timestamp);if(age>300||age< -60)throw new Error('Expired signature');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const data=new TextEncoder().encode(timestamp+'.'+payload);
 for(const [name,value] of parts){
  if(name!=='v1'||!/^[a-f0-9]{64}$/i.test(value))continue;
  if(await crypto.subtle.verify('HMAC',key,Uint8Array.from(value.match(/../g),x=>parseInt(x,16)),data)){
   const event=JSON.parse(payload);if(!/^evt_[A-Za-z0-9]+$/.test(event.id||''))throw new Error('Invalid event');return event;
  }
 }
 throw new Error('Invalid signature');
}
function planFor(price,env){
 for(const [plan,key] of [['starter','STARTER'],['pro','PRO'],['business','BUSINESS']]){
  if(price&&(price===env['PRICE_'+key+'_M']||price===env['PRICE_'+key+'_Y']))return plan;
 }
 throw new Error('Unknown subscription price');
}
export async function processStripeWebhook(request,env,connected,{query,get}){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let event;
 try{event=await verifyStripeEvent(await request.text(),request.headers.get('stripe-signature'),connected?env.STRIPE_CONNECT_WEBHOOK_SECRET:env.STRIPE_WEBHOOK_SECRET);}
 catch{return new Response('Invalid webhook signature or configuration',{status:400});}
 try{
  const obj=event.data.object,meta=obj.metadata||{},actions=[];
  if(!connected){
   if(event.type==='checkout.session.completed'&&obj.mode==='subscription'&&meta.salon_id){
    const sub=await get(env,`subscriptions/${obj.subscription}`);
    actions.push({kind:'salon_plan',salon_id:meta.salon_id,customer:obj.customer,subscription:obj.subscription,plan:['active','trialing'].includes(sub.status)?planFor(sub.items?.data?.[0]?.price?.id,env):'free'});
   }else if(event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
    // Delivery order is not guaranteed: use Stripe's current state, not the event snapshot.
    const sub=await get(env,`subscriptions/${obj.id}`);
    actions.push({kind:'salon_plan',customer:sub.customer,subscription:sub.id,plan:!['active','trialing'].includes(sub.status)?'free':planFor(sub.items?.data?.[0]?.price?.id,env)});
   }
  }else{
   if(!/^acct_[A-Za-z0-9]+$/.test(event.account||''))throw new Error('Missing connected account');
   const account=event.account;
   if(event.type==='checkout.session.completed'){
    if(obj.mode==='subscription'&&meta.plan_id){
     actions.push({kind:'abo_start',account,plan_id:meta.plan_id,subscription:obj.subscription,customer:obj.customer,name:meta.klant_naam,email:obj.customer_details?.email});
    }else if(meta.afspraak_id){
     const action={kind:'appointment',account,appointment_id:meta.afspraak_id,customer:obj.customer,paid:obj.mode==='payment'&&obj.payment_status==='paid',payment_intent:obj.payment_intent,setup_intent:obj.setup_intent};
     if(obj.mode==='setup'&&obj.setup_intent)action.payment_method=(await get(env,`setup_intents/${obj.setup_intent}`,{connectedAccount:account})).payment_method;
     else if(meta.save_card==='1'&&obj.payment_intent)action.payment_method=(await get(env,`payment_intents/${obj.payment_intent}`,{connectedAccount:account})).payment_method;
     actions.push(action);
    }
   }else if(event.type==='checkout.session.async_payment_succeeded'&&meta.afspraak_id){
    actions.push({kind:'appointment',account,appointment_id:meta.afspraak_id,paid:true,payment_intent:obj.payment_intent});
   }else if(event.type==='invoice.paid'){
    const subscription=obj.subscription||obj.parent?.subscription_details?.subscription;
    if(subscription)actions.push({kind:'credits',account,subscription});
   }else if(event.type==='customer.subscription.deleted')actions.push({kind:'abo_cancel',account,subscription:obj.id});
  }
  await query(env,'rpc/kronr_apply_stripe_event',{method:'POST',body:JSON.stringify({p_event_id:event.id,p_actions:actions})});
  return new Response('ok');
 }catch{return new Response('Webhook processing failed; retry required',{status:500});}
}
