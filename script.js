'use strict';
const KEY='wfreshtrack_v08_fruit_batches';
const SESSION_KEY='wfreshtrack_v08_session';
const NOTICE_KEY='wfreshtrack_v08_notice';
const MEDIA_DB_NAME='WFreshTrackMediaDB';
const MEDIA_STORE='photos';

function basePath(){
  return window.location.pathname.includes('/modules/') ? '../../' : '';
}

const ROUTES={
  manager:{
    dashboard:'modules/manager/manager-dashboard.html',
    daily:'modules/manager/manager-daily.html',
    proposals:'modules/manager/manager-proposals.html',
    reports:'modules/manager/manager-reports.html'
  },
  area:{
    dashboard:'modules/area/area-dashboard.html',
    approvals:'modules/area/area-approvals.html',
    daily:'modules/area/area-daily.html',
    reports:'modules/area/area-reports.html'
  },
  employee:{
    new:'modules/mobile/mobile-report.html',
    reports:'modules/mobile/mobile-tracking.html'
  }
};

function sessionRead(key){try{return sessionStorage.getItem(key)}catch(e){return null}}
function sessionWrite(key,value){try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,value)}catch(e){}}
function routeUrl(role,page,params={}){
  const file=ROUTES[role]?.[page]||'index.html';
  const q=new URLSearchParams();
  if(params.batch)q.set('batch',params.batch);
  if(params.follow)q.set('follow',params.follow);
  return basePath()+file+(q.toString()?'?'+q.toString():'');
}
function redirectHome(message){
  sessionWrite(SESSION_KEY,null);
  if(message)sessionWrite(NOTICE_KEY,message);
  window.location.assign(basePath()+'index.html');
}

