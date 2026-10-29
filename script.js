const COL=['#00e5ff','#ff2e63','#39ff88','#ffd400'],NAMES=['Azul','Vermelho','Verde','Amarelo'];
const R=450,BR=38,WIN=3,START=[-90,90,0,180],ACC=1000,BOT=.85;
const $=id=>document.getElementById(id);
let G=null,online=false,isHost=false,myIdx=0,lobbyN=1,peer=null,conns=[],gconn=null,tick=0,rv=0;

function show(id){document.querySelectorAll('.scr').forEach(e=>e.classList.toggle('on',e.id==id))}

/* ---------- Controles: joystick na tela + teclado ---------- */
const IN=[0,1,2,3].map(()=>({x:0,y:0})); // direção do joystick (coordenadas da tela)
const keys=new Set();
const KM=[{w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]},
  {arrowup:[0,-1],arrowdown:[0,1],arrowleft:[-1,0],arrowright:[1,0]},
  {i:[0,-1],k:[0,1],j:[-1,0],l:[1,0]},
  {t:[0,-1],g:[0,1],f:[-1,0],h:[1,0]}];
/* Toque: arraste o dedo em qualquer lugar da sua área da tela (joystick flutuante, sem botões).
   Online: a tela toda é sua. Local: cada jogador usa o lado da tela de onde seu beyblade sai. */
const touches=new Map(),MAXD=60;
function zoneOf(x,y){
  if(online)return myIdx;
  const a=Math.atan2(y-cy,x-cx);let best=-1,bd=9;
  for(let i=0;i<G.n;i++){if(!G.human[i])continue;
    const t=START[i]*Math.PI/180,d=Math.abs(Math.atan2(Math.sin(a-t),Math.cos(a-t)));
    if(d<bd){bd=d;best=i}}
  return best;
}
function dropTouch(id){const t=touches.get(id);if(!t)return;t.el.remove();IN[t.i].x=IN[t.i].y=0;touches.delete(id)}
function clearTouches(){[...touches.keys()].forEach(dropTouch)}
addEventListener('pointerdown',e=>{
  if(!G||e.target.closest('#x'))return;
  const i=zoneOf(e.clientX,e.clientY);if(i<0)return;
  for(const t of touches.values())if(t.i==i)return;
  e.preventDefault();
  const el=document.createElement('div');el.className='stick';el.style.setProperty('--c',COL[i]);
  el.style.left=e.clientX+'px';el.style.top=e.clientY+'px';el.innerHTML='<i></i>';document.body.appendChild(el);
  touches.set(e.pointerId,{i,x0:e.clientX,y0:e.clientY,el});
});
addEventListener('pointermove',e=>{
  const t=touches.get(e.pointerId);if(!t)return;
  let dx=e.clientX-t.x0,dy=e.clientY-t.y0;const l=Math.hypot(dx,dy);
  if(l>MAXD){t.x0=e.clientX-dx/l*MAXD;t.y0=e.clientY-dy/l*MAXD;dx=e.clientX-t.x0;dy=e.clientY-t.y0} // a base acompanha o dedo
  const n=Math.hypot(dx,dy),k=Math.min(1,n/MAXD),s=k<.15?0:(k-.15)/.85;
  IN[t.i].x=n?dx/n*s:0;IN[t.i].y=n?dy/n*s:0;
  t.el.style.left=t.x0+'px';t.el.style.top=t.y0+'px';
  t.el.firstChild.style.transform=`translate(${dx}px,${dy}px)`;
});
['pointerup','pointercancel'].forEach(n=>addEventListener(n,e=>dropTouch(e.pointerId)));

addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if(G&&k.startsWith('arrow'))e.preventDefault()});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>keys.clear());
// direção desejada do jogador i, em coordenadas da tela (módulo de 0 a 1)
function getInput(i){
  const maps=online?[KM[0],KM[1]]:[KM[i]];let x=0,y=0;
  maps.forEach(m=>{for(const k in m)if(keys.has(k)){x+=m[k][0];y+=m[k][1]}});
  if(x||y){const l=Math.hypot(x,y);return{x:x/l,y:y/l}}
  return{x:IN[i].x,y:IN[i].y};
}
// tela -> mundo (a visão online é girada em rv)
function toWorld(v){const c=Math.cos(rv),s=Math.sin(rv);return{x:v.x*c+v.y*s,y:-v.x*s+v.y*c}}

/* ---------- Simulação (local ou anfitrião) ---------- */
function startGame(total,humans){
  G={n:total,human:Array.from({length:total},(_,i)=>i<humans),inp:[],bl:[],sc:[0,0,0,0],active:false,round:0,msg:''};
  enterGame(total);newRound();
}
function enterGame(n){
  rv=online?(90-START[myIdx])*Math.PI/180:0; // cada jogador vê o próprio beyblade embaixo
  $('hud').classList.add('on');show('');$('x').style.display='block';layout();
}
function newRound(){
  const g=G,r=++g.round;g.bl=[];g.active=false;
  for(let i=0;i<g.n;i++){const t=START[i]*Math.PI/180;
    g.bl.push({x:Math.cos(t)*200,y:Math.sin(t)*200,vx:0,vy:0,rot:0,alive:true,jx:0,jy:0,tr:[]})}
  g.msg='Rodada '+r;
  setTimeout(()=>{if(G===g&&g.round==r){g.active=true;g.msg=''}},1500);
}
function botInput(i){
  const b=G.bl[i];let best=null,bd=1e9;
  G.bl.forEach((o,j)=>{if(j!=i&&o.alive){const d=Math.hypot(o.x-b.x,o.y-b.y);if(d<bd){bd=d;best=o}}});
  const rd=Math.hypot(b.x,b.y);
  let tx,ty;
  if(rd>R-130||!best){tx=-b.x;ty=-b.y} // perto da borda: volta para o centro
  else{
    const od=Math.hypot(best.x,best.y)||1,ux=best.x/od,uy=best.y/od;
    // ponto atrás do alvo (lado do centro) para empurrá-lo para fora
    const px=best.x-ux*BR*1.8,py=best.y-uy*BR*1.8;
    if(Math.hypot(px-b.x,py-b.y)>BR*2.2){tx=px-b.x;ty=py-b.y}else{tx=best.x-b.x;ty=best.y-b.y}
  }
  b.jx+=(Math.random()-.5)*.25;b.jy+=(Math.random()-.5)*.25;b.jx*=.9;b.jy*=.9;
  const l=Math.hypot(tx,ty)||1;
  return{x:tx/l*BOT+b.jx,y:ty/l*BOT+b.jy};
}
function step(dt){
  const bl=G.bl;
  bl.forEach((b,i)=>{
    if(!b.alive)return;
    b.rot+=(10+Math.hypot(b.vx,b.vy)/40)*dt;
    if(!G.active)return;
    const v=G.human[i]?(G.inp[i]||{x:0,y:0}):botInput(i);
    b.vx+=v.x*ACC*dt;b.vy+=v.y*ACC*dt;
    const f=Math.pow(.08,dt);b.vx*=f;b.vy*=f;
    const sp=Math.hypot(b.vx,b.vy);if(sp>1100){b.vx*=1100/sp;b.vy*=1100/sp}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
  });
  if(!G.active)return;
  for(let i=0;i<bl.length;i++)for(let j=i+1;j<bl.length;j++){
    const a=bl[i],b=bl[j];if(!a.alive||!b.alive)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    if(d<BR*2){
      const nx=dx/d,ny=dy/d,o=(BR*2-d)/2;
      a.x-=nx*o;a.y-=ny*o;b.x+=nx*o;b.y+=ny*o;
      const rv2=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(rv2<0){const im=-(1+1.1)*rv2/2+60;a.vx-=im*nx;a.vy-=im*ny;b.vx+=im*nx;b.vy+=im*ny}
    }
  }
  bl.forEach(b=>{if(b.alive&&Math.hypot(b.x,b.y)>R-6)b.alive=false});
  const alive=bl.map((b,i)=>b.alive?i:-1).filter(i=>i>=0);
  if(alive.length<=1){
    const g=G;g.active=false;
    if(alive.length==1){
      const w=alive[0];g.sc[w]++;
      if(g.sc[w]>=WIN){g.msg=NAMES[w]+' é o campeão! 🏆';
        setTimeout(()=>{if(G===g){g.sc=[0,0,0,0];g.round=0;newRound()}},4000);return}
      g.msg=NAMES[w]+' venceu a rodada!';
    }else g.msg='Empate!';
    setTimeout(()=>{if(G===g)newRound()},2200);
  }
}

