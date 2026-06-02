"use client";

import { useState, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { useApp, Order, OrderItem } from '../../context/AppContext';
import InvoiceTemplate, { InvoiceData, InvoiceDateGroup } from '../../components/InvoiceTemplate';

// ─────────────────────────────────────────
const SHIPPING_NAME = '일괄 택배비';
const SHIPPING_PRICE = 4000;
const DAY = ['일','월','화','수','목','금','토'];

// 날짜 파싱 (한국어 포맷 or ISO 둘 다 지원)
const parseDate = (s: string): Date | null => {
  if (!s) return null;
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// 타임존 안전 날짜 키 (YYYY-M-D)
const getDateKey = (s: string): string => {
  const d = parseDate(s);
  if (!d) return s;
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
};

const fmtDate = (s: string): string => {
  const d = parseDate(s);
  if (!d) return s;
  return `${d.getMonth()+1}/${d.getDate()}(${DAY[d.getDay()]})`;
};

const toIso = (d: Date) => d.toISOString().split('T')[0];
const safeId = (s: string) => s.replace(/[^a-zA-Z0-9가-힣]/g,'_');

// ─────────────────────────────────────────
interface MItem { productName: string; price: number; quantity: number; purchasePrice?: number; isConsignment?: boolean; }

interface DateGroup {
  dateKey: string;       // YYYY-M-D
  displayDate: string;   // M/D(요일)
  orders: Order[];
  productItems: MItem[];
  subtotal: number;
  isPaid: boolean;
}

interface CustomerGroup {
  userId: string;
  orders: Order[];
  dateGroups: DateGroup[];
  productTotal: number;
  hasShipping: boolean;
  displayTotal: number;   // productTotal + (hasShipping ? 4000 : 0)
  allPaid: boolean;
  anyPaid: boolean;
}

type SortMode = 'none' | 'asc' | 'desc';

// ─────────────────────────────────────────
export default function OrderManagementTab() {
  const {
    products, orders, users,
    markOrderPaid, updateOrder, deleteOrder,
    markOrdersAsExported, addBulkShippingFee,
    updateOrderShippingAddress, archiveOrdersByIds, refreshOrders,
  } = useApp();

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [filterUnpaid,          setFilterUnpaid]          = useState(false);
  const [filterOnlyPreparing,   setFilterOnlyPreparing]   = useState(false);
  const [filterOnlyNotExported, setFilterOnlyNotExported] = useState(true);
  const [showArchived,          setShowArchived]           = useState(false);
  const [downloadFilter,        setDownloadFilter]         = useState<'all'|'paid'>('all');
  const [searchQuery,           setSearchQuery]            = useState('');
  const [sortMode,              setSortMode]               = useState<SortMode>('none');

  // UI
  const [isDownloading,   setIsDownloading]   = useState(false);
  const [sendingAlimtalk, setSendingAlimtalk] = useState<string|null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [expandedDates,     setExpandedDates]     = useState<Set<string>>(new Set());

  // Modals
  const [shippingModalUserId, setShippingModalUserId] = useState<string|null>(null);
  const [editState, setEditState] = useState<{dateKey:string;userId:string;items:MItem[];orderIds:string[]}|null>(null);

  // Bulk alimtalk
  const [isBulkModalOpen,     setIsBulkModalOpen]     = useState(false);
  const [bulkTargets,         setBulkTargets]         = useState<{userId:string;orders:Order[];totalPrice:number}[]>([]);
  const [bulkSelection,       setBulkSelection]       = useState<Record<string,boolean>>({});
  const [bulkProgress,        setBulkProgress]        = useState<{current:number;total:number;successes:number;fails:number}|null>(null);
  const [isBulkSending,       setIsBulkSending]       = useState(false);

  // ─── Quick date ───
  const setQuick = (p:'today'|'last3'|'thisWeek'|'all') => {
    const t=new Date(); t.setHours(0,0,0,0);
    if(p==='today'){setDateFrom(toIso(t));setDateTo(toIso(t));}
    else if(p==='last3'){const f=new Date(t);f.setDate(f.getDate()-2);setDateFrom(toIso(f));setDateTo(toIso(t));}
    else if(p==='thisWeek'){const f=new Date(t);f.setDate(f.getDate()+(f.getDay()===0?-6:1-f.getDay()));setDateFrom(toIso(f));setDateTo(toIso(t));}
    else{setDateFrom('');setDateTo('');}
  };

  // ─── Filtering ───
  const activeOrders = showArchived ? orders : orders.filter(o=>!o.isArchived);

  const filteredOrders = useMemo(()=>{
    let r=[...activeOrders];
    if(dateFrom||dateTo) r=r.filter(o=>{
      const d=parseDate(o.createdAt||'');
      if(!d) return true;
      if(dateFrom&&d<new Date(dateFrom)) return false;
      if(dateTo){const to=new Date(dateTo);to.setDate(to.getDate()+1);if(d>=to)return false;}
      return true;
    });
    if(filterUnpaid) r=r.filter(o=>!o.isPaid);
    if(searchQuery) r=r.filter(o=>{
      const u=users.find(u=>u.phone===o.userId||u.nickname===o.userId);
      const q=searchQuery.toLowerCase();
      return u?.name?.toLowerCase().includes(q)||u?.nickname?.toLowerCase().includes(q)||u?.phone?.includes(q);
    });
    return r;
  },[activeOrders,dateFrom,dateTo,filterUnpaid,searchQuery,users]);

  // ─── Customer groups ───
  const customerGroups = useMemo(():CustomerGroup[]=>{
    const map=new Map<string,Order[]>();
    for(const o of filteredOrders) map.set(o.userId,[...(map.get(o.userId)||[]),o]);

    let groups: CustomerGroup[] = [...map.entries()].map(([userId,cos])=>{
      // 날짜별 그룹 (타임존 안전 키 사용)
      const dateMap=new Map<string,Order[]>();
      for(const o of cos){
        const dk=getDateKey(o.createdAt||'');
        dateMap.set(dk,[...(dateMap.get(dk)||[]),o]);
      }
      const sortedKeys=[...dateMap.keys()].sort((a,b)=>{
        const [ay,am,ad]=a.split('-').map(Number);
        const [by,bm,bd]=b.split('-').map(Number);
        return new Date(ay,am-1,ad).getTime()-new Date(by,bm-1,bd).getTime();
      });

      const dateGroups:DateGroup[]=sortedKeys.map(dk=>{
        const dayOrders=dateMap.get(dk)!;
        const iMap=new Map<string,MItem>();
        for(const o of dayOrders) for(const i of o.items){
          if(i.productName===SHIPPING_NAME) continue;
          const ex=iMap.get(i.productName);
          if(ex) ex.quantity+=i.quantity; else iMap.set(i.productName,{...i});
        }
        const productItems=[...iMap.values()];
        const subtotal=productItems.reduce((s,i)=>s+i.price*i.quantity,0);
        return{dateKey:dk,displayDate:fmtDate(dayOrders[0].createdAt||''),orders:dayOrders,productItems,subtotal,isPaid:dayOrders.every(o=>o.isPaid)};
      });

      const productTotal=cos.reduce((s,o)=>s+o.items.filter(i=>i.productName!==SHIPPING_NAME).reduce((is,i)=>is+i.price*i.quantity,0),0);
      const hasShipping=cos.some(o=>o.items.some(i=>i.productName===SHIPPING_NAME));
      const displayTotal=productTotal+(hasShipping?SHIPPING_PRICE:0);
      return{userId,orders:cos,dateGroups,productTotal,hasShipping,displayTotal,allPaid:cos.every(o=>o.isPaid),anyPaid:cos.some(o=>o.isPaid)};
    });

    // 정렬
    if(sortMode==='asc')  groups=groups.sort((a,b)=>a.displayTotal-b.displayTotal);
    if(sortMode==='desc') groups=groups.sort((a,b)=>b.displayTotal-a.displayTotal);

    return groups;
  },[filteredOrders,sortMode]);

  // ─── Statistics: 택배비 제외 (상품 금액만 집계) ───
  const totalOrders=filteredOrders.length;
  const totalRevenue=customerGroups.reduce((s,g)=>s+g.productTotal,0);      // 택배비 제외
  const paidGroups=customerGroups.filter(g=>g.allPaid);
  const paidTotal=paidGroups.reduce((s,g)=>s+g.productTotal,0);             // 택배비 제외
  const unpaidGroups=customerGroups.filter(g=>!g.allPaid);
  const unpaidTotal=unpaidGroups.reduce((s,g)=>s+g.productTotal,0);         // 택배비 제외
  const paidRate=totalRevenue>0?((paidTotal/totalRevenue)*100).toFixed(1):'0.0';

  // 순이익 = 입금액 - 입금된 주문의 원가만 (미입금은 0)
  let paidCost=0;
  filteredOrders.filter(o=>o.isPaid).forEach(o=>o.items.forEach(i=>{
    if(i.productName===SHIPPING_NAME) return;
    let c=i.purchasePrice; if(!c){const p=products.find(p=>p.name===i.productName);c=p?.purchasePrice||0;} paidCost+=c*i.quantity;
  }));
  const totalProfit=paidTotal-paidCost;

  const periodStr=dateFrom&&dateTo?`${dateFrom}~${dateTo}`:dateFrom||dateTo||new Date().toISOString().slice(0,10);

  // ─── Toggles ───
  const toggleCustomer=useCallback((uid:string)=>{
    setExpandedCustomers(p=>{const n=new Set(p);n.has(uid)?n.delete(uid):n.add(uid);return n;});
  },[]);
  const toggleDate=useCallback((uid:string,dk:string)=>{
    const k=`${uid}__${dk}`;
    setExpandedDates(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n;});
  },[]);

  // ─── Invoice builder ───
  const buildInvoice=(g:CustomerGroup):InvoiceData=>{
    const user=users.find(u=>u.phone===g.userId||u.nickname===g.userId);
    const dgs:InvoiceDateGroup[]=g.dateGroups.map(dg=>({
      date:dg.displayDate,
      items:dg.productItems.map(i=>({name:i.productName,quantity:i.quantity,price:i.price})),
      subtotal:dg.subtotal,
    }));
    if(g.hasShipping&&dgs.length>0){
      const last=dgs[dgs.length-1];
      last.items.push({name:SHIPPING_NAME,quantity:1,price:SHIPPING_PRICE});
      last.subtotal+=SHIPPING_PRICE;
    }
    const period=g.dateGroups.length===1?g.dateGroups[0].displayDate:
      `${g.dateGroups[0].displayDate} ~ ${g.dateGroups[g.dateGroups.length-1].displayDate}`;
    return{
      customerName:user?.name||'미등록',customerPhone:user?.phone,customerNickname:user?.nickname,
      address:g.orders[0]?.shippingAddress||user?.address||'',
      date:period,items:[],totalPrice:g.displayTotal,
      bankName:'새마을금고',accountNumber:'010-6269-9612',accountHolder:'보라몰(인다민)',
      isPaid:g.allPaid,dateGroups:dgs,
    };
  };
  const buildUrl=(uid:string)=>{
    const p=new URLSearchParams({userId:uid});
    if(dateFrom)p.set('from',dateFrom);if(dateTo)p.set('to',dateTo);
    return `boramall.vercel.app/invoice/merged?${p}`;
  };

  // ─── Handlers ───
  const handleReset=async()=>{
    if(!filteredOrders.length){alert('초기화할 주문이 없습니다.');return;}
    if(!confirm(`현재 조회된 ${filteredOrders.length}건을 모두 아카이브하시겠습니까?`))return;
    await archiveOrdersByIds(filteredOrders.map(o=>o.id));
    await refreshOrders();
    alert('아카이브 완료!');
  };

  // 택배비: 있으면 제거, 없으면 추가 (토글)
  const handleToggleShipping=(g:CustomerGroup)=>{
    if(g.hasShipping){
      // 직접수령으로: 모든 주문에서 택배비 제거
      g.orders.forEach(o=>{
        if(o.items.some(i=>i.productName===SHIPPING_NAME))
          updateOrder(o.id,o.items.filter(i=>i.productName!==SHIPPING_NAME));
      });
    } else {
      // 배송으로: 첫 번째 주문에 1회 추가
      const first=[...g.orders].sort((a,b)=>a.id.localeCompare(b.id))[0];
      addBulkShippingFee([first.id]);
    }
  };

  // 모든 고객에게 택배비 일괄 추가 (미청구 고객만)
  const handleBulkShippingAll = () => {
    const without = customerGroups.filter(g => !g.hasShipping);
    if (!without.length) { alert('모든 고객에게 이미 택배비가 청구되어 있습니다.'); return; }
    if (!confirm(`택배비 미청구 고객 ${without.length}명에게 일괄 택배비 4,000원을 추가하시겠습니까?`)) return;
    without.forEach(g => {
      const first = [...g.orders].sort((a,b) => a.id.localeCompare(b.id))[0];
      addBulkShippingFee([first.id]);
    });
    alert(`${without.length}명에게 택배비가 추가되었습니다.`);
  };

  const openDateEdit=(g:CustomerGroup,dg:DateGroup)=>{
    setEditState({dateKey:dg.dateKey,userId:g.userId,items:dg.productItems.map(i=>({...i})),orderIds:dg.orders.map(o=>o.id)});
  };

  const handleSaveEdit=async()=>{
    if(!editState)return;
    const[firstId,...rest]=editState.orderIds;
    await updateOrder(firstId,editState.items as OrderItem[]);
    for(const id of rest){
      const o=orders.find(o=>o.id===id);
      if(o){const ship=o.items.filter(i=>i.productName===SHIPPING_NAME);
        if(ship.length) await updateOrder(id,ship as OrderItem[]); else await deleteOrder(id);}
    }
    setEditState(null);
  };

  const updateEditQty=(idx:number,d:number)=>{
    if(!editState)return;
    const items=[...editState.items];const item=items[idx];const nq=item.quantity+d;
    if(nq<=0){if(!confirm(`${item.productName}을(를) 삭제하시겠습니까?`))return;items.splice(idx,1);}
    else items[idx]={...item,quantity:nq};
    setEditState({...editState,items});
  };

  const handleDeleteDate=(dg:DateGroup)=>{
    if(!confirm(`${dg.displayDate} 날짜 주문 ${dg.orders.length}건을 삭제하시겠습니까?`))return;
    dg.orders.forEach(o=>deleteOrder(o.id));
  };

  const handleMarkAllPaid=(os:Order[],paid:boolean)=>os.filter(o=>o.isPaid!==paid).forEach(o=>markOrderPaid(o.id,paid));
  const handleMarkDatePaid=(os:Order[],paid:boolean)=>os.filter(o=>o.isPaid!==paid).forEach(o=>markOrderPaid(o.id,paid));

  const handleAlimtalk=async(g:CustomerGroup)=>{
    const user=users.find(u=>u.phone===g.userId||u.nickname===g.userId);
    const phone=user?.phone||'';
    if(!phone){alert('전화번호 없음');return;}
    if(!confirm(`${user?.name} 님께 합산 알림톡 발송?\n합계 ${g.displayTotal.toLocaleString()}원`))return;
    setSendingAlimtalk(g.userId);
    try{
      const r=await fetch('/api/alimtalk',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId:g.orders[0].id,name:user?.name||'고객',phone,totalPrice:g.displayTotal,invoiceUrl:buildUrl(g.userId)})});
      const d=await r.json();alert(d.success?'알림톡 발송 성공!':'발송 실패: '+d.error);
    }catch{alert('발송 중 오류');}
    finally{setSendingAlimtalk(null);}
  };

  const handleBulkDownload=async()=>{
    const list=downloadFilter==='paid'?customerGroups.filter(g=>g.anyPaid):customerGroups;
    if(!list.length){alert('다운로드할 주문이 없습니다.');return;}
    setIsDownloading(true);
    try{
      const zip=new JSZip();const{toPng}=await import('html-to-image');const folder=zip.folder('Invoices');
      await new Promise(r=>setTimeout(r,600));window.scrollTo(0,0);let cnt=0;
      for(const g of list){
        const user=users.find(u=>u.phone===g.userId||u.nickname===g.userId);
        const el=document.getElementById(`inv-${safeId(g.userId)}`);
        if(el){
          const url=await toPng(el,{cacheBust:true,pixelRatio:2,backgroundColor:'#ffffff',width:672,height:el.scrollHeight});
          folder?.file(`${user?.name||g.userId}_${periodStr}_합산청구서.png`,url.split(',')[1],{base64:true});cnt++;
        }
      }
      saveAs(await zip.generateAsync({type:'blob'}),`보라몰_합산청구서_${periodStr}.zip`);
      alert(`${cnt}명 다운로드 완료!`);
    }catch(e){console.error(e);alert('다운로드 중 오류');}
    finally{setIsDownloading(false);}
  };

  const handleLotteExcel=()=>{
    const exp=filteredOrders
      .filter(o=>o.isPaid)
      .filter(o=>filterOnlyPreparing?(!o.deliveryStatus||o.deliveryStatus==='배송준비중'):true)
      .filter(o=>filterOnlyNotExported?!o.isExportedToExcel:true)
      .filter(o=>o.items.some(i=>!i.isConsignment));
    if(!exp.length){alert('다운로드할 배송건이 없습니다.');return;}
    if(!confirm(`총 ${exp.length}건 엑셀 다운로드`))return;
    const headers=['주문번호','보내는사람(지정)','전화번호1(지정)','전화번호2(지정)','우편번호(지정)','주소(지정)','받는사람','전화번호1','전화번호2','우편번호','주소','상품명1','상품상세1','수량(A타입)','배송메시지','운임구분','운임','운송장번호'];
    let n=1;
    const rows=exp.map(o=>{
      const u=users.find(u=>u.phone===o.userId||u.nickname===o.userId);
      const items=o.items.filter(i=>!i.isConsignment&&i.productName!==SHIPPING_NAME);
      let pn=items[0]?.productName||'';if(items.length>1)pn+=` 외 ${items.length-1}건`;
      const addr=(o.shippingAddress||u?.address||'').replace(/^\[.*?\]\s*/,'').trim();
      return[n++,'보라몰','','','','',u?.name||'',u?.phone||'','','',addr,pn,'',1,'','',''];
    });
    const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'롯데택배_발송목록');
    saveAs(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`롯데택배_${periodStr}.xlsx`);
    markOrdersAsExported(exp.map(o=>o.id));
  };

  const openBulkModal=()=>{
    const base=downloadFilter==='paid'?filteredOrders.filter(o=>o.isPaid):filteredOrders;
    if(!base.length){alert('발송 대상이 없습니다.');return;}
    const map=new Map<string,Order[]>();
    base.forEach(o=>map.set(o.userId,[...(map.get(o.userId)||[]),o]));
    const targets:{userId:string;orders:Order[];totalPrice:number}[]=[];
    map.forEach((os,uid)=>targets.push({userId:uid,orders:os,totalPrice:customerGroups.find(g=>g.userId===uid)?.displayTotal||0}));
    setBulkTargets(targets);
    const sel:Record<string,boolean>={};targets.forEach(t=>{sel[t.userId]=true;});setBulkSelection(sel);
    setIsBulkModalOpen(true);setBulkProgress(null);
  };

  const handleBulkSend=async()=>{
    const sel=bulkTargets.filter(t=>bulkSelection[t.userId]);
    if(!sel.length){alert('대상 선택');return;}
    if(!confirm(`${sel.length}명에게 발송하시겠습니까?`))return;
    setIsBulkSending(true);setBulkProgress({current:0,total:sel.length,successes:0,fails:0});
    let succ=0,fail=0;
    for(let i=0;i<sel.length;i++){
      const{userId,orders:os,totalPrice}=sel[i];
      const user=users.find(u=>u.phone===userId||u.nickname===userId);
      const phone=user?.phone||'';
      if(!phone){fail++;}else{
        try{
          const r=await fetch('/api/alimtalk',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({orderId:os[0].id,name:user?.name||'고객',phone,totalPrice,invoiceUrl:buildUrl(userId)})});
          (await r.json()).success?succ++:fail++;
        }catch{fail++;}
      }
      setBulkProgress({current:i+1,total:sel.length,successes:succ,fails:fail});
      await new Promise(r=>setTimeout(r,300));
    }
    setIsBulkSending(false);alert(`완료! 성공:${succ} 실패:${fail}`);
  };

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {label:`조회 매출 (${totalOrders}건 / ${customerGroups.length}명)`,val:totalRevenue,color:'border-[#673ab7]',tc:'text-[#673ab7]'},
          {label:'입금 순이익 (추정)',val:totalProfit,color:'border-blue-400',tc:totalProfit>=0?'text-blue-600':'text-red-500'},
          {label:`입금 (${paidGroups.length}명 / ${paidRate}%)`,val:paidTotal,color:'border-green-400',tc:'text-green-600'},
          {label:`미입금 (${unpaidGroups.length}명)`,val:unpaidTotal,color:'border-yellow-400',tc:'text-yellow-600'},
        ].map(({label,val,color,tc})=>(
          <div key={label} className={`bg-white p-3 rounded-lg shadow-sm border-l-4 ${color}`}>
            <p className="text-gray-500 text-xs mb-1">{label}</p>
            <p className={`text-xl font-bold ${tc}`}>{val.toLocaleString()}원</p>
          </div>
        ))}
      </div>

      {/* 날짜 필터 */}
      <div className="bg-white p-3 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">📅 조회 기간</span>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#673ab7]"/>
            <span className="text-gray-400 font-bold">~</span>
            <input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#673ab7]"/>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['today','last3','thisWeek','all'] as const).map(k=>(
              <button key={k} onClick={()=>setQuick(k)}
                className="text-xs px-3 py-1.5 rounded-full border border-[#673ab7] text-[#673ab7] hover:bg-[#673ab7] hover:text-white transition-colors font-medium">
                {k==='today'?'오늘':k==='last3'?'최근 3일':k==='thisWeek'?'이번 주':'전체'}
              </button>
            ))}
          </div>
          {(dateFrom||dateTo)&&<span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold">{filteredOrders.length}건 / {customerGroups.length}명</span>}
        </div>
      </div>

      {/* 필터 & 액션 */}
      <div className="flex flex-col xl:flex-row justify-between xl:items-center bg-white p-3 rounded-lg shadow-sm gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {[
            {label:'미입금만',v:filterUnpaid,s:setFilterUnpaid},
            {label:'📦 보관함 포함',v:showArchived,s:setShowArchived},
            {label:'🚚 배송준비중만',v:filterOnlyPreparing,s:setFilterOnlyPreparing},
            {label:'🌟 미추출만',v:filterOnlyNotExported,s:setFilterOnlyNotExported},
          ].map(({label,v,s})=>(
            <label key={label} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={v} onChange={e=>s(e.target.checked)} className="w-4 h-4 accent-[#673ab7]"/>
              <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{label}</span>
            </label>
          ))}
          <div className="w-px h-4 bg-gray-300"/>
          <select value={downloadFilter} onChange={e=>setDownloadFilter(e.target.value as 'all'|'paid')}
            className="border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-700 bg-gray-50 outline-none">
            <option value="all">다운로드: 전체</option>
            <option value="paid">다운로드: ✅ 입금완료만</option>
          </select>
          {/* 금액 정렬 */}
          <button onClick={()=>setSortMode(m=>m==='none'?'desc':m==='desc'?'asc':'none')}
            className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-colors ${sortMode!=='none'?'bg-[#673ab7] text-white border-[#673ab7]':'border-gray-300 text-gray-600 hover:border-[#673ab7] hover:text-[#673ab7]'}`}>
            {sortMode==='desc'?'💰 금액 ↓ 내림차순':sortMode==='asc'?'💰 금액 ↑ 오름차순':'💰 금액 정렬'}
          </button>
          <input type="text" placeholder="🔍 이름·닉네임 검색" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-36 outline-none focus:ring-1 focus:ring-[#673ab7]"/>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <button onClick={handleBulkShippingAll} disabled={!customerGroups.length}
            className="bg-indigo-600 text-white px-3 py-2 rounded font-bold hover:bg-indigo-700 disabled:bg-gray-400 text-sm whitespace-nowrap">🚚 일괄 택배비 청구</button>
          <button onClick={handleReset} disabled={!filteredOrders.length}
            className="bg-gray-700 text-white px-3 py-2 rounded font-bold hover:bg-gray-900 disabled:bg-gray-300 text-sm">🔄 초기화</button>
          <button onClick={handleLotteExcel} disabled={isDownloading||!filteredOrders.length}
            className="bg-[#da291c] text-white px-3 py-2 rounded font-bold hover:bg-[#b01c13] disabled:bg-gray-400 text-sm">📦 롯데택배 엑셀</button>
          <button onClick={openBulkModal} disabled={isDownloading||!filteredOrders.length}
            className="bg-yellow-400 text-yellow-900 px-3 py-2 rounded font-bold hover:bg-yellow-500 disabled:bg-gray-400 text-sm">💬 일괄 알림톡</button>
          <button onClick={handleBulkDownload} disabled={isDownloading||!customerGroups.length}
            className="bg-[#673ab7] text-white px-3 py-2 rounded font-bold hover:bg-[#5e35b1] disabled:bg-gray-400 text-sm">
            {isDownloading?'생성 중...':'📥 합산 청구서'}</button>
        </div>
      </div>

      {/* ── 고객 목록 (아코디언) ── */}
      {customerGroups.length===0?(
        <div className="bg-white rounded-lg shadow-sm p-16 text-center text-gray-400">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-lg font-medium">{(dateFrom||dateTo)?'선택 기간에 주문이 없습니다.':'날짜를 선택해 주세요.'}</p>
          {!dateFrom&&!dateTo&&<button onClick={()=>setQuick('all')} className="mt-2 text-[#673ab7] font-bold underline text-sm">전체 보기</button>}
        </div>
      ):(
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {customerGroups.map((g,gi)=>{
            const user=users.find(u=>u.phone===g.userId||u.nickname===g.userId);
            const expanded=expandedCustomers.has(g.userId);
            // 입금 상태에 따른 색상
            const rowBg  = g.allPaid ? 'bg-green-50 hover:bg-green-100' : 'bg-white hover:bg-gray-50';
            const borderL= g.allPaid ? 'border-l-green-400' : g.anyPaid ? 'border-l-yellow-400' : 'border-l-red-300';
            const statusStyle= g.allPaid ? 'text-green-700 bg-green-100' : g.anyPaid ? 'text-yellow-700 bg-yellow-100' : 'text-red-600 bg-red-50';
            const statusLabel= g.allPaid ? '✅ 입금완료' : g.anyPaid ? '⚠️ 일부' : '❌ 미입금';

            return (
              <div key={g.userId} className={`border-l-4 ${borderL} ${gi>0?'border-t border-gray-100':''}`}>

                {/* ── 고객 한 줄 (클릭하면 상세 펼침) ── */}
                <div
                  onClick={()=>toggleCustomer(g.userId)}
                  className={`flex flex-wrap items-center gap-2 px-4 py-3 cursor-pointer transition-colors ${rowBg}`}
                >
                  {/* 좌측: 고객 정보 */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 flex-1 min-w-0">
                    <span className="font-black text-gray-900 text-[15px] shrink-0">{user?.name||'미등록'}</span>
                    {user?.nickname&&<span className="text-gray-400 text-xs shrink-0">{user.nickname}</span>}
                    {user?.phone&&<span className="text-gray-500 text-xs shrink-0">📞 {user.phone}</span>}
                    {user?.address&&<span className="text-gray-400 text-xs truncate max-w-[160px] sm:max-w-xs">🏠 {user.address}</span>}
                  </div>

                  {/* 우측: 금액 + 상태 + 버튼 */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0" onClick={e=>e.stopPropagation()}>

                    {/* 금액: 항상 같은 높이 유지 (배송비 유무 관계없이) */}
                    <div className="text-right" style={{minWidth:'130px'}}>
                      <span className="font-black text-gray-900 text-lg font-mono leading-tight">{g.displayTotal.toLocaleString()}원</span>
                      {/* 항상 같은 높이 확보 — 배송비 없으면 투명 텍스트 */}
                      <span className={`block text-[10px] leading-none mt-0.5 ${g.hasShipping?'text-indigo-500':'text-transparent select-none'}`}>
                        배송비 포함
                      </span>
                    </div>

                    {/* 입금 체크박스 (클릭 한번으로 전체 입금/취소) */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none" title={g.allPaid?'클릭하면 입금 취소':'클릭하면 전체 입금 처리'}>
                      <input
                        type="checkbox"
                        checked={g.allPaid}
                        onChange={e=>handleMarkAllPaid(g.orders, e.target.checked)}
                        onClick={e=>e.stopPropagation()}
                        className="w-4 h-4 accent-green-500 cursor-pointer"
                      />
                      <span className={`text-xs font-bold whitespace-nowrap ${g.allPaid?'text-green-700':g.anyPaid?'text-yellow-700':'text-red-600'}`}>
                        {g.allPaid?'입금완료':g.anyPaid?'일부입금':'미입금'}
                      </span>
                    </label>

                    {/* 택배비 토글 — stopPropagation 직접 부착 */}
                    <button
                      onClick={e=>{e.stopPropagation();handleToggleShipping(g);}}
                      className={`text-xs font-bold px-2.5 py-1 rounded border transition-all whitespace-nowrap ${g.hasShipping?'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700':'bg-gray-100 text-gray-500 border-gray-300 hover:bg-indigo-100 hover:text-indigo-600 hover:border-indigo-300'}`}
                      title={g.hasShipping?'택배 배송 중 (클릭: 직접수령으로 변경)':'직접 수령 (클릭: 택배비 4,000원 추가)'}
                    >
                      {g.hasShipping?'🚚 택배배송':'🏪 직접수령'}
                    </button>

                    <button onClick={e=>{e.stopPropagation();handleAlimtalk(g);}} disabled={sendingAlimtalk===g.userId}
                      className="text-xs bg-yellow-100 text-yellow-800 font-bold px-2.5 py-1 rounded border border-yellow-200 hover:bg-yellow-200 disabled:opacity-50 whitespace-nowrap">
                      {sendingAlimtalk===g.userId?'발송중..':'💬 알림톡'}
                    </button>
                    <a href={`/invoice/merged?userId=${encodeURIComponent(g.userId)}${dateFrom?`&from=${dateFrom}`:''}${dateTo?`&to=${dateTo}`:''}`}
                      target="_blank" onClick={e=>e.stopPropagation()}
                      className="text-xs bg-[#673ab7] text-white font-bold px-2.5 py-1 rounded hover:bg-[#5e35b1] whitespace-nowrap">
                      📋 청구서
                    </a>

                    <span className="text-gray-400 text-xs pointer-events-none">{expanded?'▲':'▼'}</span>
                  </div>
                </div>

                {/* ── 상세 펼침: 날짜별 ── */}
                {expanded&&(
                  <div style={{backgroundColor:'#fef9c3', borderTop:'2px solid #fbbf24'}}>
                    {g.dateGroups.map(dg=>{
                      const dateExp=expandedDates.has(`${g.userId}__${dg.dateKey}`);
                      return(
                        <div key={dg.dateKey} style={{borderBottom:'1px solid #fcd34d'}}>

                          {/* 날짜 요약 행 */}
                          <button onClick={()=>toggleDate(g.userId,dg.dateKey)}
                            className="w-full flex items-center justify-between px-6 py-2.5 transition-colors text-left"
                            style={{backgroundColor: dg.isPaid ? '#bbf7d0' : 'transparent'}}>
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <span className="text-xs font-black px-2.5 py-0.5 rounded-full border shrink-0"
                                style={{color:'#5c2e91', backgroundColor:'#ede9fe', borderColor:'#a78bfa'}}>
                                {dg.displayDate}
                              </span>
                              <span className="text-xs font-semibold truncate" style={{color:'#1f2937'}}>
                                {dg.productItems.slice(0,3).map(i=>`${i.productName}×${i.quantity}`).join(' / ')}
                                {dg.productItems.length>3&&` 외 ${dg.productItems.length-3}개`}
                              </span>
                              {dg.isPaid&&<span className="text-xs text-green-700 shrink-0">✅</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="font-bold text-sm font-mono w-24 text-right" style={{color:'#111827'}}>{dg.subtotal.toLocaleString()}원</span>
                              <button
                                onClick={e=>{e.stopPropagation();handleMarkDatePaid(dg.orders,!dg.isPaid);}}
                                className={`text-xs px-2 py-0.5 rounded font-bold border ${dg.isPaid?'bg-white text-gray-600 border-gray-300 hover:bg-red-50 hover:text-red-500':'bg-white text-gray-700 border-gray-400 hover:border-green-500 hover:text-green-700'}`}>
                                {dg.isPaid?'취소':'입금'}
                              </button>
                              <span className="text-xs" style={{color:'#6b7280'}}>{dateExp?'▲':'▼'}</span>
                            </div>
                          </button>

                          {/* 날짜 상세 품목 */}
                          {dateExp&&(
                            <div className="px-6 pb-3 pt-2" style={{backgroundColor:'#fef08a', borderTop:'1px solid #fcd34d'}}>
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {dg.productItems.map((item,idx)=>(
                                  <span key={idx} className="inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm"
                                    style={{backgroundColor:'#ffffff', border:'1px solid #fbbf24', color:'#111827'}}>
                                    {item.productName}
                                    <span className="ml-1 font-black" style={{color:'#111827'}}>×{item.quantity}</span>
                                    <span className="ml-1.5 font-bold" style={{color:'#374151'}}>{(item.price*item.quantity).toLocaleString()}원</span>
                                  </span>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={()=>openDateEdit(g,dg)}
                                  className="text-xs bg-blue-50 text-blue-800 px-3 py-1.5 rounded border border-blue-300 hover:bg-blue-100 font-bold">✏️ 수정</button>
                                <button onClick={()=>{
                                  const a=prompt('배송 주소 변경:',dg.orders[0]?.shippingAddress||'');
                                  if(a!==null) dg.orders.forEach(o=>updateOrderShippingAddress(o.id,a));
                                }} className="text-xs bg-sky-50 text-sky-700 px-3 py-1.5 rounded border border-sky-300 hover:bg-sky-100 font-bold">🏠 배송지</button>
                                <button onClick={()=>handleDeleteDate(dg)}
                                  className="text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded border border-red-300 hover:bg-red-100 font-bold">🗑 삭제</button>
                                {dg.orders.length>1&&<span className="text-xs font-semibold self-center" style={{color:'#374151'}}>({dg.orders.length}건 합산)</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 택배비 (있을 때만) */}
                    {g.hasShipping&&(
                      <div className="px-6 py-2 flex items-center justify-between" style={{borderTop:'1px solid #fcd34d', backgroundColor:'#fef08a'}}>
                        <span className="text-xs font-bold" style={{color:'#3730a3'}}>📦 택배비 (1회) — 매출 미포함</span>
                        <span className="text-xs font-bold font-mono w-24 text-right" style={{color:'#3730a3'}}>{SHIPPING_PRICE.toLocaleString()}원</span>
                      </div>
                    )}
                  </div>
                )}


              </div>
            );
          })}
        </div>
      )}

      {/* 수정 모달 */}
      {editState&&(()=>{
        const g=customerGroups.find(g=>g.userId===editState.userId);
        const user=users.find(u=>u.phone===editState.userId||u.nickname===editState.userId);
        const dg=g?.dateGroups.find(d=>d.dateKey===editState.dateKey);
        const total=editState.items.reduce((s,i)=>s+i.price*i.quantity,0);
        return(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl max-w-lg w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-1">✏️ 주문 수정</h3>
              <p className="text-sm text-gray-500 mb-4">
                {user?.name} | {dg?.displayDate}
                {editState.orderIds.length>1&&<span className="text-xs text-purple-600 ml-1">({editState.orderIds.length}건 합산)</span>}
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {editState.items.map((item,idx)=>(
                  <div key={idx} className="flex justify-between items-center border border-gray-200 p-2.5 rounded-lg">
                    <div><p className="font-medium text-sm">{item.productName}</p><p className="text-xs text-gray-400">{item.price.toLocaleString()}원</p></div>
                    <div className="flex items-center gap-2">
                      <button onClick={()=>updateEditQty(idx,-1)} className="w-8 h-8 bg-gray-100 rounded-lg hover:bg-gray-200 font-bold text-lg">−</button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button onClick={()=>updateEditQty(idx,1)}  className="w-8 h-8 bg-gray-100 rounded-lg hover:bg-gray-200 font-bold text-lg">+</button>
                      <span className="text-xs text-gray-500 w-20 text-right">{(item.price*item.quantity).toLocaleString()}원</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mb-4"><span className="text-sm text-gray-500">합계</span><span className="font-black text-[#673ab7] text-lg">{total.toLocaleString()}원</span></div>
              <div className="flex justify-end gap-2">
                <button onClick={()=>setEditState(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
                <button onClick={handleSaveEdit} className="px-5 py-2 bg-[#673ab7] text-white rounded-lg font-bold hover:bg-[#5e35b1]">저장</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 일괄 알림톡 모달 */}
      {isBulkModalOpen&&(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <h3 className="text-xl font-bold mb-1">💬 일괄 알림톡</h3>
            <p className="text-sm text-purple-600 mb-4">고객 1명당 1회 · 선택: <span className="font-black text-gray-900">{Object.values(bulkSelection).filter(Boolean).length}명</span></p>
            <div className="flex-1 overflow-y-auto mb-4 border border-gray-200 rounded-lg bg-gray-50 min-h-[40vh]">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input type="checkbox" checked={bulkTargets.length>0&&Object.values(bulkSelection).every(Boolean)}
                        onChange={e=>{const s={...bulkSelection};bulkTargets.forEach(t=>{s[t.userId]=e.target.checked;});setBulkSelection(s);}}
                        className="w-4 h-4 accent-yellow-500"/>
                    </th>
                    <th className="p-2.5">고객</th><th className="p-2.5">연락처</th>
                    <th className="p-2.5 text-center">주문</th><th className="p-2.5 text-right">합계</th><th className="p-2.5 text-center">입금</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkTargets.map(({userId,orders:os,totalPrice})=>{
                    const user=users.find(u=>u.phone===userId||u.nickname===userId);
                    const allPaid=os.every(o=>o.isPaid);
                    return(
                      <tr key={userId} className="border-b last:border-0 hover:bg-white">
                        <td className="p-2.5 text-center"><input type="checkbox" checked={!!bulkSelection[userId]} onChange={e=>setBulkSelection({...bulkSelection,[userId]:e.target.checked})} className="w-4 h-4 accent-yellow-500 cursor-pointer"/></td>
                        <td className="p-2.5"><span className="font-bold">{user?.name||'미등록'}</span><span className="text-gray-400 text-xs ml-1">({user?.nickname})</span></td>
                        <td className="p-2.5 text-gray-600 text-xs">{user?.phone||'번호없음'}</td>
                        <td className="p-2.5 text-center"><span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full">{os.length}건</span></td>
                        <td className="p-2.5 text-right font-mono font-bold text-sm">{totalPrice.toLocaleString()}원</td>
                        <td className="p-2.5 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${allPaid?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{allPaid?'완료':'미입금'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {bulkProgress&&(
              <div className="mb-4">
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1.5">
                  <div className="bg-yellow-400 h-2 rounded-full transition-all" style={{width:`${(bulkProgress.current/bulkProgress.total)*100}%`}}/>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{bulkProgress.current}/{bulkProgress.total}명</span>
                  <span>성공 <span className="text-green-600 font-bold">{bulkProgress.successes}</span> | 실패 <span className="text-red-600 font-bold">{bulkProgress.fails}</span></span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={()=>setIsBulkModalOpen(false)} disabled={isBulkSending} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold">닫기</button>
              <button onClick={handleBulkSend} disabled={isBulkSending||!Object.values(bulkSelection).filter(Boolean).length}
                className="px-5 py-2 bg-yellow-400 text-yellow-900 rounded-lg font-bold hover:bg-yellow-500 disabled:opacity-50">
                {isBulkSending?'발송 중...':`✔ ${Object.values(bulkSelection).filter(Boolean).length}명 발송`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 숨김 렌더링 */}
      <div style={{position:'absolute',top:0,left:0,opacity:0,pointerEvents:'none',zIndex:-9999}}>
        {isDownloading&&customerGroups.map(g=>(
          <div key={g.userId} id={`inv-${safeId(g.userId)}`}>
            <InvoiceTemplate data={buildInvoice(g)} hideButtons={true} customId={`inv-cap-${safeId(g.userId)}`}/>
          </div>
        ))}
      </div>
    </div>
  );
}