const $=(s)=>document.querySelector(s);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=()=>new Date().toISOString();
function dateVN(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function dayOffset(n){return dateVN(new Date(Date.now()+n*86400000))}
function displayDay(day){if(!day)return '—';const [y,m,d]=day.split('-');return `${d}/${m}/${y}`}
function displayTime(iso){if(!iso)return '—';return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}
function displayShortTime(iso){if(!iso)return '—';return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}
function isoFromDay(day,hour=9,minute=0){return new Date(`${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+07:00`).toISOString()}
const fmt=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(n);
const fmtMoney=n=>new Intl.NumberFormat('vi-VN').format(Math.round(n))+'đ';

// Chuyển đổi qua lại giữa dd/mm/yyyy (hiển thị/nhập tay) và yyyy-mm-dd (lưu trữ/lọc)
function isoToVnDate(isoDay){
  if(!isoDay||!/^\d{4}-\d{2}-\d{2}$/.test(isoDay))return '';
  const [y,m,d]=isoDay.split('-');
  return `${d}/${m}/${y}`;
}
function vnDateToIso(vnStr){
  const m=String(vnStr||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m)return null;
  const dd=Number(m[1]),mm=Number(m[2]),yyyy=Number(m[3]);
  if(yyyy<2020||yyyy>2099||mm<1||mm>12||dd<1||dd>31)return null;
  const dt=new Date(Date.UTC(yyyy,mm-1,dd));
  if(dt.getUTCFullYear()!==yyyy||dt.getUTCMonth()!==mm-1||dt.getUTCDate()!==dd)return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function formatVnDateTyping(raw){
  const digits=String(raw||'').replace(/\D/g,'').slice(0,8);
  if(digits.length<=2)return digits;
  if(digits.length<=4)return digits.slice(0,2)+'/'+digits.slice(2);
  return digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
}

// ============================================================================
// INDEXEDDB MEDIA STORAGE (KHÔNG GIỚI HẠN SỐ LƯỢNG ẢNH & DUNG LƯỢNG LỚN)
// ============================================================================
const mediaCache=new Map();
function openMediaDB(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB)return reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
    const req=indexedDB.open(MEDIA_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const idb=req.result;
      if(!idb.objectStoreNames.contains(MEDIA_STORE)){
        idb.createObjectStore(MEDIA_STORE,{keyPath:'id'});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function putMediaToDB(id,dataUrl){
  mediaCache.set(id,dataUrl);
  try{
    const idb=await openMediaDB();
    await new Promise((resolve,reject)=>{
      const tx=idb.transaction(MEDIA_STORE,'readwrite');
      tx.objectStore(MEDIA_STORE).put({id,dataUrl,savedAt:clock()});
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }catch(e){
    console.warn('IndexedDB write fallback:',e);
  }
}
async function loadAllMediaFromDB(){
  try{
    const idb=await openMediaDB();
    await new Promise((resolve,reject)=>{
      const tx=idb.transaction(MEDIA_STORE,'readonly');
      const req=tx.objectStore(MEDIA_STORE).getAll();
      req.onsuccess=()=>{
        for(const item of (req.result||[])){
          if(item?.id&&item?.dataUrl)mediaCache.set(item.id,item.dataUrl);
        }
        resolve();
      };
      req.onerror=()=>reject(req.error);
    });
  }catch(e){
    console.warn('IndexedDB read warning:',e);
  }
}
async function clearMediaDB(){
  mediaCache.clear();
  try{
    const idb=await openMediaDB();
    await new Promise((resolve)=>{
      const tx=idb.transaction(MEDIA_STORE,'readwrite');
      tx.objectStore(MEDIA_STORE).clear();
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
    });
  }catch(e){}
}
function resolvePhotoSrc(ref){
  if(!ref)return '';
  if(ref.startsWith('data:')||ref.startsWith('http'))return ref;
  return mediaCache.get(ref)||demoPhoto('Ảnh đã lưu · '+ref,'#64748b');
}

const STORES=[
  {id:'st1',code:'WM-101',name:'WinMart Lý Chính Thắng',area:'TP.HCM · Khu vực 01'},
  {id:'st2',code:'WM-102',name:'WinMart Nguyễn Đình Chiểu',area:'TP.HCM · Khu vực 01'},
  {id:'st3',code:'WM-103',name:'WinMart Cộng Hòa',area:'TP.HCM · Khu vực 01'},
  {id:'st4',code:'WM-104',name:'WinMart Lê Văn Việt',area:'TP.HCM · Khu vực 01'}
];
const PRODUCTS=[
  {"id":"p1","name":"Táo Gala","category":"Trái cây","unit":"kg","price":65000},
  {"id":"p2","name":"Chuối già","category":"Trái cây","unit":"kg","price":28000},
  {"id":"p3","name":"Xoài cát","category":"Trái cây","unit":"kg","price":55000},
  {"id":"p4","name":"Nho xanh","category":"Trái cây","unit":"hộp","price":89000},
  {"id":"p5","name":"Thanh long","category":"Trái cây","unit":"kg","price":32000},
  {"id":"p6","name":"Cam sành","category":"Trái cây","unit":"kg","price":35000},
  {"id":"p7","name":"Dưa hấu","category":"Trái cây","unit":"kg","price":18000},
  {"id":"p8","name":"Dâu tây","category":"Trái cây","unit":"hộp","price":95000},
  {"id":"p9","name":"Bưởi da xanh","category":"Trái cây","unit":"kg","price":45000},
  {"id":"p10","name":"Kiwi xanh","category":"Trái cây","unit":"hộp","price":75000},
  {"id":"p11","name":"Lê Hàn Quốc","category":"Trái cây","unit":"kg","price":85000},
  {"id":"p12","name":"Dưa lưới","category":"Trái cây","unit":"kg","price":48000}
];
const USERS=[
  {id:'e1',name:'Nguyễn Gia Hân',role:'employee',storeId:'st1'},
  {id:'e2',name:'Đỗ Hải Yến',role:'employee',storeId:'st1'},
  {id:'e3',name:'Lê Quốc Bảo',role:'employee',storeId:'st2'},
  {id:'e4',name:'Võ Thảo Vy',role:'employee',storeId:'st3'},
  {id:'e5',name:'Ngô Hoàng Nam',role:'employee',storeId:'st4'},
  {id:'m1',name:'Trần Minh Phúc',role:'manager',storeId:'st1'},
  {id:'a1',name:'Phạm Khánh Linh',role:'area',storeIds:['st1','st2','st3','st4']}
];
const ROLENAME={employee:'Nhân viên cửa hàng',manager:'Cửa hàng trưởng',area:'Quản lý khu vực'};

// Đánh số thứ tự rõ ràng & rút gọn để không bị xuống dòng trên thanh điều hướng
const NAV={
  employee:[
    ['new','01. Chụp ảnh & ghi nhận','⊕'],
    ['reports','02. Theo dõi xử lý','▤']
  ],
  manager:[
    ['dashboard','01. Tổng quan cửa hàng','◫'],
    ['daily','02. Tổng hợp cuối ngày','▦'],
    ['proposals','03. Đề xuất xử lý','✎'],
    ['reports','04. Báo cáo cửa hàng','▤']
  ],
  area:[
    ['dashboard','01. Tổng quan khu vực','◫'],
    ['approvals','02. Phê duyệt đề xuất','✓'],
    ['daily','03. Báo cáo theo ngày','▦'],
    ['reports','04. Tất cả báo cáo','▤']
  ]
};

const CONDITIONS=[
  'Giảm chất lượng ngoại quan',
  'Dập / trầy xước',
  'Chín quá mức',
  'Héo / úa',
  'Có dấu hiệu hư hỏng',
  'Không an toàn để bán',
  'Khác'
];

const statusName={
  collecting:'Đang ghi nhận',
  awaiting:'Chờ cửa hàng trưởng',
  sent:'Đã gửi khu vực',
  reported:'Đã ghi nhận',
  draft:'Nháp đề xuất',
  pending:'Chờ phê duyệt',
  approved:'Đã duyệt',
  rejected:'Từ chối',
  needs_info:'Cần bổ sung',
  in_progress:'Đang xử lý',
  completed:'Hoàn tất',
  blocked:'Không thực hiện được'
};

function tag(s){return `<span class="chip ${h(s)}">${h(statusName[s]||s)}</span>`}
const store=id=>STORES.find(x=>x.id===id)||STORES[0];
const prod=id=>PRODUCTS.find(x=>x.id===id);
const user=id=>USERS.find(x=>x.id===id);
let db;
let state={
  userId:null,
  page:'dashboard',
  search:'',
  filter:'all',
  store:'all',
  reportDate:'',
  reportBatch:'all',
  selectedBatch:null,
  photoBuffer:[],
  followId:null,
  sessionApprovedIds:[]
};
const me=()=>user(state.userId);

function demoPhoto(label,color='#e57a52'){
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="430" height="310" viewBox="0 0 430 310"><rect width="430" height="310" fill="#fff1e5"/><rect y="230" width="430" height="80" fill="#efd8cb"/><ellipse cx="210" cy="234" rx="158" ry="32" fill="#c8aa98"/><ellipse cx="205" cy="169" rx="85" ry="77" fill="${color}"/><ellipse cx="190" cy="142" rx="27" ry="14" fill="#ffffff38"/><path d="M207 96q8-30 31-27" stroke="#76513b" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M208 91q-13-38-61-23 21 34 61 23" fill="#6d9d5c"/><text x="215" y="291" text-anchor="middle" font-family="Arial" font-size="15" font-weight="bold" fill="#9a6c61">${label.replace(/[<>&]/g,'')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

function seed(){
  let incidents=[],observations=[],requests=[],batches=[],events=[];
  let oi=1,ii=1,qi=1,bi=1,ei=1;
  function obs(st,pr,qty,condition,day,owner,notes,hasPhoto=true,batchId=null,existingInc=null){
    let incId=existingInc||'FF-'+String(ii++).padStart(4,'0');
    if(!existingInc)incidents.push({id:incId,storeId:st,productId:pr,createdAt:isoFromDay(day,8,10),createdBy:owner});
    let id='R-'+String(oi++).padStart(4,'0');
    let o={
      id,
      incidentId:incId,
      storeId:st,
      productId:pr,
      qty,
      unit:prod(pr).unit,
      condition,
      description:notes,
      createdAt:isoFromDay(day,9,oi),
      createdBy:owner,
      batchId,
      photos:hasPhoto?[demoPhoto(prod(pr).name+' · MINH HỌA',['#d66a55','#e4b94d','#82a463','#986eae'][Number(pr.slice(1))%4])]:[]
    };
    observations.push(o);
    events.push({id:'E-'+ei++,incidentId:incId,obsId:id,time:o.createdAt,actorId:owner,text:'Nhân viên ghi nhận tình trạng hàng hóa'});
    return o;
  }
  function batch(st,day,status){
    let b={id:'DB-'+String(bi++).padStart(3,'0'),storeId:st,date:day,status,createdAt:isoFromDay(day,23,0),sentAt:status==='sent'?isoFromDay(day,23,25):null,sentBy:status==='sent'?'m1':null};
    batches.push(b);
    return b;
  }
  function req(o,b,action,discount,qty,manager,status){
    let r={
      id:'TR-'+String(qi++).padStart(3,'0'),
      observationId:o.id,
      incidentId:o.incidentId,
      batchId:b.id,
      action,
      discount,
      qty,
      unit:o.unit,
      reason:'Đề xuất xử lý theo tình trạng hàng được báo cáo.',
      createdBy:manager,
      createdAt:isoFromDay(b.date,23,15),
      status,
      decidedBy:['approved','completed'].includes(status)?'a1':null,
      decidedAt:['approved','completed'].includes(status)?isoFromDay(b.date,23,35):null,
      actualQty:status==='completed'?qty:null,
      executedAt:status==='completed'?isoFromDay(b.date,23,45):null
    };
    requests.push(r);
    return r;
  }
  const sampleDays=[
    [-5,"sent","completed",[[1,3.2,1,"Vỏ táo trầy nhẹ, thịt quả còn chắc."],[2,5.5,2,"Chuối chín vàng đậm, còn nguyên vỏ."],[4,2,0,"Nho mất lớp phấn, quả vẫn chắc."],[6,4.3,1,"Cam bị xước vỏ khi vận chuyển."],[8,3,5,"Dâu có mốc trắng, đã cách ly."],[3,2.5,2,"Xoài chín mềm, không có mùi lạ."],[9,2.1,1,"Bưởi có vết cấn nhẹ trên vỏ."]]],
    [-3,"sent","completed",[[2,7.2,2,"Chuối chín nhanh, xuất hiện đốm nâu trên vỏ."],[1,2.8,1,"Táo bị cấn trong khay trưng bày."],[10,2,0,"Kiwi nhăn vỏ nhẹ, thịt còn chắc."],[4,4,3,"Cuống nho khô nhẹ, quả vẫn đạt chất lượng."],[8,2,4,"Dâu rỉ nước, đã tách khỏi quầy."],[7,5.1,1,"Dưa hấu trầy vỏ ngoài, không nứt."],[6,3.6,0,"Cam có vỏ sần, chưa mềm nhũn."],[11,1.8,1,"Lê bị cấn nhẹ tại phần cuống."],[8,1,4,"Một hộp dâu tại kệ bổ sung bị rỉ nước; đã cách ly riêng."]]],
    [-2,"sent","pending",[[2,6.4,2,"Chuối chín vàng nhiều đốm, còn an toàn để bán."],[1,4.5,1,"Táo bị dập nhẹ sau sắp xếp quầy."],[3,3.2,2,"Xoài chín mềm, cần ưu tiên bán."],[8,4,5,"Dâu xuất hiện mốc, đã cách ly."],[4,3,3,"Cuống nho khô, quả chưa hỏng."],[5,2.7,0,"Vảy thanh long hơi khô, ruột còn tốt."],[12,2.4,1,"Dưa lưới trầy vỏ, không nứt."],[2,2.6,4,"Chuối nứt vỏ và có mùi lên men, đã cách ly."],[10,2,4,"Hai hộp kiwi bị mềm nhũn, có mùi lạ; đã cách ly."]]],
    [-1,"awaiting",null,[[1,5.2,1,"Táo dập nhẹ tại đáy thùng; phân loại phần còn an toàn."],[2,8.5,2,"Chuối chín vàng đậm, cần bán trong ngày."],[3,4.1,2,"Xoài chín mềm, đã kiểm tra không có mùi lạ."],[4,5,0,"Nho có quả hơi nhăn, đã phân loại."],[8,3,4,"Dâu mềm và rỉ nước, đã cách ly."],[6,4.8,1,"Cam bị trầy xước vỏ khi nhập hàng."],[5,3.4,3,"Vảy thanh long khô, quả vẫn chắc."],[11,2.2,1,"Lê bị dập nhẹ trên bề mặt."],[9,3.1,0,"Bưởi vỏ sần, chất lượng ruột chưa thay đổi."]]],
    [0,null,null,[[2,4.7,2,"Chuối chín nhanh trên quầy buổi chiều."],[1,2.3,1,"Táo có vết cấn mới sau bổ sung hàng."],[8,2,5,"Dâu mốc, đã cách ly ngay."],[4,2,3,"Cuống nho khô, cần kiểm tra lại."],[3,1.9,2,"Xoài chín mềm, chưa có dấu hiệu hư."],[12,1.6,0,"Vỏ dưa lưới có vết sần, không ảnh hưởng phần ruột."]]]
  ];
  for(const [offset,bstatus,rstatus,items] of sampleDays){
    const day=dayOffset(offset),b=bstatus?batch('st1',day,bstatus):null;
    for(const [idx,[pid,qty,ci,note]] of items.entries()){
      const o=obs('st1','p'+pid,qty,CONDITIONS[ci],day,idx%2?'e2':'e1',note,true,b?.id||null);
      o.createdAt=isoFromDay(day,9+idx%9,10+(idx*7)%50);
      events.at(-1).time=o.createdAt;
      if(rstatus){
        const unsafe=ci===4||ci===5;
        const discount=unsafe?null:ci===2?50:30;
        const r=req(o,b,unsafe?'disposal':'markdown',discount,qty,'m1',rstatus);
        r.reason=unsafe?'Không đủ điều kiện an toàn để bán; đã cách ly, đề xuất hủy.':`Hàng còn an toàn sau kiểm tra; giảm ${discount}% để ưu tiên tiêu thụ.`;
        if(rstatus==='completed')r.executionNote=unsafe?'Đã hủy theo quyết định.':'Đã dán nhãn giảm giá.';
      }
    }
  }
  // Dữ liệu mẫu cho chi nhánh WinMart Nguyễn Đình Chiểu (st2) để hỗ trợ chuyển chi nhánh khi đăng nhập
  const dayY=dayOffset(-1),bSt2=batch('st2',dayY,'sent');
  const oSt2a=obs('st2','p1',3.5,CONDITIONS[1],dayY,'e3','Táo Gala cấn góc thùng nhập sáng.',true,bSt2.id);
  const rSt2a=req(oSt2a,bSt2,'markdown',30,3.5,'m1','pending');
  rSt2a.reason='Còn đảm bảo chất lượng, đề xuất giảm 30% bán trong ngày.';
  const oSt2b=obs('st2','p8',2,CONDITIONS[5],dayY,'e3','Dâu tây có dấu hiệu mốc, đã cách ly.',true,bSt2.id);
  const rSt2b=req(oSt2b,bSt2,'disposal',null,2,'m1','pending');
  rSt2b.reason='Không an toàn để bán, đề xuất hủy.';

  return{
    version:3,
    incidents,
    observations,
    requests,
    batches,
    events,
    managerSession:{name:'Trần Minh Phúc',storeId:'st1'},
    seq:{inc:ii,obs:oi,req:qi,batch:bi,event:ei,media:1}
  };
}

function load(){
  try{
    const j=JSON.parse(localStorage.getItem(KEY));
    if(j?.version===3)return j;
  }catch(e){}
  return seed();
}
function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify(db));
    return true;
  }catch(e){
    toast('Cảnh báo: Không thể lưu metadata vào trình duyệt.');
    return false;
  }
}
function applyPersistedProfiles(){
  if(db?.managerSession){
    const m=user('m1');
    if(m){
      if(db.managerSession.name)m.name=db.managerSession.name;
      if(db.managerSession.storeId&&store(db.managerSession.storeId))m.storeId=db.managerSession.storeId;
    }
  }
  for(const [id,name] of Object.entries(db?.profileNames||{})){
    if(user(id))user(id).name=name;
  }
}

function log(i,o,msg){db.events.push({id:'E-'+db.seq.event++,incidentId:i.id,obsId:o?.id||null,time:clock(),actorId:me().id,text:msg})}
function toast(s){const el=$('#toast');if(!el)return;el.textContent=s;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',3800)}
function allowed(o){const u=me();return u.role==='area'?u.storeIds.includes(o.storeId):u.storeId===o.storeId}
function accessibleObs(){return db.observations.filter(o=>allowed(o)&&(me().role!=='area'||batchOf(o)?.status==='sent'||!!latestReq(o)))}
function relatedReq(o){return db.requests.filter(r=>r.observationId===o.id)}
function latestReq(o){return relatedReq(o).at(-1)||null}
function incident(id){return db.incidents.find(i=>i.id===id)}
function batchOf(o){return db.batches.find(b=>b.id===o.batchId)}
function bObs(b){return db.observations.filter(o=>o.batchId===b.id)}
function statusOf(o){const r=latestReq(o);if(r)return r.status;if(o.batchId)return 'awaiting';return 'reported'}

// Mốc thời gian tương tác gần nhất (ưu tiên ngày duyệt / thực hiện / đề xuất mới nhất lên đầu)
function latestActivityTime(o){
  const r=latestReq(o);
  if(!r)return o.createdAt;
  return [r.executedAt,r.decidedAt,r.updatedAt,r.submittedAt,r.createdAt,o.createdAt].filter(Boolean).sort().at(-1)||o.createdAt;
}
function isRecentlyApproved(o){
  const r=latestReq(o);
  if(!r||r.status!=='approved'||!r.decidedAt)return false;
  return (Date.now()-new Date(r.decidedAt).getTime())<30*60*1000;
}

function actionText(r){
  if(!r)return 'Chưa có đề xuất';
  if(r.action==='disposal')return 'Đề xuất hủy';
  if(r.action==='custom')return r.customAction||'Phương án khác';
  return `Giảm giá ${r.discount}%`;
}
function calcRecoveryForReq(o,r){
  const price=prod(o.productId)?.price||0;
  if(!r)return price*o.qty;
  if(r.action==='disposal')return 0;
  if(r.action==='custom'){
    const pct=Number(r.recoveryPct??0);
    return price*r.qty*(pct/100);
  }
  return price*r.qty*(1-(r.discount||0)/100);
}
function qtyText(o){return `${fmt(o.qty)} ${h(o.unit)}`}
function itemValue(o){return (prod(o.productId)?.price||0)*o.qty}
function totalValue(arr){return arr.reduce((sum,o)=>sum+itemValue(o),0)}
function expectedRecovery(arr){return arr.reduce((sum,o)=>sum+calcRecoveryForReq(o,latestReq(o)),0)}
function unitsSummary(arr){const map={};for(const o of arr){map[o.unit]=(map[o.unit]||0)+o.qty}return Object.entries(map).map(([u,q])=>`${fmt(q)} ${u}`).join(' · ')||'—'}

function autoBatch(){
  const today=dateVN();
  const keys=[...new Set(db.observations.filter(o=>!o.batchId&&dateVN(new Date(o.createdAt))<today).map(o=>`${o.storeId}|${dateVN(new Date(o.createdAt))}`))];
  for(const k of keys){
    let [st,day]=k.split('|');
    let items=db.observations.filter(o=>!o.batchId&&o.storeId===st&&dateVN(new Date(o.createdAt))===day);
    if(!items.length)continue;
    let date=day;
    while(db.batches.some(b=>b.storeId===st&&b.date===date))date=dateVN(new Date(date+'T12:00:00+07:00').getTime()+86400000);
    if(date>today)continue;
    createBatch(st,date,items,false);
  }
  if(keys.length)save();
}
function createBatch(st,day,items,manual=true){
  if(!items.length)return null;
  const b={id:'DB-'+String(db.seq.batch++).padStart(3,'0'),storeId:st,date:day,status:'awaiting',createdAt:clock(),sentAt:null,sentBy:null,manual};
  db.batches.push(b);
  for(const o of items)o.batchId=b.id;
  db.events.push({id:'E-'+db.seq.event++,incidentId:null,obsId:null,time:clock(),actorId:manual?me().id:null,storeId:st,text:`Tổng hợp cuối ngày ${displayDay(day)}: ${items.length} báo cáo · ${store(st).name}`});
  return b;
}
function notifyPage(p,options={}){
  const u=me();if(!u||!ROUTES[u.role]?.[p])return;
  sessionWrite(SESSION_KEY,u.id);
  if(options.message)sessionWrite(NOTICE_KEY,options.message);
  window.location.assign(routeUrl(u.role,p,options));
}
function heading(){
  return {
    dashboard:me().role==='employee'?'Tổng quan ca làm việc':me().role==='manager'?'Tổng quan cửa hàng':'Tổng quan khu vực',
    new:state.followId?'Báo cáo diễn biến tiếp theo':'Ghi nhận tình trạng hàng',
    reports:me().role==='employee'?'Theo dõi xử lý':me().role==='manager'?'Báo cáo cửa hàng':'Tất cả báo cáo',
    daily:me().role==='area'?'Báo cáo theo ngày':'Tổng hợp cuối ngày',
    approvals:'Phê duyệt đề xuất',
    proposals:'Đề xuất xử lý'
  }[state.page]||'Tổng quan';
}
function header(t,desc,act=''){
  return `<div class="page-head"><div><div class="eyebrow">W-FreshTrack / ${h(ROLENAME[me().role])}</div><h1>${h(t)}</h1><p>${desc}</p></div><div class="actions">${act}</div></div>`;
}
function metric(label,n,sub,ico){
  return `<div class="metric"><div class="metric-head"><span>${h(label)}</span><span class="metric-icon">${ico}</span></div><div class="metric-value">${h(String(n))}</div><div class="metric-note">${h(sub)}</div></div>`;
}
function countStatuses(obs,s){return obs.filter(o=>statusOf(o)===s).length}

function table(obs,opts={}){
  const showPrice=me()?.role!=='employee';
  if(!obs.length)return `<div class="empty"><div class="empty-icon">▤</div><b>Chưa có báo cáo phù hợp</b><small>Các báo cáo xuất hiện khi nhân viên ghi nhận vào hệ thống.</small></div>`;
  return `<div class="tablewrap"><table class="table"><thead><tr><th>Mã báo cáo / Sản phẩm</th><th>Cửa hàng</th><th>Số lượng</th>${showPrice?'<th>Giá trị hàng</th>':''}<th>Ngày ghi nhận</th><th>Ngày duyệt / Cập nhật</th><th>Trạng thái</th><th></th></tr></thead><tbody>${obs.map(o=>{
    const p=prod(o.productId);
    const r=latestReq(o);
    const valCol=showPrice?`<td class="nowrap"><div class="maintext">${fmtMoney(itemValue(o))}</div><div class="subtext">${fmtMoney(p?.price||0)}/${h(o.unit)}</div></td>`:'';
    let approvalCol='<span class="blank">Chưa duyệt</span>';
    if(r?.decidedAt){
      approvalCol=`<div class="maintext" style="color:var(--green)">✓ ${displayShortTime(r.decidedAt)}</div><div class="subtext">${h(user(r.decidedBy)?.name||'Quản lý KV')}</div>`;
    }else if(r?.submittedAt||r?.createdAt){
      approvalCol=`<div class="subtext">Gửi ĐX: ${displayShortTime(r.submittedAt||r.createdAt)}</div>`;
    }
    const recentTag=isRecentlyApproved(o)?'<span class="chip recent-pill">Mới duyệt</span>':'';
    return `<tr class="click" data-detail="${o.id}" tabindex="0" role="button"><td><div class="maintext">${h(p?.name||'—')}${recentTag}</div><div class="subtext">${h(o.id)} · ${h(o.incidentId)} · ${o.photos.length} ảnh</div></td><td>${h(store(o.storeId)?.name||'—')}</td><td class="nowrap">${qtyText(o)}</td>${valCol}<td class="nowrap">${displayShortTime(o.createdAt)}</td><td class="nowrap">${approvalCol}</td><td>${opts.reportStatus?reportStatusTag(o):tag(statusOf(o))}</td><td><button class="btn small">Chi tiết ↗</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function shortList(obs,max=5){return table(obs.slice(0,max))}
function scopedBatches(){
  return db.batches.filter(b=>me().role==='area'?me().storeIds.includes(b.storeId)&&(b.status==='sent'||bObs(b).some(o=>!!latestReq(o))):b.storeId===me().storeId)
    .sort((a,b)=>{
      const latestA=Math.max(...bObs(a).map(o=>new Date(latestActivityTime(o)).getTime()),new Date(a.createdAt).getTime());
      const latestB=Math.max(...bObs(b).map(o=>new Date(latestActivityTime(o)).getTime()),new Date(b.createdAt).getTime());
      return latestB-latestA||b.date.localeCompare(a.date);
    });
}
function roleHero(){
  const r=me().role;
  if(r==='employee')return `<div class="hero"><div><small>NHÂN VIÊN • GHI NHẬN HÀNG TƯƠI</small><h2>Ghi nhận nhanh, không giới hạn số lượng hình ảnh.</h2><p>Chụp ảnh liên tiếp và mô tả tình trạng. Hệ thống tự động nén, đóng dấu thời gian/mã cửa hàng và tổng hợp cuối ngày cho Cửa hàng trưởng.</p></div><div class="hero-label"><strong>01</strong><span>Bước: báo cáo</span></div></div>`;
  if(r==='manager')return `<div class="hero"><div><small>CỬA HÀNG TRƯỞNG • QUẢN LÝ THEO NGÀY</small><h2>Quan sát dữ liệu. Đề xuất phương án.</h2><p>Kiểm tra bảng tổng hợp cuối ngày, lựa chọn giảm giá 30% / 50%, hủy hàng hoặc phương án khác — đề xuất được đồng bộ ngay cho Quản lý khu vực.</p></div><div class="hero-label"><strong>02</strong><span>Bước: đề xuất</span></div></div>`;
  return `<div class="hero"><div><small>QUẢN LÝ KHU VỰC • PHÊ DUYỆT</small><h2>Một hàng đợi, nhiều cửa hàng.</h2><p>Nhận các đề xuất đã được Cửa hàng trưởng lập và đồng bộ theo thời gian thực, duyệt hoặc từ chối kèm lý do và theo dõi thực hiện.</p></div><div class="hero-label"><strong>03</strong><span>Bước: phê duyệt</span></div></div>`;
}

function storeStackedChartPanel(obs){
  const areaStores=STORES.filter(st=>!me()?.storeIds||me().storeIds.includes(st.id));
  const PENDING_STATES=new Set(['pending','blocked','needs_info','awaiting','draft','reported']);
  const storeStats=areaStores.map(st=>{
    const items=obs.filter(o=>o.storeId===st.id);
    const pending=items.filter(o=>PENDING_STATES.has(statusOf(o))).length;
    const resolved=items.length-pending;
    return {
      id:st.id,
      code:st.code,
      name:st.name,
      shortName:st.name.replace(/^WinMart\s+/i,''),
      pending,
      resolved,
      total:items.length
    };
  }).sort((a,b)=>b.total-a.total||b.pending-a.pending);
  const maxStore=Math.max(1,...storeStats.map(x=>x.total));
  const totalPending=storeStats.reduce((s,x)=>s+x.pending,0);
  const totalResolved=storeStats.reduce((s,x)=>s+x.resolved,0);
  const topStores=storeStats.filter(x=>x.total===storeStats[0]?.total&&x.total>0);
  const zeroStores=storeStats.filter(x=>x.total===0);
  const summaryTitle=topStores.length
    ? `${h(topStores.map(x=>x.shortName).join(', '))} · ${topStores[0].total} báo cáo`
    : 'Chưa có dữ liệu';
  const summarySub=obs.length
    ? `Toàn khu vực: ${totalPending} chờ duyệt · ${totalResolved} đã xử lý`
    : 'Chờ các chi nhánh gửi đề xuất';
  const noteText=zeroStores.length
    ? `Lưu ý: ${h(zeroStores.map(x=>x.shortName).join(', '))} chưa có báo cáo gửi lên khu vực.`
    : 'Cột cam: phiếu chờ duyệt / bổ sung · Cột xanh: phiếu đã duyệt / hoàn tất / từ chối.';
  return `<section class="panel"><div class="panel-head"><div><h2>Thống kê báo cáo theo cửa hàng</h2><p>Phân bổ phiếu chờ duyệt và đã xử lý tại từng chi nhánh</p></div></div><div class="panel-body"><div class="chart-summary"><b>${summaryTitle}</b><span>${summarySub}</span></div><div class="stacked-legend-inline"><span><i class="pending"></i>Chờ duyệt / Cần xử lý (${totalPending})</span><span><i class="resolved"></i>Đã duyệt / Đã xử lý (${totalResolved})</span></div><div class="fruit-bars">${storeStats.map(x=>`<div class="store-bar" title="${h(x.name)} (${h(x.code)}) — Chờ duyệt: ${x.pending} | Đã xử lý: ${x.resolved} | Tổng: ${x.total}"><span class="store-bar-name">${h(x.shortName)}</span><div class="stacked-track">${x.pending?`<div class="stacked-seg pending" style="width:${x.pending/maxStore*100}%">${x.pending/maxStore>=0.13?x.pending:''}</div>`:''}${x.resolved?`<div class="stacked-seg resolved" style="width:${x.resolved/maxStore*100}%">${x.resolved/maxStore>=0.13?x.resolved:''}</div>`:''}</div><b>${x.total}</b></div>`).join('')}</div><p class="small-info chart-note">${noteText}</p></div></section>`;
}

function fruitCharts(obs){
  const fruits=obs.filter(o=>prod(o.productId)?.category==='Trái cây');
  const ranked=PRODUCTS.filter(p=>p.category==='Trái cây').map(p=>({name:p.name,n:fruits.filter(o=>o.productId===p.id).length})).sort((a,b)=>b.n-a.n);
  const max=Math.max(1,...ranked.map(x=>x.n));
  const palette=['#cf4952','#ec9954','#c9982c','#699b79','#778bab','#9c7db1','#94a3b8'];
  const issues=CONDITIONS.map((name,i)=>({name,n:fruits.filter(o=>o.condition===name).length,color:palette[i]})).filter(x=>x.n).sort((a,b)=>(a.name==='Khác'?1:b.name==='Khác'?-1:b.n-a.n));
  let offset=0;
  const segments=issues.map(x=>{let start=offset;offset+=x.n/fruits.length*100;return `${x.color} ${start}% ${offset}%`}).join(',');
  const stdIssues=issues.filter(x=>x.name!=='Khác');
  const otherCount=issues.find(x=>x.name==='Khác')?.n||0;
  const leftPanel=me()?.role==='area'
    ? storeStackedChartPanel(obs)
    : `<section class="panel"><div class="panel-head"><div><h2>Trái cây có nhiều vấn đề nhất</h2><p>Số lượt ghi nhận theo từng loại trái cây</p></div></div><div class="panel-body"><div class="chart-summary"><b>${fruits.length?`${h(ranked.filter(x=>x.n===ranked[0].n).map(x=>x.name).join(", "))} · ${ranked[0].n} lượt/loại`:'Chưa có dữ liệu'}</b><span>${fruits.length?'Nhóm có nhiều báo cáo nhất':'Chờ nhân viên ghi nhận'}</span></div><div class="fruit-bars">${ranked.map(x=>`<div class="fruit-bar"><span>${h(x.name)}</span><div class="fruit-track"><div style="width:${x.n/max*100}%" class="fruit-fill"></div></div><b>${x.n}</b></div>`).join('')}</div><p class="small-info chart-note">Đếm số lượt báo cáo, không cộng số lượng khác đơn vị.</p></div></section>`;
  return `<div class="chart-grid">${leftPanel}<section class="panel"><div class="panel-head"><div><h2>Cơ cấu vấn đề của trái cây</h2><p>Tỷ trọng theo tình trạng ghi nhận chuẩn (tách riêng nhóm Khác)</p></div></div><div class="panel-body"><div class="donut-layout"><div class="donut" role="img" aria-label="${h(issues.map(x=>x.name+': '+x.n+' lượt').join(', ')||'Chưa có dữ liệu')}" style="background:${segments?'conic-gradient('+segments+')':'#edeef1'}"><div><strong>${fruits.length}</strong><span>báo cáo</span></div></div><div class="chart-legend">${issues.length?issues.map(x=>`<div class="legend-row"><i style="background:${x.color}"></i><span>${h(x.name==='Khác'?'Khác (ngoại lệ)':x.name)}</span><b>${fmt(x.n/fruits.length*100)}%</b></div>`).join(''):'<span class="small-info">Chưa có báo cáo trái cây.</span>'}</div></div><p class="small-info chart-note">${stdIssues.length?`Lỗi chuẩn phổ biến nhất: ${h(stdIssues.filter(x=>x.n===stdIssues[0].n).map(x=>x.name).join("; "))} (${stdIssues[0].n} lượt).${otherCount?' Nhóm "Khác" ('+otherCount+' lượt) được tách riêng để không làm sai lệch thống kê chuẩn.':''}`:'Chưa có tình trạng để thống kê.'}</p></div></section></div>`;
}

function approvalPreview(obs,limit=Infinity){
  return obs.length?`<div class="queue-list">${obs.slice(0,limit).map(o=>{
    let r=latestReq(o);
    const val=itemValue(o);
    const rec=calcRecoveryForReq(o,r);
    return `<div class="queue-row"><div><b>${h(prod(o.productId).name)}</b><div class="subtext">${h(o.id)} · ${h(store(o.storeId).name)} · ${h(o.condition)}</div></div><div><b>${h(actionText(r))}</b><div class="subtext">${fmt(r.qty)} ${h(r.unit)} · Gốc ${fmtMoney(val)} (Thu hồi ${fmtMoney(rec)})</div></div>${tag(r.status)}<button class="btn small soft" data-detail="${o.id}">Xem xét →</button></div>`;
  }).join('')}</div>`:'<div class="empty"><b>Không có yêu cầu đang chờ</b><small>Các đề xuất được gửi sẽ hiển thị tại đây.</small></div>';
}

function dashboard(){
  let obs=accessibleObs().sort((a,b)=>latestActivityTime(b).localeCompare(latestActivityTime(a)));
  let area=me().role==='area';
  let pending=obs.filter(o=>['pending','blocked'].includes(statusOf(o)));
  let urgent=area?pending:obs.filter(o=>['awaiting','blocked','needs_info'].includes(statusOf(o)));
  let counts=area?[
    ['Chờ phê duyệt',pending.length,`Giá trị gốc ${fmtMoney(totalValue(pending))}`,'◷'],
    ['Đã duyệt',countStatuses(obs,'approved'),'Chờ cửa hàng xử lý','✓'],
    ['Hoàn tất',countStatuses(obs,'completed'),'Đã có kết quả thực tế','◈'],
    ['Tổng giá trị ghi nhận',fmtMoney(totalValue(obs)),`Thu hồi dự kiến ${fmtMoney(expectedRecovery(obs))}`,'₫']
  ]:[
    ['Tổng báo cáo',obs.length,`Giá trị gốc ${fmtMoney(totalValue(obs))}`,'▤'],
    ['Chờ đề xuất',countStatuses(obs,'awaiting'),'Đã chốt tổng hợp cuối ngày','▦'],
    ['Chờ phê duyệt',countStatuses(obs,'pending'),'Đã gửi quản lý khu vực','◷'],
    ['Thu hồi dự kiến',fmtMoney(expectedRecovery(obs)),`Trên tổng ${fmtMoney(totalValue(obs))} hàng ghi nhận`,'₫']
  ];
  const scopeLabel=area?'Khu vực 01 · Theo dõi tình trạng hàng hóa và xử lý các đề xuất.':`${store(me().storeId).name} · Theo dõi tình trạng hàng hóa và đề xuất xử lý.`;
  return `${header(heading(),scopeLabel,`<button class="btn" data-action="guideline">📘 Hướng dẫn sử dụng</button><button class="btn primary" data-nav="${area?'approvals':'proposals'}">${area?'Duyệt yêu cầu':'Lập đề xuất xử lý'} →</button>`)}${area?'':roleHero()}<div class="metrics">${counts.map(x=>metric(...x)).join('')}</div>${fruitCharts(obs)}<section class="panel dashboard-queue"><div class="panel-head"><div><h2>${area?'Yêu cầu cần phê duyệt':'Báo cáo cần chú ý'}</h2><p>${area?'Đề xuất đang chờ quyết định từ Cửa hàng trưởng':'Báo cáo cần đề xuất hoặc xử lý ngoại lệ'}</p></div><button class="rowlink" data-nav="${area?'approvals':'proposals'}">Xem tất cả →</button></div>${area?approvalPreview(urgent,5):shortList(urgent,5)}</section>`;
}

const REPORT_FILTERS=[
  ['pending','Chờ phê duyệt',['pending']],
  ['needs_info','Bổ sung',['needs_info','blocked']],
  ['in_progress','Đang xử lý',['approved','in_progress']],
  ['rejected','Từ chối',['rejected']],
  ['completed','Hoàn tất',['completed']]
];
function reportStatusTag(o){const raw=statusOf(o);const group=REPORT_FILTERS.find(([, ,states])=>states.includes(raw));return group?`<span class="chip ${h(group[0])}">${h(group[1])}</span>`:tag(raw)}
function matchesReportFilter(o,filter){return filter==='all'||(REPORT_FILTERS.find(([key])=>key===filter)?.[2]||[]).includes(statusOf(o))}

function dateFilterWidget(isoVal){
  const vnVal=isoToVnDate(isoVal);
  return `<div class="date-input-wrap" title="Nhập tay dd/mm/yyyy hoặc bấm lịch"><input type="text" class="date-text" id="reportDateText" value="${h(vnVal)}" placeholder="dd/mm/yyyy" maxlength="10" inputmode="numeric" aria-label="Lọc theo ngày (dd/mm/yyyy)">${vnVal?'<button type="button" class="date-clear" data-action="clear-date" title="Xóa lọc ngày">×</button>':''}<label class="date-cal-btn" title="Chọn trên lịch">📅<input type="date" id="reportDatePicker" value="${h(isoVal||'')}" aria-label="Chọn ngày trên lịch"></label></div>`;
}

function filteredReports(){
  // Sắp xếp theo thời điểm duyệt / tương tác mới nhất lên đầu
  let obs=accessibleObs().sort((a,b)=>latestActivityTime(b).localeCompare(latestActivityTime(a)));
  if(state.search){
    let q=state.search.toLowerCase();
    obs=obs.filter(o=>[o.id,o.incidentId,prod(o.productId).name,store(o.storeId).name,o.condition,o.conditionDetail||''].some(x=>x.toLowerCase().includes(q)));
  }
  if(state.filter!=='all')obs=obs.filter(o=>me().role==='manager'?matchesReportFilter(o,state.filter):statusOf(o)===state.filter);
  if(state.store!=='all')obs=obs.filter(o=>o.storeId===state.store);
  if(state.reportDate){
    obs=obs.filter(o=>{
      const createdDay=dateVN(new Date(o.createdAt));
      const decidedDay=latestReq(o)?.decidedAt?dateVN(new Date(latestReq(o).decidedAt)):null;
      return createdDay===state.reportDate||decidedDay===state.reportDate;
    });
  }
  if(me().role==='manager'&&state.reportBatch&&state.reportBatch!=='all'){
    obs=obs.filter(o=>state.reportBatch==='unbatched'?!o.batchId:o.batchId===state.reportBatch);
  }
  return obs;
}

function reports(){
  if(me().role==='area')return areaReports();
  const manager=me().role==='manager';
  let obs=filteredReports();
  const bs=manager?scopedBatches():[];
  const selected=bs.find(b=>b.id===state.reportBatch);
  const unbatched=manager?accessibleObs().filter(o=>!o.batchId).length:0;
  const stName=store(me().storeId).name;
  const batchSelector=manager?`<section class="panel report-batch-panel"><div class="panel-body"><div class="report-batch-control"><div><h2 style="margin:0 0 5px">Xem theo đợt tổng hợp</h2><p class="small-info" style="margin:0">Chọn mã đợt và ngày tổng hợp của ${h(stName)}.</p></div><select class="filter report-batch-select" id="reportBatch" aria-label="Chọn đợt tổng hợp"><option value="all" ${!state.reportBatch||state.reportBatch==='all'?'selected':''}>Tất cả báo cáo (kể cả chưa tổng hợp)</option>${bs.map(b=>`<option value="${h(b.id)}" ${state.reportBatch===b.id?'selected':''}>${h(b.id)} · ${displayDay(b.date)} · ${bObs(b).length} báo cáo · ${h(statusName[b.status])}</option>`).join('')}<option value="unbatched" ${state.reportBatch==='unbatched'?'selected':''}>Chưa tổng hợp (${unbatched} báo cáo)</option></select></div>${selected?`<div class="report-batch-summary"><div><span class="small-info">Đợt đang xem</span><br><b>${h(selected.id)} · ${displayDay(selected.date)}</b></div><div><span class="small-info">Tổng ghi nhận trong đợt</span><br><b>${bObs(selected).length} báo cáo</b></div><div><span class="small-info">Tổng giá trị hàng</span><br><b>${fmtMoney(totalValue(bObs(selected)))}</b></div><div>${tag(selected.status)}</div></div>`:state.reportBatch==='unbatched'?`<div class="insight" style="margin-top:14px">${unbatched} ghi nhận chưa được đưa vào đợt tổng hợp cuối ngày.</div>`:''}</div></section>`:'';
  return `${header(heading(),manager?`Tra cứu các ghi nhận chi tiết theo từng đợt tổng hợp tại ${h(stName)} (đơn mới duyệt hiển thị trên đầu).`:`Các ghi nhận chi tiết từ nhân viên tại ${h(stName)}.`,manager?'':'<button class="btn primary" data-nav="new">＋ Báo cáo mới</button>')}${batchSelector}<div class="filters"><input class="search" id="search" value="${h(state.search)}" placeholder="Tìm mã báo cáo, sản phẩm, tình trạng..." aria-label="Tìm báo cáo"><select class="filter" id="statusfilter"><option value="all">Tất cả trạng thái</option>${(manager?REPORT_FILTERS:Object.entries(statusName).filter(([k])=>!['collecting','sent'].includes(k))).map(([k,v])=>`<option value="${k}" ${state.filter===k?'selected':''}>${v}</option>`).join('')}</select>${dateFilterWidget(state.reportDate)}</div><div class="panel">${table(obs,{reportStatus:manager})}</div><div class="small-info" style="margin-top:13px">Hiển thị ${obs.length} báo cáo${selected?' trong đợt '+h(selected.id):''}${manager?' · Tổng giá trị: '+fmtMoney(totalValue(obs)):''}</div>`;
}

function batchTiles(batch){
  const observations=bObs(batch);
  let proposedCount=observations.filter(o=>!!latestReq(o)).length;
  const origVal=totalValue(observations);
  const recVal=expectedRecovery(observations);
  return `<div class="metrics">${metric('Báo cáo trong ngày',observations.length,displayDay(batch.date),'▤')}${metric('Đã đề xuất',`${proposedCount}/${observations.length}`,'Đồng bộ ngay khi lưu đề xuất','✎')}${metric('Tổng giá trị hàng',fmtMoney(origVal),unitsSummary(observations),'₫')}${metric('Thu hồi dự kiến',fmtMoney(recVal),proposedCount?`Tỷ lệ thu hồi ${origVal?Math.round(recVal/origVal*100):0}%`:'Chưa lập phương án','◈')}</div>`;
}

function daily(){
  if(me().role==='area')return areaDaily();
  let bs=scopedBatches(),manager=me().role==='manager',today=dateVN(),unbatched=manager?accessibleObs().filter(o=>!o.batchId):[];
  let chosen=bs.find(b=>b.id===state.selectedBatch)||bs[0];
  if(chosen)state.selectedBatch=chosen.id;
  let expl=manager?'Sau khi chốt ngày, Cửa hàng trưởng lập đề xuất cho từng báo cáo; mỗi đề xuất sẽ tự động đồng bộ sang Quản lý khu vực.':'Xem từng đợt tổng hợp theo cửa hàng; phê duyệt thực hiện tại hàng đợi riêng.';
  let lead=header(heading(),expl,'');
  let list=bs.map(b=>`<div class="batchcard ${chosen?.id===b.id?'selected':''}" data-batch="${b.id}" role="button" tabindex="0"><div><h3>${displayDay(b.date)} · ${h(store(b.storeId).code)}</h3><p>${h(store(b.storeId).name)} · ${bObs(b).length} báo cáo · ${fmtMoney(totalValue(bObs(b)))}</p></div>${tag(b.status)}</div>`).join('')||'<div class="empty">Chưa có đợt tổng hợp</div>';
  let action='';
  if(manager&&chosen?.status==='awaiting'){
    let obs=bObs(chosen);
    let missing=obs.filter(o=>!o.photos.length);
    let proposed=obs.filter(o=>!!latestReq(o));
    let ready=obs.length>0&&proposed.length===obs.length&&!missing.length;
    action=`<div class="panel-body"><div class="insight">Có <strong>${obs.length} báo cáo</strong> (tổng giá trị ${fmtMoney(totalValue(obs))}). Đã lập đề xuất <strong>${proposed.length}/${obs.length}</strong>. ${missing.length?'Có '+missing.length+' báo cáo thiếu ảnh. ':''}Bạn có thể chốt gửi cả đợt khi hoàn tất 100%.</div><div class="formfoot"><button class="btn" data-action="open-proposals" data-id="${chosen.id}">Lập phương án xử lý →</button><button class="btn primary" data-action="send-batch" data-id="${chosen.id}" ${ready?'':'disabled'}>Chốt hoàn tất đợt (${proposed.length}/${obs.length}) →</button></div></div>`;
  }
  let extra=manager&&unbatched.length?`<div class="insight" style="margin-bottom:14px"><strong>${unbatched.length} báo cáo chưa được đưa vào đợt tổng hợp:</strong> ${unbatched.filter(o=>dateVN(new Date(o.createdAt))===today).length} báo cáo hôm nay sẽ được hệ thống tổng hợp vào cuối ngày.</div>`:'';
  return `${lead}${extra}<div class="cols daily-cols"><div class="panel"><div class="panel-head"><div><h2>Đợt tổng hợp</h2><p>${bs.length} đợt đã được tạo</p></div></div><div class="panel-body">${list}</div></div><div>${chosen?`${batchTiles(chosen)}<div class="panel"><div class="panel-head"><div><h2>${h(chosen.id)} · ${displayDay(chosen.date)}</h2><p>${h(store(chosen.storeId).name)} · ${statusName[chosen.status]}</p></div><div class="actions">${tag(chosen.status)}<button class="btn small soft" data-action="export-batch" data-id="${chosen.id}">⇩ Xuất PDF</button></div></div>${table(bObs(chosen))}${action}</div>`:'<div class="panel"><div class="empty">Chưa có bản tổng hợp cuối ngày.</div></div>'}</div></div>`;
}

function proposals(){
  if(me().role!=='manager')return '';
  const bs=scopedBatches(),work=bs.filter(b=>b.status==='awaiting'||bObs(b).some(o=>['needs_info','pending'].includes(statusOf(o))));
  const chosen=bs.find(b=>b.id===state.selectedBatch)||work[0]||bs[0];if(chosen)state.selectedBatch=chosen.id;
  const obs=chosen?bObs(chosen):[],proposed=obs.filter(o=>!!latestReq(o)),missing=obs.filter(o=>!o.photos.length),ready=obs.length&&proposed.length===obs.length&&!missing.length&&chosen.status==='awaiting';
  const editable=o=>o.photos.length&&['awaiting','draft','pending','needs_info'].includes(statusOf(o));
  return `${header('Đề xuất xử lý','Cửa hàng trưởng lập phương án cho từng ghi nhận. Ngay khi lưu, đề xuất sẽ đồng bộ tức thì sang Quản lý khu vực để phê duyệt.',`<button class="btn" data-nav="daily">Xem tổng hợp cuối ngày</button>`)}
  <div class="approval-summary"><div><strong>${work.length}</strong><span>Đợt cần xử lý</span></div><div><strong>${proposed.length}/${obs.length}</strong><span>Đề xuất đã gửi trong đợt</span></div><div><strong>${fmtMoney(expectedRecovery(obs))} / ${fmtMoney(totalValue(obs))}</strong><span>Thu hồi dự kiến / Giá trị gốc</span></div></div>
  <section class="panel" style="margin-bottom:16px"><div class="panel-body"><label for="areaBatch"><b>Chọn đợt tổng hợp</b></label> <select id="areaBatch" class="filter">${bs.map(b=>`<option value="${b.id}" ${chosen?.id===b.id?'selected':''}>${displayDay(b.date)} · ${h(b.id)} · ${b.status==='sent'?'Đã chốt & gửi đợt':'Đang mở đề xuất'}</option>`).join('')}</select></div></section>
  ${chosen?`<section class="panel"><div class="panel-head"><div><h2>${h(store(chosen.storeId).name)} · ${displayDay(chosen.date)}</h2><p>Giảm giá 30% / 50%, hủy hàng hoặc nhập phương án xử lý khác.</p></div>${tag(chosen.status)}</div><div class="tablewrap"><table class="table"><thead><tr><th>Trái cây / Mã báo cáo</th><th>Tình trạng</th><th>Số lượng / Giá trị</th><th>Phương án hiện tại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${obs.map(o=>{
    let r=latestReq(o);
    const p=prod(o.productId);
    const orig=itemValue(o);
    const rec=r?calcRecoveryForReq(o,r):null;
    return `<tr><td><div class="maintext">${h(p.name)}</div><div class="subtext">${h(o.id)} · ${o.photos.length} ảnh · ${fmtMoney(p.price)}/${h(o.unit)}</div></td><td>${h(o.condition)}${o.conditionDetail?`<div class="subtext">${h(o.conditionDetail)}</div>`:''}</td><td class="nowrap"><div class="maintext">${qtyText(o)}</div><div class="subtext">Gốc: ${fmtMoney(orig)}</div></td><td>${r?`<div>${h(actionText(r))} · ${fmt(r.qty)} ${h(r.unit)}</div><div class="subtext">Thu hồi: ${fmtMoney(rec)}</div>`:'Chưa đề xuất'}</td><td>${tag(statusOf(o))}</td><td><div class="actions"><button class="btn small" data-detail="${o.id}">Xem</button>${editable(o)?`<button class="btn small primary" data-action="propose" data-id="${o.id}">${r?'Sửa đề xuất':'Lập đề xuất'}</button>`:''}</div></td></tr>`;
  }).join('')}</tbody></table></div>${chosen.status==='awaiting'?`<div class="panel-body"><div class="insight">${proposed.length}/${obs.length} ghi nhận đã có đề xuất và đồng bộ sang Quản lý khu vực. ${missing.length?missing.length+' ghi nhận thiếu ảnh minh chứng. ':''}Bấm chốt đợt khi hoàn thành tất cả báo cáo trong ngày.</div><div class="formfoot"><button class="btn primary" data-action="send-batch" data-id="${chosen.id}" ${ready?'':'disabled'}>Chốt hoàn tất đợt tổng hợp →</button></div></div>`:''}</section>`:'<div class="panel"><div class="empty">Chưa có đợt tổng hợp.</div></div>'}`;
}

function consolidatedTable(b){
  const grouped=new Map();
  for(const o of bObs(b)){
    let key=o.productId+'|'+o.condition;
    let g=grouped.get(key);
    const p=prod(o.productId);
    if(!g){g={product:p,condition:o.condition,qty:0,origVal:0,recVal:0,n:0,actions:new Map(),statuses:new Map()};grouped.set(key,g)}
    g.qty+=o.qty;
    g.origVal+=itemValue(o);
    g.n++;
    let r=latestReq(o);
    if(r){
      let akey=actionText(r);
      g.actions.set(akey,(g.actions.get(akey)||0)+r.qty);
      g.recVal+=calcRecoveryForReq(o,r);
    }else{
      g.recVal+=itemValue(o);
    }
    let st=statusOf(o);
    g.statuses.set(st,(g.statuses.get(st)||0)+1);
  }
  return `<div class="tablewrap"><table class="table"><thead><tr><th>Trái cây</th><th>Tình trạng</th><th>Tổng số lượng / Giá trị</th><th>Phương án cửa hàng trưởng</th><th>Tiến độ phê duyệt</th></tr></thead><tbody>${[...grouped.values()].map(g=>`<tr><td><div class="maintext">${h(g.product.name)}</div><div class="subtext">${g.n} ghi nhận gộp · ${fmtMoney(g.product.price)}/${h(g.product.unit)}</div></td><td>${h(g.condition)}</td><td class="nowrap"><div class="maintext">${fmt(g.qty)} ${h(g.product.unit)}</div><div class="subtext">Gốc: ${fmtMoney(g.origVal)} · Thu hồi: ${fmtMoney(g.recVal)}</div></td><td>${[...g.actions].map(([a,q])=>`<div>${h(a)} · ${fmt(q)} ${h(g.product.unit)}</div>`).join('')||'—'}</td><td>${[...g.statuses].map(([st,n])=>`<div style="margin:2px 0">${tag(st)} <span class="small-info">×${n}</span></div>`).join('')}</td></tr>`).join('')}</tbody></table></div>`;
}
function batchProgress(b){let obs=bObs(b);let n=obs.filter(o=>['pending','blocked'].includes(statusOf(o))).length,fix=obs.filter(o=>statusOf(o)==='needs_info').length;if(fix)return 'needs_info';if(n)return 'pending';if(obs.length&&obs.every(o=>statusOf(o)==='completed'))return 'completed';if(obs.some(o=>statusOf(o)==='approved'))return 'approved';return b.status==='sent'?'sent':'awaiting'}

function areaReports(){
  let bs=scopedBatches();
  if(state.reportDate){
    bs=bs.filter(b=>b.date===state.reportDate||bObs(b).some(o=>latestReq(o)?.decidedAt&&dateVN(new Date(latestReq(o).decidedAt))===state.reportDate));
  }
  if(state.search){
    const q=state.search.toLowerCase();
    bs=bs.filter(b=>[b.id,store(b.storeId).name,displayDay(b.date),b.date].some(v=>v.toLowerCase().includes(q)));
  }
  return `${header('Tất cả báo cáo','Hiển thị các đợt tổng hợp đã chốt hoặc đang có đề xuất đồng bộ từ Cửa hàng trưởng (đợt mới duyệt/cập nhật hiển thị trên đầu).')}
  <div class="filters"><input class="search" id="search" value="${h(state.search)}" placeholder="Tìm mã tổng hợp, tên cửa hàng hoặc ngày..." aria-label="Tìm báo cáo tổng hợp">${dateFilterWidget(state.reportDate)}</div>
  <div class="panel"><div class="panel-head"><div><h2>Báo cáo tổng hợp theo ngày</h2><p>${bs.length} báo cáo ngày · Khu vực 01</p></div></div>${bs.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Mã tổng hợp / Ngày</th><th>Cửa hàng</th><th>Người xác nhận</th><th>Trái cây / Giá trị</th><th>Cập nhật / Duyệt gần nhất</th><th>Tiến độ khu vực</th><th></th></tr></thead><tbody>${bs.map(b=>{
    const obs=bObs(b);
    const proposer=obs.map(latestReq).find(Boolean)?.createdBy;
    const latestDecided=obs.map(o=>latestReq(o)?.decidedAt).filter(Boolean).sort().at(-1);
    return `<tr><td><div class="maintext">${h(b.id)}</div><div class="subtext">${displayDay(b.date)}</div></td><td>${h(store(b.storeId).name)}</td><td><div class="maintext">${h(user(b.sentBy||proposer)?.name||'Cửa hàng trưởng')}</div><div class="subtext">${b.sentAt?'Đã chốt đợt · '+displayShortTime(b.sentAt):'Đồng bộ đề xuất trực tiếp'}</div></td><td><div class="maintext">${new Set(obs.map(o=>o.productId)).size} loại · ${fmtMoney(totalValue(obs))}</div><div class="subtext">${h(unitsSummary(obs))} · Thu hồi ${fmtMoney(expectedRecovery(obs))}</div></td><td class="nowrap">${latestDecided?`<div class="maintext" style="color:var(--green)">✓ ${displayShortTime(latestDecided)}</div>`:'<span class="blank">Chưa duyệt</span>'}</td><td>${tag(batchProgress(b))}</td><td><button class="btn small soft" data-action="open-area-batch" data-id="${b.id}">Xem tổng hợp →</button></td></tr>`;
  }).join('')}</tbody></table></div>`:'<div class="empty"><b>Chưa có báo cáo tổng hợp phù hợp</b><small>Chờ Cửa hàng trưởng lập đề xuất hoặc gửi báo cáo cuối ngày.</small></div>'}</div>`;
}

function areaDaily(){
  let bs=scopedBatches();
  let chosen=bs.find(b=>b.id===state.selectedBatch)||bs[0];
  if(chosen)state.selectedBatch=chosen.id;
  return `${header('Báo cáo theo ngày','Chọn ngày tổng hợp để xem tình hình hàng hóa và tiến độ xử lý.')}<div class="panel area-day-picker"><div class="panel-body"><label for="areaBatch"><b>Đợt tổng hợp</b></label><select id="areaBatch" class="filter">${bs.map(b=>`<option value="${b.id}" ${chosen?.id===b.id?'selected':''}>${displayDay(b.date)} · ${h(store(b.storeId).name)} · ${h(statusName[batchProgress(b)])}</option>`).join('')}</select></div></div>${chosen?`<div class="approval-summary"><div><strong>${bObs(chosen).length}</strong><span>Báo cáo trong đợt</span></div><div><strong>${fmtMoney(totalValue(bObs(chosen)))}</strong><span>Tổng giá trị gốc</span></div><div><strong>${fmtMoney(expectedRecovery(bObs(chosen)))}</strong><span>Thu hồi dự kiến</span></div></div><section class="panel"><div class="panel-head"><div><h2>${h(store(chosen.storeId).name)}</h2><p>${displayDay(chosen.date)} · ${h(chosen.id)}</p></div><div class="actions">${tag(batchProgress(chosen))}<button class="btn small soft" data-action="export-batch" data-id="${chosen.id}">⇩ Xuất PDF</button></div></div>${consolidatedTable(chosen)}</section>`:'<div class="panel"><div class="empty">Chưa có đợt tổng hợp.</div></div>'}`;
}

function approvals(){
  const obs=accessibleObs().filter(o=>['pending','blocked'].includes(statusOf(o))).sort((a,b)=>latestActivityTime(b).localeCompare(latestActivityTime(a)));
  const grouped=obs.reduce((a,o)=>{(a[o.batchId]??=[]).push(o);return a},{});
  return `${header('Phê duyệt đề xuất','Xem đề xuất từ Cửa hàng trưởng và quyết định phương án xử lý.')}<div class="approval-summary"><div><strong>${obs.filter(o=>statusOf(o)==='pending').length}</strong><span>Đang chờ duyệt</span></div><div><strong>${fmtMoney(totalValue(obs))}</strong><span>Tổng giá trị gốc chờ duyệt</span></div><div><strong>${fmtMoney(expectedRecovery(obs))}</strong><span>Thu hồi dự kiến</span></div></div>${!obs.length?'<div class="panel"><div class="empty"><b>Không có yêu cầu đang chờ</b><small>Chờ Cửa hàng trưởng gửi đề xuất xử lý.</small></div></div>':Object.entries(grouped).map(([id,items])=>{let b=db.batches.find(x=>x.id===id);return `<section class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h2>${h(store(b.storeId).name)}</h2><p>${displayDay(b.date)} · ${h(b.id)} · ${items.length} yêu cầu · Giá trị ${fmtMoney(totalValue(items))}</p></div>${tag(b.status)}</div>${approvalPreview(items)}</section>`}).join('')}`;
}

function reportForm(){
  if(me().role!=='employee')return '<div class="empty">Bạn không có quyền ghi nhận báo cáo.</div>';
  let existing=state.followId?incident(state.followId):null;
  let pr=existing?.productId;
  let myStore=store(me().storeId);
  return `${header(state.followId?'Báo cáo diễn biến tiếp theo':'Ghi nhận tình trạng hàng','Chụp ảnh liên tiếp và ghi nhận trực tiếp bằng điện thoại; Cửa hàng trưởng sẽ đề xuất phương án xử lý.',`<button class="btn small" data-action="guideline">📘 Hướng dẫn nhanh</button>`)}<div class="formlayout"><form class="form-shell" id="reportForm"><h2 class="form-title">${existing?'Tiếp tục vụ việc '+h(existing.id):'Phiếu ghi nhận tình trạng hàng'} <span class="chip reported" style="margin-left:7px">Chỉ ghi nhận</span></h2><div class="formgrid"><div class="group"><label>Cửa hàng</label><input value="${h(myStore.name)} (${h(myStore.code)})" disabled><small>Theo chi nhánh đã chọn trên điện thoại</small></div><div class="group"><label>Sản phẩm <span class="req">*</span></label><select id="product" required ${existing?'disabled':''}>${!existing?'<option value="">Chọn sản phẩm</option>':''}${PRODUCTS.map(p=>`<option value="${p.id}" ${pr===p.id?'selected':''}>${h(p.name)}</option>`).join('')}</select></div><div class="group"><label>Số lượng ảnh hưởng <span class="req">*</span></label><input type="number" step="0.01" min="0.01" id="qty" placeholder="VD: 2.5" required></div><div class="group"><label>Đơn vị đo</label><input id="unit" value="${pr?h(prod(pr).unit):'Chọn sản phẩm trước'}" disabled><small>Giữ nguyên kg, hộp; không tự quy đổi</small></div><div class="group wide"><label>Tình trạng sản phẩm <span class="req">*</span></label><select id="condition" required><option value="">Chọn tình trạng</option>${CONDITIONS.map(c=>`<option value="${h(c)}">${h(c)}</option>`).join('')}</select></div><div class="group wide" id="conditionOtherGroup" style="display:none"><label>Mô tả nhanh tình trạng khác <span class="req">*</span></label><input type="text" id="conditionOther" placeholder="VD: Vừa dập vỏ vừa chín quá mức, có mùi lạ..."></div><div class="group wide"><label>Mô tả chi tiết hiện trường <span class="req">*</span></label><textarea id="desc" required placeholder="Ví dụ: 2.5 kg táo có vết dập nhẹ trên vỏ, đã tách khỏi khu vực bày bán..."></textarea></div><div class="group wide"><label>Hình ảnh minh chứng (Không giới hạn số lượng)</label><label class="upload"><span style="font-size:26px">📷</span><strong>Chụp ảnh / chọn nhiều ảnh sản phẩm</strong><span style="font-size:11.5px">Không giới hạn số ảnh · Tự động nén nhẹ & đóng dấu thời gian/mã cửa hàng</span><input type="file" id="photoInput" accept="image/*" capture="environment" multiple></label><div id="photoToolbar"></div><div class="photogrid" id="photoGallery"></div><small>Mọi ảnh đều tự động đóng dấu ngày giờ thực & mã cửa hàng để thay thế việc gửi qua Zalo.</small></div></div><div id="formError" class="error"></div><div class="formfoot"><button type="button" class="btn" data-nav="reports">Hủy</button><button type="submit" class="btn primary">Lưu báo cáo tình trạng →</button></div></form><div style="display:flex;flex-direction:column;gap:15px"><div class="safety-card"><div class="safety-badge">⚠️ Quy tắc an toàn bắt buộc</div><h3>Cách ly ngay hàng không an toàn</h3><p>Hàng có dấu hiệu hư hỏng hoặc không an toàn để bán phải được cách ly ngay khỏi quầy trưng bày — không chờ phê duyệt mới cách ly. Chỉ thực hiện hủy hàng sau khi Quản lý khu vực duyệt và phải nhập đúng số lượng hủy thực tế.</p></div><div class="note-card"><h3>Quy trình sau khi báo cáo</h3><div class="steps"><div class="step done"><b>01</b>Nhân viên ghi nhận</div><div class="step"><b>02</b>Hệ thống gom cuối ngày</div><div class="step"><b>03</b>Cửa hàng trưởng đề xuất</div><div class="step"><b>04</b>Quản lý khu vực duyệt</div><div class="step"><b>05</b>Nhân viên dán tem / xử lý</div></div></div></div></div>`;
}

function photosHTML(pics){
  if(!pics?.length)return '<div class="insight">Chưa có ảnh minh chứng. Báo cáo được ghi nhận, nhưng chưa đủ điều kiện để Cửa hàng trưởng đề xuất xử lý.</div>';
  return `<div class="picture-list">${pics.map((ref,i)=>{
    const src=resolvePhotoSrc(ref);
    return `<a href="${h(src)}" target="_blank" rel="noopener" title="Bấm để xem ảnh lớn"><img src="${h(src)}" alt="Ảnh minh chứng ${i+1}"><span>#${i+1}</span></a>`;
  }).join('')}</div>`;
}

function detail(id){
  const o=db.observations.find(x=>x.id===id);
  if(!o||!allowed(o)||(me().role==='area'&&batchOf(o)?.status!=='sent'&&!latestReq(o)))return;
  let r=latestReq(o),b=batchOf(o),employee=me().role==='employee'&&o.storeId===me().storeId,manager=me().role==='manager'&&o.storeId===me().storeId,area=me().role==='area';
  let canPropose=manager&&o.photos.length&&(!r||['draft','pending','needs_info'].includes(r.status));
  let hist=db.events.filter(e=>e.incidentId===o.incidentId).sort((a,b)=>b.time.localeCompare(a.time));
  let actions=[];
  if(employee){
    actions.push(`<button class="btn soft" data-action="add-photo" data-id="${o.id}">＋ Bổ sung ảnh (${o.photos.length})</button>`);
    if(r?.status==='approved'){
      actions.push(`<button class="btn primary" data-action="execute" data-id="${o.id}">✓ Xác nhận đã thực hiện</button>`);
      actions.push(`<button class="btn danger" data-action="blocked" data-id="${o.id}">Không thể thực hiện</button>`);
    }
    if(r?.status==='completed')actions.push(`<button class="btn" data-action="follow" data-id="${o.incidentId}">＋ Báo xuống cấp tiếp</button>`);
  }
  if(canPropose)actions.push(`<button class="btn primary" data-action="propose" data-id="${o.id}">${r?'✎ Sửa đề xuất':'＋ Đề xuất xử lý'}</button>`);
  if(manager&&!o.photos.length)actions.push('<span class="small-info">Cần nhân viên bổ sung ảnh trước khi đề xuất.</span>');
  if(area&&(r?.status==='pending'||r?.status==='blocked'))actions.push(`<button class="btn primary" data-action="decision" data-id="${o.id}">✓ Duyệt / Từ chối</button>`);
  const p=prod(o.productId);
  const origVal=itemValue(o);
  const recVal=r?calcRecoveryForReq(o,r):null;
  const sameInc=db.observations.filter(x=>x.incidentId===o.incidentId);
  let proposed=r?`<div class="divider"></div><h3>Đề xuất xử lý · ${h(r.id)}</h3><div class="detail-grid"><div><div class="dlabel">Người đề xuất</div><div class="dvalue">${h(user(r.createdBy)?.name||'—')} · Cửa hàng trưởng</div></div><div><div class="dlabel">Phương án đề xuất</div><div class="dvalue">${h(actionText(r))} · ${fmt(r.qty)} ${h(r.unit)}</div></div>${!employee?`<div><div class="dlabel">Thu hồi dự kiến</div><div class="dvalue">${fmtMoney(recVal)} (Gốc: ${fmtMoney(origVal)})</div></div>`:''}<div><div class="dlabel">Trạng thái yêu cầu</div>${tag(r.status)}</div><div><div class="dlabel">Thời gian đề xuất</div><div class="dvalue">${displayTime(r.createdAt)}</div></div>${r.decidedAt?`<div><div class="dlabel">Ngày duyệt / Phản hồi</div><div class="dvalue" style="color:var(--green)">✓ ${displayTime(r.decidedAt)} · ${h(user(r.decidedBy)?.name||'—')}</div></div>`:''}</div><div style="margin-top:12px"><div class="dlabel">Giải thích đề xuất</div><div class="dvalue">${h(r.reason)}</div></div>${r.decisionNote?`<div style="margin-top:10px" class="insight"><strong>Ghi chú Quản lý khu vực:</strong> ${h(r.decisionNote)}</div>`:''}${r.status==='completed'?`<div class="insight" style="margin-top:12px"><strong>Kết quả thực hiện:</strong> ${fmt(r.actualQty)} ${h(r.unit)} · ${h(r.executionNote||'Đã xác nhận thực hiện')} · ${displayTime(r.executedAt)}</div>`:''}`:'';
  let label=r?.action==='markdown'&&['approved','completed'].includes(r.status)?`<div class="divider"></div><div class="insight"><strong>Mẫu nhãn giảm giá (minh họa):</strong> GIẢM ${r.discount}% · ${h(p.name)} (${fmtMoney(p.price*(1-r.discount/100))}/${h(o.unit)}). Chỉ dán sau khi có phê duyệt.</div>`:'';
  const priceGrid=!employee?`<div><div class="dlabel">Đơn giá / Giá trị gốc</div><div class="dvalue">${fmtMoney(p.price)}/${h(o.unit)} · <b>${fmtMoney(origVal)}</b></div></div>`:'';
  modal(`<div class="modal-head"><div><h2>Chi tiết báo cáo ${h(o.id)}</h2><p>Mã vụ việc ${h(o.incidentId)} · ${h(store(o.storeId).name)}</p></div><button class="x" data-action="close" aria-label="Đóng">×</button></div><div class="modal-body"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div class="detail-title">${h(p.name)}</div>${tag(statusOf(o))}</div><div class="detail-grid"><div><div class="dlabel">Số lượng ghi nhận</div><div class="dvalue">${qtyText(o)}</div></div>${priceGrid}<div><div class="dlabel">Tình trạng</div><div class="dvalue">${h(o.condition)}${o.conditionDetail?' — '+h(o.conditionDetail):''}</div></div><div><div class="dlabel">Người ghi nhận</div><div class="dvalue">${h(user(o.createdBy)?.name||'Nhân viên')}</div></div><div><div class="dlabel">Ngày ghi nhận / Đợt</div><div class="dvalue">${displayTime(o.createdAt)} · ${b?displayDay(b.date):'Chưa chốt ngày'}</div></div>${r?.decidedAt?`<div><div class="dlabel">Ngày duyệt</div><div class="dvalue" style="color:var(--green)">✓ ${displayTime(r.decidedAt)}</div></div>`:''}</div><div style="margin-top:15px"><div class="dlabel">Mô tả thực tế</div><div class="dvalue">${h(o.description)}</div></div><div class="divider"></div><h3>Ảnh hiện trường ${o.photos.length?`(${o.photos.length} ảnh · bấm vào ảnh để phóng to)`:''}</h3>${photosHTML(o.photos)}${proposed}${label}${employee?`<div class="divider"></div><h3>Lịch sử xử lý ${sameInc.length>1?`· ${sameInc.length} lần ghi nhận`:''}</h3>${hist.length?hist.map(e=>`<div class="activity"><span class="dot"></span><div><b>${h(e.text)}</b><p>${h(user(e.actorId)?.name||'Hệ thống')} · ${displayTime(e.time)}</p></div></div>`).join(''):'<div class="small-info">Chưa có lịch sử</div>'}`:''}</div><div class="modal-foot"><button class="btn" data-action="close">Đóng</button>${actions.join('')}</div>`);
}

function modal(content,narrow=false){$('#overlay').innerHTML=`<div class="shade" data-backdrop="1"><div class="modal ${narrow?'narrow':''}" role="dialog" aria-modal="true">${content}</div></div>`}
function close(){$('#overlay').innerHTML=''}
function formError(id,msg){let e=$('#'+id);if(e)e.textContent=msg;else toast(msg)}

function guidelineModal(){
  modal(`<div class="modal-head"><div><h2>📘 Hướng dẫn vận hành W-FreshTrack</h2><p>Quy trình phối hợp 3 vai trò trong quản lý hàng tươi sống</p></div><button class="x" data-action="close" aria-label="Đóng">×</button></div><div class="modal-body">
    <div class="guide-step"><h3><span class="chip approved">Bước 01</span> Nhân viên cửa hàng (Giao diện Di động)</h3><p>1. Chọn đúng chi nhánh WinMart đang làm việc.<br>2. Chụp ảnh hoặc tải lên <b>không giới hạn số lượng ảnh</b> sản phẩm giảm chất lượng. Hệ thống tự động nén nhẹ và đóng dấu <i>Mã cửa hàng + Thời gian thực</i> lên ảnh (không cần gửi qua Zalo).<br>3. Khi Quản lý khu vực duyệt phương án, vào mục <b>02. Theo dõi xử lý</b> để dán tem giảm giá hoặc hủy hàng và nhập số lượng thực tế.</p></div>
    <div class="guide-step"><h3><span class="chip pending">Bước 02</span> Cửa hàng trưởng (Giao diện Web)</h3><p>1. Theo dõi biểu đồ mặt hàng & cơ cấu hư hỏng tại <b>01. Tổng quan cửa hàng</b>.<br>2. Vào <b>02. Tổng hợp cuối ngày</b> hoặc <b>03. Đề xuất xử lý</b> để chọn phương án: <i>Giảm giá 30%</i>, <i>Giảm giá 50%</i>, <i>Hủy hàng</i> hoặc <i>Phương án khác (tự nhập)</i>.<br>3. Ngay khi lưu, đề xuất đồng bộ tức thì sang Quản lý khu vực. Cuối ngày bấm chốt đợt tổng hợp.</p></div>
    <div class="guide-step"><h3><span class="chip sent">Bước 03</span> Quản lý khu vực (Giao diện Web)</h3><p>1. Nhận đề xuất theo thời gian thực tại <b>02. Phê duyệt đề xuất</b>.<br>2. Kiểm tra ảnh hiện trường, giá trị gốc và mức thu hồi dự kiến.<br>3. Bấm <b>Phê duyệt</b>, <b>Từ chối</b> hoặc <b>Yêu cầu bổ sung</b> kèm ghi chú. Hệ thống tự động lưu <i>Ngày duyệt</i> và đẩy các đơn mới duyệt lên đầu danh sách.</p></div>
  </div><div class="modal-foot"><button class="btn primary" data-action="close">Đã hiểu quy trình</button></div>`);
}

function updateProposalPreview(o){
  const el=$('#proposalCalc');
  if(!el)return;
  const p=prod(o.productId);
  const action=$('#pAction')?.value||'markdown';
  const qty=Number($('#pQty')?.value||0);
  const orig=(p?.price||0)*qty;
  if(action==='disposal'){
    el.innerHTML=`<strong>Ước tính tài chính:</strong> Hủy ${fmt(qty)} ${h(o.unit)} · Giá trị tổn thất: <strong>${fmtMoney(orig)}</strong> (Thu hồi: 0đ).`;
  }else if(action==='custom'){
    const pct=Math.max(0,Math.min(100,Number($('#pCustomRecovery')?.value||0)));
    const rec=orig*(pct/100);
    el.innerHTML=`<strong>Ước tính tài chính:</strong> Thu hồi dự kiến <strong>${pct}%</strong> = <strong>${fmtMoney(rec)}</strong> / Giá trị gốc ${fmtMoney(orig)}.`;
  }else{
    const discount=Number($('#pDiscount')?.value||30);
    const rec=orig*(1-discount/100);
    const newUnitPrice=(p?.price||0)*(1-discount/100);
    el.innerHTML=`<strong>Ước tính tài chính:</strong> Giá sau giảm ${discount}% còn <strong>${fmtMoney(newUnitPrice)}/${h(o.unit)}</strong> · Thu hồi dự kiến: <strong>${fmtMoney(rec)}</strong> / Giá trị gốc ${fmtMoney(orig)}.`;
  }
}

function toggleProposalFields(){
  const sel=$('#pAction');
  const discGroup=$('#pDiscountGroup');
  const customGroup=$('#pCustomGroup');
  const customRecGroup=$('#pCustomRecGroup');
  if(!sel)return;
  const v=sel.value;
  if(discGroup)discGroup.style.display=v==='markdown'?'flex':'none';
  if(customGroup)customGroup.style.display=v==='custom'?'flex':'none';
  if(customRecGroup)customRecGroup.style.display=v==='custom'?'flex':'none';
}

function proposalModal(id){
  let o=db.observations.find(x=>x.id===id),r=latestReq(o);
  if(!o||me().role!=='manager'||o.storeId!==me().storeId||!o.photos.length||(r&&!['draft','pending','needs_info'].includes(r.status)))return;
  const p=prod(o.productId);
  let unsafe=['Không an toàn để bán','Có dấu hiệu hư hỏng'].includes(o.condition);
  let kind=r?.action||(unsafe?'disposal':'markdown');
  modal(`<div class="modal-head"><div><h2>${r?'Cập nhật đề xuất':'Đề xuất xử lý sản phẩm'}</h2><p>${h(p.name)} · ${qtyText(o)} · Đơn giá ${fmtMoney(p.price)}/${h(o.unit)}</p></div><button class="x" data-action="close">×</button></div><form id="proposalForm" data-id="${o.id}"><div class="modal-body"><div class="insight" style="margin-bottom:17px">Chỉ tài khoản <strong>Cửa hàng trưởng</strong> có quyền lập đề xuất. Đề xuất sẽ tự động đồng bộ sang Quản lý khu vực ngay sau khi lưu.</div><div class="formgrid"><div class="group wide"><label>Phương án xử lý <span class="req">*</span></label><select id="pAction"><option value="markdown" ${kind==='markdown'?'selected':''} ${unsafe?'disabled':''}>Giảm giá bán nhanh</option><option value="disposal" ${kind==='disposal'?'selected':''}>Hủy hàng</option><option value="custom" ${kind==='custom'?'selected':''}>Phương án khác (tự nhập)</option></select></div><div class="group" id="pDiscountGroup"><label>Mức giảm giá</label><select id="pDiscount"><option value="30" ${r?.discount===30?'selected':''}>30%</option><option value="50" ${r?.discount===50?'selected':''}>50%</option></select></div><div class="group" id="pCustomGroup" style="display:none"><label>Tên phương án đề xuất <span class="req">*</span></label><input id="pCustomName" type="text" placeholder="VD: Trả nhà cung cấp / Đóng gói lại..." value="${h(r?.customAction||'')}"></div><div class="group" id="pCustomRecGroup" style="display:none"><label>Tỷ lệ thu hồi ước tính (%)</label><input id="pCustomRecovery" type="number" min="0" max="100" step="1" value="${r?.recoveryPct??0}"></div><div class="group"><label>Số lượng đề xuất (${h(o.unit)})</label><input id="pQty" type="number" step="0.01" min="0.01" max="${o.qty}" value="${r?.qty??o.qty}" required></div><div class="group wide"><label>Lý do đề xuất <span class="req">*</span></label><textarea id="pReason" required placeholder="Giải thích chi tiết căn cứ đề xuất phương án này...">${h(r?.reason||'')}</textarea></div></div><div id="proposalCalc" class="insight" style="margin-top:12px"></div>${unsafe?'<div class="insight" style="margin-top:12px">Hàng không an toàn không được phép giảm giá bán lẻ.</div>':''}<div id="proposalError" class="error"></div></div><div class="modal-foot"><button type="button" class="btn" data-action="back" data-id="${o.id}">Quay lại</button><button class="btn primary" type="submit">Lưu & đồng bộ sang khu vực</button></div></form>`,true);
  toggleProposalFields();
  updateProposalPreview(o);
}

function decisionModal(id){
  const o=db.observations.find(x=>x.id===id),r=latestReq(o);
  if(!o||me().role!=='area'||!allowed(o)||!r||!['pending','blocked'].includes(r.status))return;
  const p=prod(o.productId);
  const orig=(p?.price||0)*r.qty;
  const rec=calcRecoveryForReq(o,r);
  modal(`<div class="modal-head"><div><h2>Quyết định của Quản lý khu vực</h2><p>${h(o.id)} · ${h(p.name)} · ${h(store(o.storeId).name)}</p></div><button class="x" data-action="close">×</button></div><form id="decisionForm" data-id="${o.id}"><div class="modal-body"><div class="insight" style="margin-bottom:15px"><strong>Đề xuất của Cửa hàng trưởng:</strong> ${h(actionText(r))}, số lượng ${fmt(r.qty)} ${h(r.unit)} (Giá trị gốc: ${fmtMoney(orig)} · Thu hồi dự kiến: ${fmtMoney(rec)}). Hệ thống sẽ ghi nhận ngày duyệt và đẩy đơn lên đầu danh sách.</div><div class="group"><label>Quyết định</label><select id="dType"><option value="approved">Phê duyệt đúng đề xuất</option><option value="rejected">Từ chối</option><option value="needs_info">Yêu cầu Cửa hàng trưởng bổ sung</option></select></div><div class="group" style="margin-top:15px"><label>Ghi chú / lý do</label><textarea id="dNote" placeholder="Bắt buộc khi từ chối hoặc yêu cầu bổ sung."></textarea></div><div id="decisionError" class="error"></div></div><div class="modal-foot"><button type="button" class="btn" data-action="back" data-id="${o.id}">Quay lại</button><button class="btn primary" type="submit">Lưu quyết định</button></div></form>`,true);
}

function executeModal(id,blocked=false){
  const o=db.observations.find(x=>x.id===id),r=latestReq(o);
  if(!o||me().role!=='employee'||o.storeId!==me().storeId||r?.status!=='approved')return;
  modal(`<div class="modal-head"><div><h2>${blocked?'Báo không thể thực hiện':'Xác nhận đã xử lý'}</h2><p>${h(o.id)} · ${h(prod(o.productId).name)}</p></div><button class="x" data-action="close">×</button></div><form id="executionForm" data-id="${o.id}" data-blocked="${blocked?'yes':'no'}"><div class="modal-body"><div class="insight" style="margin-bottom:17px"><strong>Quyết định được duyệt:</strong> ${h(actionText(r))} · ${fmt(r.qty)} ${h(r.unit)}. ${r.action==='markdown'?'Chỉ dán nhãn giảm giá sau khi được duyệt.':r.action==='disposal'?'Ghi nhận số lượng đã hủy thực tế, không mặc định bằng số lượng duyệt.':'Ghi nhận số lượng đã xử lý thực tế.'}</div>${!blocked?`<div class="group"><label>Số lượng thực tế đã xử lý (${h(r.unit)}) <span class="req">*</span></label><input type="number" min="0.01" max="${r.qty}" step="0.01" id="actualQty" required placeholder="Nhập số lượng thực tế"></div>`:''}<div class="group" style="margin-top:15px"><label>${blocked?'Lý do không thực hiện được *':'Ghi chú kết quả (bắt buộc nếu số lượng chênh lệch)'}</label><textarea id="exNote" placeholder="${blocked?'Mô tả trở ngại cần quản lý xem xét':'Ví dụ: Đã dán tem vào các gói hàng và chuyển sang quầy giảm giá'}"></textarea></div><div id="executionError" class="error"></div></div><div class="modal-foot"><button type="button" class="btn" data-action="back" data-id="${o.id}">Quay lại</button><button class="btn ${blocked?'danger':'primary'}" type="submit">${blocked?'Gửi báo cáo không thực hiện được':'Lưu kết quả thực tế'}</button></div></form>`,true);
}

function addPhotoModal(id){
  let o=db.observations.find(x=>x.id===id);
  if(!o||me().role!=='employee'||o.storeId!==me().storeId)return;
  modal(`<div class="modal-head"><div><h2>Bổ sung ảnh minh chứng</h2><p>${h(o.id)} · ${h(prod(o.productId).name)} · Hiện có ${o.photos.length} ảnh</p></div><button class="x" data-action="close">×</button></div><div class="modal-body"><label class="upload"><span style="font-size:26px">📷</span><strong>Chọn thêm ảnh hiện trường (Không giới hạn số lượng)</strong><span style="font-size:11.5px">Tự động nén nhẹ & đóng dấu thời gian/mã cửa hàng</span><input type="file" id="extraPhoto" accept="image/*" capture="environment" multiple></label><div id="photoToolbar"></div><div class="photogrid" id="extraGallery"></div><div id="photoError" class="error"></div></div><div class="modal-foot"><button class="btn" data-action="back" data-id="${o.id}">Quay lại</button><button class="btn primary" data-action="save-photo" data-id="${o.id}">Lưu ảnh bổ sung</button></div>`,true);
  state.photoBuffer=[];
}

function renameModal(){
  modal(`<div class="modal-head"><div><h2>Đổi tên tài khoản</h2><p>Đổi tên hiển thị khi đăng nhập và trong lịch sử</p></div><button class="x" data-action="close">×</button></div><form id="renameForm"><div class="modal-body"><div class="group"><label>Tên hiển thị</label><input id="newName" maxlength="60" required value="${h(me().name)}"></div><div class="small-info" style="margin-top:9px">Vai trò và cửa hàng được phân công không thay đổi.</div><div id="renameError" class="error"></div></div><div class="modal-foot"><button type="button" class="btn" data-action="close">Hủy</button><button type="submit" class="btn primary">Lưu tên hiển thị</button></div></form>`,true);
}

function previewPhotos(){
  let el=$('#photoGallery')||$('#extraGallery');
  let bar=$('#photoToolbar');
  if(bar){
    bar.innerHTML=state.photoBuffer.length
      ?`<div class="photo-toolbar"><span>Đã chuẩn bị <b>${state.photoBuffer.length} ảnh</b> (đã nén & đóng dấu thời gian)</span><button type="button" class="btn small ghost" data-action="clear-buffer">Xóa tất cả</button></div>`
      :'';
  }
  if(!el)return;
  el.innerHTML=state.photoBuffer.map((src,i)=>`<div class="photoitem"><img src="${h(src)}" alt="Ảnh tải lên ${i+1}"><button type="button" aria-label="Xóa ảnh" data-remove="${i}">×</button></div>`).join('');
}

// Nén ảnh tối ưu (~150-220KB) + Tự động đóng dấu ngày giờ thực, mã cửa hàng & tên sản phẩm
function compressAndWatermarkFile(file,meta={}){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith('image/'))return reject(new Error('Chỉ chấp nhận tệp hình ảnh.'));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Không đọc được tệp ảnh.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Không thể xử lý tệp ảnh.'));
      img.onload=()=>{
        const maxDim=1280;
        const scale=Math.min(1,maxDim/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*scale));
        const hgt=Math.max(1,Math.round(img.height*scale));
        const c=document.createElement('canvas');
        c.width=w;
        c.height=hgt;
        const ctx=c.getContext('2d');
        ctx.drawImage(img,0,0,w,hgt);

        // Đóng dấu xác thực tự động góc dưới bên trái
        const stampText=`W-FreshTrack · ${meta.storeCode||'WM'} · ${displayTime(clock())}${meta.productName?' · '+meta.productName:''}`;
        const fontSize=Math.max(13,Math.round(w*0.019));
        ctx.font=`600 ${fontSize}px Arial, sans-serif`;
        const padX=Math.round(fontSize*0.75);
        const boxH=Math.round(fontSize*1.85);
        const boxW=Math.min(w-20,Math.round(ctx.measureText(stampText).width+padX*2));
        ctx.fillStyle='rgba(15, 23, 42, 0.68)';
        ctx.fillRect(10,hgt-boxH-10,boxW,boxH);
        ctx.fillStyle='#ffffff';
        ctx.fillText(stampText,10+padX,hgt-10-Math.round(fontSize*0.52),w-24);

        let out=c.toDataURL('image/webp',0.76);
        if(!out.startsWith('data:image/webp'))out=c.toDataURL('image/jpeg',0.76);
        resolve(out);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoFiles(input){
  const files=[...input.files];
  if(!files.length)return;
  const st=store(me().storeId);
  const prId=$('#product')?.value||(state.followId?incident(state.followId)?.productId:null);
  const prName=prId?prod(prId)?.name:'';
  const bar=$('#photoToolbar');
  let added=0;
  for(let idx=0;idx<files.length;idx++){
    const file=files[idx];
    if(bar)bar.innerHTML=`<div class="photo-toolbar"><span>⏳ Đang nén & đóng dấu ảnh <b>${idx+1}/${files.length}</b>...</span></div>`;
    try{
      if(file.size>35*1024*1024){
        toast(`Ảnh "${file.name}" vượt quá 35 MB, đã bỏ qua.`);
        continue;
      }
      const compressed=await compressAndWatermarkFile(file,{storeCode:st.code,productName:prName});
      state.photoBuffer.push(compressed);
      added++;
      previewPhotos();
    }catch(e){
      toast(e.message);
    }
  }
  input.value='';
  if(added)toast(`Đã thêm ${added} ảnh (tổng ${state.photoBuffer.length} ảnh sẵn sàng lưu).`);
}

async function persistPhotoBuffer(){
  const ids=[];
  for(const dataUrl of state.photoBuffer){
    const id='IMG-'+(db.seq.media++)+'-'+Date.now().toString(36);
    await putMediaToDB(id,dataUrl);
    ids.push(id);
  }
  return ids;
}

async function submitReport(){
  if(me().role!=='employee')return;
  const id=state.followId,root=id?incident(id):null;
  const productId=root?.productId||$('#product').value;
  const quantity=Number($('#qty').value);
  const condition=$('#condition').value;
  const conditionDetail=condition==='Khác'?($('#conditionOther')?.value||'').trim():'';
  const description=$('#desc').value.trim();
  if(!productId||!Number.isFinite(quantity)||quantity<=0||!condition||!description){
    formError('formError','Vui lòng nhập sản phẩm, số lượng dương, tình trạng và mô tả.');
    return;
  }
  if(condition==='Khác'&&!conditionDetail){
    formError('formError','Vui lòng mô tả ngắn gọn tình trạng khác.');
    return;
  }
  if(root&&(root.storeId!==me().storeId)){
    formError('formError','Vụ việc không thuộc cửa hàng đã chọn.');
    return;
  }
  if(root){
    let active=db.requests.some(r=>r.incidentId===root.id&&['draft','pending','approved','needs_info','blocked'].includes(r.status));
    if(active){
      formError('formError','Vụ việc còn yêu cầu xử lý chưa hoàn tất, chưa thể mở đợt mới.');
      return;
    }
  }
  const photoIds=await persistPhotoBuffer();
  let i=root||{id:'FF-'+String(db.seq.inc++).padStart(4,'0'),storeId:me().storeId,productId,createdBy:me().id,createdAt:clock()};
  if(!root)db.incidents.push(i);
  let o={
    id:'R-'+String(db.seq.obs++).padStart(4,'0'),
    incidentId:i.id,
    storeId:i.storeId,
    productId,
    qty:quantity,
    unit:prod(productId).unit,
    condition,
    conditionDetail,
    description,
    createdBy:me().id,
    createdAt:clock(),
    photos:photoIds,
    batchId:null
  };
  db.observations.push(o);
  log(i,o,root?'Nhân viên ghi nhận diễn biến tiếp theo (cùng vụ việc)':'Nhân viên báo cáo tình trạng hàng hóa ('+photoIds.length+' ảnh)');
  save();
  state.followId=null;
  state.photoBuffer=[];
  notifyPage('reports',{message:'Đã lưu báo cáo '+o.id+' kèm '+photoIds.length+' ảnh minh chứng.'});
}

function saveProposal(){
  const id=$('#proposalForm').dataset.id,o=db.observations.find(x=>x.id===id),old=latestReq(o);
  const action=$('#pAction').value;
  const discount=action==='markdown'?Number($('#pDiscount').value):null;
  const customAction=action==='custom'?($('#pCustomName')?.value||'').trim():null;
  const recoveryPct=action==='custom'?Math.max(0,Math.min(100,Number($('#pCustomRecovery')?.value||0))):null;
  const qty=Number($('#pQty').value);
  const reason=$('#pReason').value.trim();

  if(me().role!=='manager'||o.storeId!==me().storeId||!o.photos.length||(old&&!['draft','pending','needs_info'].includes(old.status)))return;
  if(!['markdown','disposal','custom'].includes(action)){formError('proposalError','Vui lòng chọn phương án xử lý.');return}
  if(action==='markdown'&&![30,50].includes(discount)){formError('proposalError','Chọn mức giảm giá 30% hoặc 50%.');return}
  if(action==='custom'&&!customAction){formError('proposalError','Vui lòng nhập tên phương án đề xuất.');return}
  if(['Không an toàn để bán','Có dấu hiệu hư hỏng'].includes(o.condition)&&action==='markdown'){formError('proposalError','Hàng không an toàn không được giảm giá bán lẻ.');return}
  if(!Number.isFinite(qty)||qty<=0||qty>o.qty||!reason){formError('proposalError','Nhập số lượng hợp lệ (không quá lượng báo cáo) và ghi rõ lý do.');return}

  let b=batchOf(o);
  if(!b){
    const obsDay=dateVN(new Date(o.createdAt));
    b=db.batches.find(x=>x.storeId===o.storeId&&x.date===obsDay)||createBatch(o.storeId,obsDay,[o],true);
    o.batchId=b.id;
  }
  let r=old&&['draft','pending','needs_info'].includes(old.status)?old:null;
  if(r){
    r.action=action;r.discount=discount;r.customAction=customAction;r.recoveryPct=recoveryPct;
    r.qty=qty;r.reason=reason;r.status='pending';r.updatedAt=clock();
  }else{
    r={
      id:'TR-'+String(db.seq.req++).padStart(3,'0'),
      observationId:o.id,
      incidentId:o.incidentId,
      batchId:b.id,
      action,
      discount,
      customAction,
      recoveryPct,
      qty,
      unit:o.unit,
      reason,
      createdBy:me().id,
      createdAt:clock(),
      status:'pending',
      submittedAt:clock()
    };
    db.requests.push(r);
  }
  log(incident(o.incidentId),o,old?.status==='needs_info'?'Cửa hàng trưởng gửi bổ sung thông tin đề xuất':'Cửa hàng trưởng lập & đồng bộ đề xuất '+actionText(r)+' · '+fmt(qty)+' '+r.unit);
  save();render();detail(o.id);
  toast('Đã lưu & đồng bộ đề xuất sang Quản lý khu vực.');
}

function sendBatch(id){
  let b=db.batches.find(x=>x.id===id);
  if(!b||me().role!=='manager'||b.storeId!==me().storeId||b.status!=='awaiting')return;
  let obs=bObs(b);
  let rs=obs.map(latestReq);
  if(!obs.length||rs.some((r,i)=>!r||!obs[i].photos.length)){
    toast('Chưa thể chốt đợt: tất cả báo cáo cần có ảnh và đề xuất của Cửa hàng trưởng.');
    return;
  }
  if(!confirm(`Xác nhận chốt hoàn tất đợt tổng hợp ngày ${displayDay(b.date)} (${rs.length} báo cáo)?`))return;
  for(const r of rs){
    if(r.status==='draft'){r.status='pending';r.submittedAt=clock()}
    let o=db.observations.find(x=>x.id===r.observationId);
    log(incident(o.incidentId),o,'Xác nhận hoàn tất đợt tổng hợp '+b.id);
  }
  b.status='sent';b.sentAt=clock();b.sentBy=me().id;
  save();render();
  toast('Đã chốt hoàn tất đợt tổng hợp '+b.id+'.');
}

function submitDecision(){
  const id=$('#decisionForm').dataset.id,o=db.observations.find(x=>x.id===id),r=latestReq(o),type=$('#dType').value,note=$('#dNote').value.trim();
  if(me().role!=='area'||!allowed(o)||!r||!['pending','blocked'].includes(r.status))return;
  if(!['approved','rejected','needs_info'].includes(type))return;
  if(type!=='approved'&&!note){formError('decisionError','Từ chối hoặc yêu cầu bổ sung phải có lý do.');return}
  r.status=type;
  r.decidedBy=me().id;
  r.decidedAt=clock();
  r.decisionNote=note;
  log(incident(o.incidentId),o,`${me().name}: ${type==='approved'?'phê duyệt '+actionText(r):type==='rejected'?'từ chối đề xuất':'yêu cầu bổ sung thông tin'}${note?' · '+note:''}`);
  save();render();detail(id);
  toast(type==='approved'?'Đã duyệt & ghi nhận ngày duyệt. Đơn đã được đẩy lên đầu danh sách.':type==='rejected'?'Đã từ chối và lưu lý do.':'Đã chuyển về Cửa hàng trưởng để bổ sung.');
}

function submitExecution(){
  const form=$('#executionForm'),id=form.dataset.id,blocked=form.dataset.blocked==='yes',o=db.observations.find(x=>x.id===id),r=latestReq(o),note=$('#exNote').value.trim();
  if(me().role!=='employee'||o.storeId!==me().storeId||r?.status!=='approved')return;
  if(blocked){
    if(!note){formError('executionError','Cần ghi rõ vì sao không thể thực hiện.');return}
    r.status='blocked';r.executionNote=note;
    log(incident(o.incidentId),o,'Nhân viên báo không thể thực hiện: '+note);
  }else{
    const qty=Number($('#actualQty').value);
    if(!$('#actualQty').value||!Number.isFinite(qty)||qty<=0||qty>r.qty){formError('executionError','Số lượng thực tế phải lớn hơn 0 và không vượt số lượng đã được duyệt.');return}
    if(qty<r.qty&&!note){formError('executionError','Khi số lượng thực tế ít hơn số lượng được duyệt, cần ghi rõ lý do.');return}
    r.status='completed';r.actualQty=qty;r.executedAt=clock();r.executionNote=note;
    log(incident(o.incidentId),o,'Nhân viên hoàn tất '+actionText(r)+': '+fmt(qty)+' '+r.unit);
  }
  save();render();detail(id);
  toast(blocked?'Đã báo trở ngại lên quản lý để xem xét lại.':'Đã lưu số lượng thực tế và hoàn tất xử lý.');
}

async function savePhoto(id){
  let o=db.observations.find(x=>x.id===id);
  if(!o||me().role!=='employee'||o.storeId!==me().storeId||!state.photoBuffer.length){
    formError('photoError','Vui lòng chọn ít nhất một ảnh.');
    return;
  }
  const newIds=await persistPhotoBuffer();
  o.photos.push(...newIds);
  log(incident(o.incidentId),o,'Nhân viên bổ sung '+newIds.length+' ảnh minh chứng (tổng '+o.photos.length+' ảnh)');
  state.photoBuffer=[];
  save();render();detail(o.id);
  toast(`Đã bổ sung ${newIds.length} ảnh (tổng ${o.photos.length} ảnh cho báo cáo).`);
}

async function resetAll(){
  if(!confirm('Xóa toàn bộ dữ liệu chỉnh sửa của bản demo và khôi phục dữ liệu giả lập ban đầu?'))return;
  try{localStorage.removeItem(KEY)}catch(e){}
  await clearMediaDB();
  for(const u of USERS){u.name=DEFAULT_NAMES[u.id]}
  user('m1').storeId='st1';
  db=seed();save();
  redirectHome('Đã khôi phục dữ liệu demo v0.8.');
}
const DEFAULT_NAMES=Object.fromEntries(USERS.map(u=>[u.id,u.name]));

function renderLogin(){
  document.body.dataset.mode='login';
  document.body.dataset.role='manager';
  $('#side').innerHTML='';
  $('#top').innerHTML='';
  const savedMgr=db?.managerSession||{name:'Trần Minh Phúc',storeId:'st1'};
  $('#app').innerHTML=`<div class="login-wrap">
    <div class="login-top-bar">
      <div class="login-brand"><div class="mark">W</div><div><strong>W-FreshTrack</strong><span>FRESH GOODS · GOOD MOOD</span></div></div>
      <button class="btn soft" data-action="guideline">📘 Hướng dẫn vận hành hệ thống</button>
    </div>
    <div class="login-intro"><div class="eyebrow">Cổng quản lý hàng tươi</div><h1>Đăng nhập hệ thống</h1><p>Chọn không gian làm việc theo vai trò của bạn.</p></div>
    <div class="login-grid">
      <section class="login-card manager-login">
        <div class="login-symbol">▦</div>
        <div class="eyebrow">QUẢN LÝ CỬA HÀNG</div>
        <h2>Cửa hàng trưởng</h2>
        <p>Kiểm tra báo cáo, tổng hợp cuối ngày, đề xuất xử lý và giám sát kết quả.</p>
        <label for="managerStore">Chi nhánh WinMart</label>
        <select id="managerStore" class="switch">${STORES.map(st=>`<option value="${st.id}" ${savedMgr.storeId===st.id?'selected':''}>${h(st.code)} · ${h(st.name)}</option>`).join('')}</select>
        <label for="managerNameInput">Tên Cửa hàng trưởng</label>
        <input type="text" id="managerNameInput" class="login-input" maxlength="60" value="${h(savedMgr.name||'Trần Minh Phúc')}" placeholder="Nhập họ tên của bạn...">
        <label for="managerPass">Mật khẩu đăng nhập</label>
        <input type="password" id="managerPass" class="login-input" value="123456" placeholder="Nhập mật khẩu (Demo: 123456)">
        <small class="small-info">Mật khẩu demo mặc định: <b>123456</b></small>
        <div id="managerLoginError" class="error"></div>
        <button class="btn primary login-button" data-action="login-manager">Đăng nhập cửa hàng →</button>
      </section>
      <section class="login-card area-login">
        <div class="login-symbol">✓</div>
        <div class="eyebrow">QUẢN LÝ KHU VỰC</div>
        <h2>Quản lý khu vực</h2>
        <p>Xem báo cáo đa chi nhánh và phê duyệt đề xuất xử lý hàng tươi.</p>
        <label>Phạm vi phụ trách</label>
        <div class="account-display">TP.HCM · Khu vực 01 (${STORES.length} chi nhánh)</div>
        <label for="areaNameInput">Tên Quản lý khu vực</label>
        <input type="text" id="areaNameInput" class="login-input" maxlength="60" value="${h(user('a1').name)}" placeholder="Nhập họ tên...">
        <label for="areaPass">Mật khẩu đăng nhập</label>
        <input type="password" id="areaPass" class="login-input" value="123456" placeholder="Nhập mật khẩu (Demo: 123456)">
        <small class="small-info">Mật khẩu demo mặc định: <b>123456</b></small>
        <div id="areaLoginError" class="error"></div>
        <button class="btn primary login-button" data-action="login-area">Đăng nhập khu vực →</button>
      </section>
    </div>
    <div class="phone-entry">
      <div><b>Kênh ghi nhận trên điện thoại (Nhân viên cửa hàng)</b><p>Nhân viên chụp ảnh không giới hạn, gửi tình trạng hàng và xác nhận xử lý. Không cần mật khẩu quản lý.</p></div>
      <button class="btn" data-action="phone-open">Mở giao diện điện thoại →</button>
    </div>
  </div>`;
}

function renderPhone(){
  document.body.dataset.mode='phone';
  document.body.dataset.role='employee';
  let u=me();
  if(!['new','reports'].includes(state.page))state.page='new';
  $('#side').innerHTML='';
  $('#top').innerHTML=`<div class="phone-title"><div class="mark">W</div><div><b>W-FreshTrack Di động</b><div class="small-info">Kênh ghi nhận · Không cần đăng nhập</div></div></div><div class="actions"><button class="btn small soft" data-action="guideline">📘 Hướng dẫn</button><button class="btn small" data-action="logout">Về cổng web</button></div>`;
  $('#app').innerHTML=`<div class="phone-controls"><label for="phoneStore">Chi nhánh WinMart ghi nhận</label><select id="phoneStore" class="switch">${STORES.map(st=>`<option value="${st.id}" ${st.id===u.storeId?'selected':''}>${h(st.code)} · ${h(st.name)}</option>`).join('')}</select><div class="phone-tabs">${NAV.employee.map(([id,title])=>`<a class="btn ${state.page===id?'primary':''}" href="${routeUrl(u.role,id)}" data-nav="${id}">${title}</a>`).join('')}</div></div>${state.page==='new'?reportForm():reports()}`;
  if(state.page==='new')previewPhotos();
}

function render(){
  const u=me();
  if(!u){renderLogin();return}
  if(u.role==='employee'){renderPhone();return}
  document.body.dataset.mode='web';
  document.body.dataset.role=u.role;
  if(!NAV[u.role].some(([id])=>id===state.page))state.page='dashboard';
  $('#side').innerHTML=`<div class="brand"><div class="mark">W</div><div><strong>W-FreshTrack</strong><small>FRESH GOODS · GOOD MOOD</small></div></div><div class="side-lbl">Danh mục chức năng</div>${NAV[u.role].map(([id,title,ico])=>`<a class="navlink ${state.page===id?'active':''}" href="${routeUrl(u.role,id)}" data-nav="${id}" ${state.page===id?'aria-current="page"':''}><span class="navico">${ico}</span><span>${h(title)}</span></a>`).join('')}<div class="side-bottom"><div><b>${h(ROLENAME[u.role])}</b></div><div>${h(u.role==='area'?'TP.HCM · Khu vực 01':store(u.storeId).name)}</div><button class="reset" data-action="guideline">📘 Hướng dẫn sử dụng</button><button class="reset" data-action="rename">✎ Đổi tên hiển thị</button><button class="reset" data-action="reset">↺ Khôi phục dữ liệu demo</button><button class="reset" data-action="logout">← Đăng xuất</button></div>`;
  $('#top').innerHTML=`<div style="display:flex;align-items:center;gap:11px"><button class="hamburger" data-action="menu" aria-label="Mở menu">☰</button><div class="breadcrumb">W-FreshTrack <span style="padding:0 8px">/</span><b>${h(heading())}</b></div></div><div class="top-right"><button class="btn small soft" data-action="guideline">📘 Hướng dẫn</button><div class="account-info"><b>${h(u.name)}</b><div class="small-info">${h(ROLENAME[u.role])}</div></div><div class="avatar">${h(u.name.split(/\s+/).slice(-2).map(v=>v[0]).join(''))}</div><button class="btn small" data-action="logout">Đăng xuất</button></div>`;
  let content=state.page==='dashboard'?dashboard():state.page==='reports'?reports():state.page==='daily'?daily():state.page==='proposals'?proposals():state.page==='approvals'?approvals():dashboard();
  $('#app').innerHTML=content;
}

function enterPhone(storeId='st1'){
  let u=USERS.find(x=>x.role==='employee'&&x.storeId===storeId)||USERS.find(x=>x.role==='employee');
  if(!u)return;
  state.userId=u.id;
  notifyPage('new');
}
function logout(){redirectHome()}

function loginManager(){
  const storeId=$('#managerStore')?.value||'st1';
  const name=($('#managerNameInput')?.value||'').trim();
  const pass=($('#managerPass')?.value||'').trim();
  if(name.length<2){formError('managerLoginError','Vui lòng nhập tên Cửa hàng trưởng (tối thiểu 2 ký tự).');return}
  if(pass.length<4){formError('managerLoginError','Vui lòng nhập mật khẩu (mặc định demo: 123456).');return}
  const m=user('m1');
  m.name=name;
  m.storeId=storeId;
  db.managerSession={name,storeId};
  db.profileNames??={};
  db.profileNames.m1=name;
  save();
  state.userId='m1';
  notifyPage('dashboard',{message:`Xin chào ${name} · ${store(storeId).name}`});
}

function loginArea(){
  const name=($('#areaNameInput')?.value||'').trim();
  const pass=($('#areaPass')?.value||'').trim();
  if(name.length<2){formError('areaLoginError','Vui lòng nhập tên Quản lý khu vực.');return}
  if(pass.length<4){formError('areaLoginError','Vui lòng nhập mật khẩu (mặc định demo: 123456).');return}
  const a=user('a1');
  a.name=name;
  db.profileNames??={};
  db.profileNames.a1=name;
  save();
  state.userId='a1';
  notifyPage('dashboard',{message:`Xin chào ${name} · Quản lý khu vực 01`});
}

function exportPDF(obs,title){
  if(!me()||!['manager','area'].includes(me().role))return;
  obs=obs.filter(allowed);
  if(!obs.length){toast('Không có báo cáo phù hợp để xuất PDF.');return}
  const W=1240,H=1754,M=70,accent=me().role==='area'?'#9e7114':'#b92338',pages=[];let canvas,ctx,y;
  const txt=(v,x,yy,size=23,color='#263040',weight=400)=>{ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.fillStyle=color;ctx.fillText(String(v??'—'),x,yy)};
  const wrap=(v,max,size=22,weight=400)=>{ctx.font=`${weight} ${size}px Arial, sans-serif`;let lines=[];for(let part of String(v??'—').split('\n')){let line='';for(let word of part.split(/\s+/)){while(ctx.measureText(word).width>max){let k=1;while(k<word.length&&ctx.measureText(word.slice(0,k+1)).width<=max)k++;if(line){lines.push(line);line=''}lines.push(word.slice(0,k));word=word.slice(k)}let test=line?line+' '+word:word;if(ctx.measureText(test).width>max&&line){lines.push(line);line=word}else line=test}lines.push(line)}return lines};
  const line=(v,x,yy,max,size=22,weight=400,color='#263040')=>{let a=wrap(v,max,size,weight);a.forEach((t,i)=>txt(t,x,yy+i*(size+8),size,color,weight));return a.length*(size+8)};
  const rect=(x,yy,w,hh,color)=>{ctx.fillStyle=color;ctx.fillRect(x,yy,w,hh)};
  function finish(){rect(M,H-87,W-2*M,2,'#e0e3e8');txt('W-FreshTrack v0.8',M,H-48,18,'#77808e');txt('Trang '+(pages.length+1),W-M-110,H-48,18,'#77808e');pages.push(canvas.toDataURL('image/jpeg',.89))}
  function page(){if(canvas)finish();canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');rect(0,0,W,H,'#ffffff');rect(0,0,W,15,accent);txt('W-FreshTrack',M,72,29,accent,700);txt(title.toUpperCase(),M,135,32,'#263040',700);let ids=[...new Set(obs.map(o=>o.storeId))];let scope=ids.length===1?store(ids[0]).name:'Khu vực 01 · '+ids.length+' cửa hàng';let a=line(scope,M,176,W-2*M,23,700);let b=line('Người xuất: '+me().name+' · '+ROLENAME[me().role],M,176+a,W-2*M,21);let c=line('Ngày xuất: '+displayTime(clock())+'  |  '+obs.length+' báo cáo',M,176+a+b,W-2*M,20,400,'#667080');y=176+a+b+c+17;rect(M,y,W-2*M,2,'#e0e3e8');y+=40}
  page();
  let summary='Tổng số lượng: '+unitsSummary(obs)+'  |  Tổng giá trị gốc: '+fmtMoney(totalValue(obs))+'  |  Thu hồi dự kiến: '+fmtMoney(expectedRecovery(obs));
  y+=line(summary,M,y,W-2*M,22,700,accent)+24;
  for(let [i,o] of obs.entries()){
    let r=latestReq(o),b=batchOf(o),p=prod(o.productId);
    let orig=itemValue(o);
    let rec=calcRecoveryForReq(o,r);
    let fields=[
      ['Cửa hàng',store(o.storeId).name],
      ['Ghi nhận',displayTime(o.createdAt)],
      ['Số lượng / Giá trị',qtyText(o)+' · Đơn giá '+fmtMoney(p.price)+'/'+o.unit+' · Giá trị gốc '+fmtMoney(orig)],
      ['Tình trạng',o.condition+(o.conditionDetail?' ('+o.conditionDetail+')':'')],
      ['Mô tả',o.description],
      ['Đề xuất',r?actionText(r)+' · '+fmt(r.qty)+' '+r.unit+' · Thu hồi dự kiến '+fmtMoney(rec)+' · '+(r.reason||''):'Chưa có đề xuất'],
      ['Phê duyệt',r?.decidedAt?(user(r.decidedBy)?.name||'—')+' · '+displayTime(r.decidedAt)+' · '+(r.decisionNote||statusName[r.status]):'Chưa có quyết định'],
      ['Kết quả',r?.status==='completed'?fmt(r.actualQty)+' '+r.unit+' · '+(r.executionNote||'Đã hoàn tất'):statusName[statusOf(o)]],
      ['Minh chứng / Đợt',o.photos.length+' ảnh · '+(b?b.id+' / '+displayDay(b.date):'Chưa chốt ngày')]
    ];
    if(y+150>H-115)page();
    rect(M,y-28,W-2*M,48,'#f1f3f5');
    txt((i+1)+'. '+p.name+'  |  '+o.id+'  |  '+o.incidentId,M+13,y+4,25,accent,700);
    y+=53;
    for(let [k,v] of fields){let rows=wrap(v,W-2*M-280,21);for(let j=0;j<rows.length;j++){if(y+35>H-115){page();txt(o.id+' · '+p.name+' (tiếp theo)',M,y,24,accent,700);y+=39}if(j===0)txt(k,M+12,y,20,'#637083',700);txt(rows[j],M+280,y,21);y+=29}y+=9}
    rect(M,y,W-2*M,1,'#e0e3e8');
    y+=48;
  }
  finish();
  const enc=new TextEncoder(),parts=[],offsets=[0];let size=0;
  function add(v){let data=typeof v==='string'?enc.encode(v):v;parts.push(data);size+=data.length}
  function obj(n,body,stream){offsets[n]=size;add(n+' 0 obj\n'+body);if(stream){add('\nstream\n');add(stream);add('\nendstream')}add('\nendobj\n')}
  add('%PDF-1.4\n%WFT\n');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  pages.forEach((p,i)=>{let n=3+i*3,raw=Uint8Array.from(atob(p.split(',')[1]),c=>c.charCodeAt(0)),commands=enc.encode('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q\n');obj(n,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(n+1)+' 0 R >> >> /Contents '+(n+2)+' 0 R >>');obj(n+1,'<< /Type /XObject /Subtype /Image /Width '+W+' /Height '+H+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+raw.length+' >>',raw);obj(n+2,'<< /Length '+commands.length+' >>',commands)});
  let xref=size;
  add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
  for(let n=1;n<offsets.length;n++)add(String(offsets[n]).padStart(10,'0')+' 00000 n \n');
  add('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  let url=URL.createObjectURL(new Blob(parts,{type:'application/pdf'})),a=document.createElement('a');
  a.href=url;a.download='W-FreshTrack_'+(me().role==='manager'?store(me().storeId).code:'Khu-vuc-01')+'_'+dateVN()+'_'+(obs.length===1?obs[0].id:'bao-cao')+'.pdf';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  toast('Đã tạo PDF · '+obs.length+' báo cáo · '+pages.length+' trang.');
}

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-nav],[data-action],[data-detail],[data-batch],[data-remove]');
  if(!el){if(e.target.matches('[data-backdrop]'))close();return}
  if(el.hasAttribute('data-nav')){
    if(el.tagName==='A'&&(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey))return;
    e.preventDefault();notifyPage(el.dataset.nav);return;
  }
  if(el.hasAttribute('data-detail')){detail(el.dataset.detail);return}
  if(el.hasAttribute('data-batch')){state.selectedBatch=el.dataset.batch;render();return}
  if(el.hasAttribute('data-remove')){state.photoBuffer.splice(Number(el.dataset.remove),1);previewPhotos();return}
  let id=el.dataset.id;
  switch(el.dataset.action){
    case'login-manager':loginManager();break;
    case'login-area':loginArea();break;
    case'phone-open':enterPhone(db?.managerSession?.storeId||'st1');break;
    case'logout':logout();break;
    case'guideline':guidelineModal();break;
    case'clear-date':state.reportDate='';render();break;
    case'clear-buffer':state.photoBuffer=[];previewPhotos();break;
    case'export-batch':{let b=scopedBatches().find(x=>x.id===id);if(b)exportPDF(bObs(b),'Tổng hợp cuối ngày '+displayDay(b.date));break}
    case'menu':$('#side').classList.toggle('visible');$('#mask').classList.toggle('visible');break;
    case'close':close();break;
    case'back':detail(id);break;
    case'reset':resetAll();break;
    case'rename':renameModal();break;
    case'open-proposals':notifyPage('proposals',{batch:id});break;
    case'open-area-batch':notifyPage('daily',{batch:id});break;
    case'send-batch':sendBatch(id);break;
    case'propose':proposalModal(id);break;
    case'decision':decisionModal(id);break;
    case'execute':executeModal(id);break;
    case'blocked':executeModal(id,true);break;
    case'add-photo':addPhotoModal(id);break;
    case'save-photo':savePhoto(id);break;
    case'follow':notifyPage('new',{follow:id});break;
  }
});

$('#mask').addEventListener('click',()=>{$('#side').classList.remove('visible');$('#mask').classList.remove('visible')});

document.addEventListener('change',async e=>{
  let x=e.target;
  if(x.id==='phoneStore')enterPhone(x.value);
  if(x.id==='areaBatch'){state.selectedBatch=x.value;render()}
  if(x.id==='reportBatch'&&me()?.role==='manager'){state.reportBatch=x.value;state.reportDate='';render()}
  if(x.id==='reportDatePicker'){state.reportDate=x.value;render()}
  if(x.id==='product'){let u=$('#unit');if(u)u.value=prod(x.value)?.unit||'Chọn sản phẩm trước'}
  if(x.id==='condition'){
    const grp=$('#conditionOtherGroup');
    if(grp)grp.style.display=x.value==='Khác'?'flex':'none';
  }
  if(x.id==='pAction'){toggleProposalFields();const id=$('#proposalForm')?.dataset.id;if(id)updateProposalPreview(db.observations.find(o=>o.id===id))}
  if(x.id==='pDiscount'){const id=$('#proposalForm')?.dataset.id;if(id)updateProposalPreview(db.observations.find(o=>o.id===id))}
  if(x.id==='photoInput'||x.id==='extraPhoto')await handlePhotoFiles(x);
  if(x.id==='statusfilter'){state.filter=x.value;render()}
  if(x.id==='storefilter'){state.store=x.value;render()}
});

document.addEventListener('input',e=>{
  if(e.target.id==='search'){
    let pos=e.target.selectionStart;
    state.search=e.target.value;
    render();
    let x=$('#search');x?.focus();x?.setSelectionRange(pos,pos);
  }
  if(e.target.id==='reportDateText'){
    const formatted=formatVnDateTyping(e.target.value);
    e.target.value=formatted;
    if(formatted===''){
      state.reportDate='';
      render();
    }else if(formatted.length===10){
      const iso=vnDateToIso(formatted);
      if(iso){
        state.reportDate=iso;
        render();
        const el=$('#reportDateText');el?.focus();el?.setSelectionRange(10,10);
      }else{
        toast('Ngày không hợp lệ. Vui lòng nhập đúng định dạng dd/mm/yyyy.');
      }
    }
  }
  if(e.target.id==='pQty'||e.target.id==='pCustomRecovery'){
    const id=$('#proposalForm')?.dataset.id;
    if(id)updateProposalPreview(db.observations.find(o=>o.id===id));
  }
});

document.addEventListener('submit',async e=>{
  const form=e.target;
  if(!['reportForm','proposalForm','decisionForm','executionForm','renameForm'].includes(form.id))return;
  e.preventDefault();
  if(form.id==='reportForm')await submitReport();
  if(form.id==='proposalForm')saveProposal();
  if(form.id==='decisionForm')submitDecision();
  if(form.id==='executionForm')submitExecution();
  if(form.id==='renameForm'){
    const name=$('#newName').value.trim();
    if(name.length<2){formError('renameError','Nhập tên tối thiểu 2 ký tự.');return}
    me().name=name;
    db.profileNames??={};
    db.profileNames[me().id]=name;
    if(me().id==='m1'){db.managerSession??={};db.managerSession.name=name}
    save();close();render();
    toast('Đã đổi tên hiển thị thành '+name);
  }
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){close();$('#side').classList.remove('visible');$('#mask').classList.remove('visible')}
  if((e.key==='Enter'||e.key===' ')&&e.target.hasAttribute('data-detail')){e.preventDefault();detail(e.target.dataset.detail)}
  if((e.key==='Enter'||e.key===' ')&&e.target.hasAttribute('data-batch')){e.preventDefault();state.selectedBatch=e.target.dataset.batch;render()}
});

async function boot(){
  db=load();
  applyPersistedProfiles();
  await loadAllMediaFromDB();
  autoBatch();save();
  const role=document.body.dataset.routeRole,page=document.body.dataset.routePage;
  const query=new URLSearchParams(window.location.search);
  if(role==='login'){
    sessionWrite(SESSION_KEY,null);state.userId=null;
  }else if(role==='employee'){
    const stored=user(sessionRead(SESSION_KEY));
    const defaultEmp=USERS.find(u=>u.role==='employee'&&u.storeId===(db.managerSession?.storeId||'st1'))||USERS.find(u=>u.role==='employee');
    state.userId=stored?.role==='employee'?stored.id:defaultEmp.id;
    state.page=page;sessionWrite(SESSION_KEY,state.userId);
  }else{
    const stored=user(sessionRead(SESSION_KEY));
    if(!stored||stored.role!==role||!ROUTES[role]?.[page]){window.location.replace(basePath()+'index.html');return}
    state.userId=stored.id;state.page=page;
  }
  const batch=query.get('batch');
  if(me()&&batch&&scopedBatches().some(b=>b.id===batch))state.selectedBatch=batch;
  const follow=query.get('follow');
  if(role==='employee'&&page==='new'&&follow&&incident(follow)?.storeId===me().storeId)state.followId=follow;
  render();
  const notice=sessionRead(NOTICE_KEY);if(notice){sessionWrite(NOTICE_KEY,null);toast(notice)}
}
boot();

setInterval(()=>{if(!me())return;const n=db.batches.length;autoBatch();if(db.batches.length!==n)render()},60000);
window.addEventListener('storage',e=>{
  if(e.key===KEY){
    db=load();
    applyPersistedProfiles();
    if(state.page!=='new')render();
  }
});
window.addEventListener('pageshow',e=>{if(e.persisted)window.location.reload()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&me()){const n=db.batches.length;autoBatch();if(db.batches.length!==n)render()}});