/* ---------- Modo local ---------- */
function startLocal(h){online=false;isHost=true;myIdx=0;startGame(Math.max(2,h),h)}

/* ---------- Modo online (salas via PeerJS / WebRTC) ---------- */
const PFX='beyblade-arena-';
const ICE={config:{iceServers:[
  {urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},
  {urls:['turn:openrelay.metered.ca:80','turn:openrelay.metered.ca:443','turn:openrelay.metered.ca:443?transport=tcp'],username:'openrelayproject',credential:'openrelayproject'}
]}};
function newPeer(id){
  if(typeof Peer==='undefined'){alert('Não foi possível carregar a biblioteca online. Verifique sua internet.');return null}
  return id?new Peer(PFX+id,ICE):new Peer(ICE);
}
function renderSlots(){
  $('slots').innerHTML=[0,1,2,3].map(i=>i<lobbyN
    ?`<div class="slot on" style="--c:${COL[i]}">${NAMES[i]}${i==myIdx?' (você)':''}</div>`
    :'<div class="slot">Aguardando...</div>').join('');
}
function createRoom(){
  const L='ABCDEFGHJKLMNPQRSTUVWXYZ';let code='';
  for(let i=0;i<4;i++)code+=L[Math.random()*L.length|0];
  online=true;isHost=true;myIdx=0;conns=[];
  peer=newPeer(code);if(!peer)return;
  peer.on('open',()=>{
    $('rc').textContent=code;$('rs').style.display='';$('rl').style.display='';
    $('rh').textContent='Envie o código ou o link para seus amigos. Eles podem entrar de qualquer aparelho.';
    lobbyUpdate();show('lobby');
  });
  peer.on('error',e=>{if(e.type=='unavailable-id'){peer.destroy();createRoom()}else{alert('Erro de conexão: '+e.type);leave()}});
  peer.on('connection',c=>{
    if(G||conns.length>=3){c.on('open',()=>{c.send({t:'full'});setTimeout(()=>c.close(),300)});return}
    conns.push(c);reindex();
    c.on('open',()=>{reindex();lobbyUpdate()});
    c.on('data',d=>{if(d.t=='m'&&G&&!G.guest){let x=+d.x||0,y=+d.y||0;const l=Math.hypot(x,y);if(l>1){x/=l;y/=l}G.inp[c.idx]={x,y}}});
    c.on('close',()=>{conns=conns.filter(x=>x!==c);if(G){G.human[c.idx]=false;G.inp[c.idx]=null}else{reindex();lobbyUpdate()}});
  });
}
function reindex(){conns.forEach((c,k)=>{c.idx=k+1;if(c.open)c.send({t:'hi',idx:c.idx})})}
function lobbyUpdate(){
  lobbyN=1+conns.length;renderSlots();
  conns.forEach(c=>c.open&&c.send({t:'l',n:lobbyN}));
}
function startOnline(){
  const h=1+conns.length,total=Math.max(2,h);
  conns.forEach(c=>c.open&&c.send({t:'start',n:total}));
  startGame(total,h);
}
function joinRoom(){
  const code=$('code').value.trim().toUpperCase();if(code.length<4){alert('Digite o código de 4 letras.');return}
  online=true;isHost=false;peer=newPeer();if(!peer)return;
  peer.on('open',()=>{
    gconn=peer.connect(PFX+code,{reliable:true});
    gconn.on('open',()=>{
      $('rc').textContent=code;$('rs').style.display='none';$('rl').style.display='none';
      $('rh').textContent='Conectado! Aguardando o anfitrião iniciar...';show('lobby');
    });
    gconn.on('data',onGuest);
    gconn.on('close',()=>{if(online){alert('A conexão com a sala foi encerrada.');leave()}});
  });
  peer.on('error',e=>{alert(e.type=='peer-unavailable'?'Sala não encontrada.':'Erro de conexão: '+e.type);leave()});
}
function onGuest(d){
  if(d.t=='hi'){myIdx=d.idx;renderSlots()}
  else if(d.t=='l'){lobbyN=d.n;renderSlots()}
  else if(d.t=='full'){alert('Sala cheia ou partida já iniciada.');leave()}
  else if(d.t=='start'){G={guest:true,n:d.n,bl:[],sc:[0,0,0,0],msg:''};enterGame(d.n)}
  else if(d.t=='s'&&G){
    G.bl=d.b.map((a,i)=>{
      const o=G.bl[i]||{x:a[0],y:a[1],tr:[]};
      o.tx=a[0];o.ty=a[1];o.rot=a[2];o.alive=!!a[3];
      if(Math.hypot(o.tx-o.x,o.ty-o.y)>300){o.x=o.tx;o.y=o.ty;o.tr=[]}
      return o;
    });
    G.sc=d.sc;G.msg=d.m;
  }
}
function shareLink(){
  const u=location.href.split('?')[0].split('#')[0]+'?sala='+$('rc').textContent,btn=$('rl');
  if(navigator.share){navigator.share({title:'Beyblade Arena',text:'Entre na minha sala!',url:u}).catch(()=>{});return}
  (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{
    btn.textContent='Link copiado!';setTimeout(()=>btn.textContent='Copiar link da sala',1800);
  }).catch(()=>prompt('Copie o link:',u));
}
function leave(){
  online=false;G=null;
  try{peer&&peer.destroy()}catch(e){}
  peer=null;conns=[];gconn=null;
  clearTouches();$('hud').classList.remove('on');$('x').style.display='none';$('msg').textContent='';show('menu');
}
$('x').onclick=leave;
{const q=new URLSearchParams(location.search).get('sala');if(q){$('code').value=q.slice(0,4).toUpperCase();show('online')}}

/* ---------- Layout responsivo ---------- */
const cv=$('cv'),ctx=cv.getContext('2d');
let W=0,H=0,S=1,dpr=1,cx=0,cy=0;
function layout(){
  dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;
  cv.width=W*dpr;cv.height=H*dpr;
  const top=64,bot=16,ah=Math.max(120,H-top-bot);
  S=Math.min(W*.47,ah*.48)/(R+18);cx=W/2;cy=top+ah/2;
  const x=$('x');x.style.left=Math.min(W-46,cx+R*S-22)+'px';x.style.top=(cy-22)+'px';
}
addEventListener('resize',layout);addEventListener('orientationchange',()=>setTimeout(layout,200));layout();

/* ---------- Desenho ---------- */
function arc(r,c,w){ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.stroke()}
function drawArena(){
  ctx.fillStyle='#04060d';ctx.beginPath();ctx.arc(0,0,R+22,0,7);ctx.fill();
  [[26,.05],[16,.09],[8,.2]].forEach(([w,a])=>arc(R+8,`rgba(0,229,255,${a})`,w));
  arc(R+8,'#00e5ff',3);
  const g=ctx.createRadialGradient(0,0,0,0,0,R);g.addColorStop(0,'#1a2a4d');g.addColorStop(1,'#0a1226');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();
  arc(R-24,'rgba(255,46,99,.14)',48);arc(R-48,'rgba(255,46,99,.55)',2);
  [.25,.5,.75].forEach(k=>arc(R*k*.92,'rgba(0,229,255,.18)',2));
  ctx.strokeStyle='rgba(0,229,255,.12)';ctx.lineWidth=2;ctx.beginPath();
  for(let k=0;k<4;k++){const t=k*Math.PI/4;ctx.moveTo(-Math.cos(t)*R*.9,-Math.sin(t)*R*.9);ctx.lineTo(Math.cos(t)*R*.9,Math.sin(t)*R*.9)}
  ctx.stroke();
}
function blade(b,i){
  const c=COL[i];
  b.tr.push({x:b.x,y:b.y});if(b.tr.length>10)b.tr.shift();
  b.tr.forEach((p,k)=>{ctx.globalAlpha=k/b.tr.length*.28;ctx.fillStyle=c;ctx.beginPath();ctx.arc(p.x,p.y,BR*(.4+k/b.tr.length*.5),0,7);ctx.fill()});
  ctx.globalAlpha=1;ctx.save();ctx.translate(b.x,b.y);
  const g=ctx.createRadialGradient(0,0,10,0,0,90);g.addColorStop(0,c+'66');g.addColorStop(1,c+'00');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,90,0,7);ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.arc(10,12,BR,0,7);ctx.fill();
  ctx.rotate(b.rot-rv);ctx.lineJoin='miter';ctx.miterLimit=3;ctx.strokeStyle='#02040a';ctx.lineWidth=8;
  ctx.fillStyle=c;ctx.beginPath();
  for(let k=0;k<20;k++){
    const t=k*Math.PI/10+(k%2?0:.14),r=k%2?27:(k%4?43:46);
    k?ctx.lineTo(Math.cos(t)*r,Math.sin(t)*r):ctx.moveTo(Math.cos(t)*r,Math.sin(t)*r);
  }
  ctx.closePath();ctx.stroke();ctx.fill();
  ctx.fillStyle='#070c1a';ctx.strokeStyle=c;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,16,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill();
  ctx.restore();
}
let last=0,hudKey='',msgKey='';
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min(.033,(ts-last)/1000||0);last=ts;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  if(!G)return;
  if(G.guest){
    const k=Math.min(1,dt*18);
    G.bl.forEach(b=>{if(b.tx!==undefined){b.x+=(b.tx-b.x)*k;b.y+=(b.ty-b.y)*k}});
    if(++tick%2==0&&gconn&&gconn.open){const v=toWorld(getInput(myIdx));gconn.send({t:'m',x:+v.x.toFixed(2),y:+v.y.toFixed(2)})}
  }else{
    if(online)G.inp[0]=toWorld(getInput(0));
    else for(let i=0;i<G.n;i++)if(G.human[i])G.inp[i]=getInput(i);
    step(dt);
    if(online&&++tick%2==0){
      const s={t:'s',b:G.bl.map(b=>[Math.round(b.x),Math.round(b.y),+b.rot.toFixed(2),b.alive?1:0]),sc:G.sc,m:G.msg};
      conns.forEach(c=>c.open&&c.send(s));
    }
  }
  ctx.translate(cx,cy);ctx.scale(S,S);ctx.rotate(rv);
  drawArena();
  G.bl.forEach((b,i)=>{if(b.alive)blade(b,i)});
  if(G.msg!==msgKey){msgKey=G.msg;$('msg').textContent=msgKey||''}
  const k=G.sc.join()+(online?myIdx:-1)+G.n;
  if(k!==hudKey){hudKey=k;
    $('hud').innerHTML=Array.from({length:G.n},(_,i)=>
      `<div class="chip${online&&i==myIdx?' me':''}" style="--c:${COL[i]}">${NAMES[i]}${online&&i==myIdx?' (você)':''}<b>${G.sc[i]}</b></div>`).join('')}
}
requestAnimationFrame(loop);
