"use client";

import { useState, useMemo, useCallback } from 'react';
import { useApp, Order, User } from '../../context/AppContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList } from 'recharts';

export default function DashboardTab() {
  const { users, products, orders } = useApp();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'paid' | 'unpaid'>('paid');
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [activeChartMetrics, setActiveChartMetrics] = useState<string[]>(['revenue']);

  const toggleChartMetric = (metric: string) => {
      setActiveChartMetrics(prev => 
          prev.includes(metric) 
              ? prev.filter(m => m !== metric)
              : [...prev, metric]
      );
  };
  
  // Date Filtering State
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Modals for Top 50
  const [showVipModal, setShowVipModal] = useState(false);
  const [showFanModal, setShowFanModal] = useState(false);

  // Top 50 Drill-down and Sorting
  const [selectedBarForTop50, setSelectedBarForTop50] = useState<string | null>(null);
  const [top50SortBy, setTop50SortBy] = useState<'quantity' | 'profit'>('quantity');
  
  // Accordion State for Modal
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);

  const toggleOrderAccordion = (orderId: string) => {
      setExpandedOrders(prev => prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]);
  };

  // Global Search State
  const [globalSearch, setGlobalSearch] = useState('');



  // Helper to parse Korean date string "2026. 03. 31. 오전 10:15:30" safely
  const parseKoreanDate = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('.');
      if (parts.length >= 3) {
          const year = parseInt(parts[0].trim());
          const month = parseInt(parts[1].trim()) - 1;
          const day = parseInt(parts[2].trim());
          const d = new Date(year, month, day, 12, 0, 0); // Default to noon
          if (!isNaN(d.getTime())) return d;
      }
      const fallback = new Date(dateStr);
      return isNaN(fallback.getTime()) ? new Date() : fallback;
  };

  // Merge live DB orders (which now include both active and archived orders)
  const combinedArchives = useMemo(() => {
      const map: Record<string, Order[]> = {};
      
      orders.forEach(o => {
          const d = parseKoreanDate(o.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T12:00:00Z`;
          if (!map[key]) map[key] = [];
          if (!map[key].find(existing => existing.id === o.id)) {
              map[key].push(o);
          }
      });
      
      return Object.entries(map)
          .map(([date, ords]) => ({ date, orders: ords }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders]);

  const globalSearchResults = useMemo(() => {
      if (!globalSearch.trim()) return [];
      const term = globalSearch.replace(/-/g, '').toLowerCase();
      const results: { formattedDate: string; rawDate: string; order: Order; user?: User }[] = [];
      
      combinedArchives.forEach(archive => {
          const d = new Date(archive.date);
          const formattedDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          
          archive.orders.forEach(order => {
              const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
              const nameMatch = user?.name.toLowerCase().includes(term);
              const userPhoneClean = user?.phone?.replace(/-/g, '') || '';
              const orderPhoneClean = order.userId.replace(/-/g, '');
              const phoneMatch = userPhoneClean.includes(term) || orderPhoneClean.includes(term);
              const idMatch = order.id.toLowerCase().includes(term);
              const trackingMatch = order.trackingNumber?.toLowerCase().includes(term);
              
              if (nameMatch || phoneMatch || idMatch || trackingMatch) {
                  results.push({ formattedDate, rawDate: archive.date, order, user });
              }
          });
      });
      
      return results.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [combinedArchives, globalSearch, users]);

  // Helper: Format Week as N월 W주차 (e.g. 3월 1주차)
  const getMonthlyWeekNumber = (d: Date) => {
      const month = d.getMonth() + 1;
      const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      // Adjust logic so Monday is first day of week
      let dayOfWeek = firstDayOfMonth.getDay() - 1; 
      if (dayOfWeek === -1) dayOfWeek = 6;
      const dateDay = d.getDate();
      const weekNumber = Math.ceil((dateDay + dayOfWeek) / 7);
      return `${d.getFullYear()}년 ${month}월 ${weekNumber}주차`;
  };

  const filteredArchives = useMemo(() => {
      return combinedArchives.filter(archive => {
          if (!startDate && !endDate) return true;
          const d = new Date(archive.date);
          const time = d.getTime();
          
          let sTime = 0;
          if (startDate && startDate.length >= 8) {
              const sd = new Date(startDate);
              if (!isNaN(sd.getTime())) sTime = sd.getTime();
          }
          
          let eTime = Infinity;
          if (endDate && endDate.length >= 8) {
              const ed = new Date(endDate + "T23:59:59");
              if (!isNaN(ed.getTime())) eTime = ed.getTime();
          }
          
          return time >= sTime && time <= eTime;
      });
  }, [combinedArchives, startDate, endDate]);

  const groupedBuckets = useMemo(() => {
      const map: Record<string, Order[]> = {};
      filteredArchives.forEach(archive => {
          const d = new Date(archive.date);
          let dateKey = "";
          
          if (timeRange === 'daily') {
              const days = ['일', '월', '화', '수', '목', '금', '토'];
              const dayStr = days[d.getDay()];
              dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} (${dayStr})`;
          } else if (timeRange === 'weekly') {
              dateKey = getMonthlyWeekNumber(d);
          } else if (timeRange === 'monthly') {
              dateKey = `${d.getFullYear()}년 ${d.getMonth()+1}월`;
          } else if (timeRange === 'yearly') {
              dateKey = `${d.getFullYear()}년`;
          }
          
          if (!map[dateKey]) map[dateKey] = [];
          archive.orders.forEach(o => {
              if (!map[dateKey].find(existing => existing.id === o.id)) {
                  map[dateKey].push(o);
              }
          });
      });
      return Object.entries(map)
          .map(([date, orders]) => ({ date, orders }))
          .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredArchives, timeRange]);

  const calculateFinancials = useCallback((orders: Order[]) => {
      let revenue = 0;
      let cost = 0;
      let count = 0;
      
      let expectedRevenue = 0;
      let expectedCost = 0;
      
      orders.forEach(order => {
          let orderCost = 0;
          order.items.forEach(item => {
             let itemCost = item.purchasePrice;
             if (itemCost === undefined || itemCost === 0) {
                 const currentProduct = products.find(p => p.name === item.productName);
                 itemCost = currentProduct?.purchasePrice || 0;
             }
             orderCost += itemCost * item.quantity;
          });
          
          expectedRevenue += order.totalPrice;
          expectedCost += orderCost;
          
          if (order.isPaid) {
              revenue += order.totalPrice;
              cost += orderCost;
              count++;
          }
      });
      
      const profit = revenue - cost;
      const expectedProfit = expectedRevenue - expectedCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { revenue, cost, profit, expectedProfit, margin, count };
  }, [products]);

  const overallMetrics = useMemo(() => {
      let totalRevenue = 0;
      let totalProfit = 0;
      let totalExpectedProfit = 0;
      let totalSalesCount = 0;
      
      groupedBuckets.forEach(bucket => {
          const stats = calculateFinancials(bucket.orders);
          totalRevenue += stats.revenue;
          totalProfit += stats.profit;
          totalExpectedProfit += stats.expectedProfit;
          totalSalesCount += stats.count;
      });
      
      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      return { totalRevenue, totalProfit, totalExpectedProfit, totalSalesCount, avgMargin };
  }, [groupedBuckets, calculateFinancials]);

  const chartData = useMemo(() => {
      const baseData = [...groupedBuckets].reverse();
      
      let slicedBuckets = baseData;
      if (!startDate && !endDate) {
          if (timeRange === 'daily') slicedBuckets = baseData.slice(-14);
          else if (timeRange === 'weekly') slicedBuckets = baseData.slice(-12);
          else if (timeRange === 'monthly') slicedBuckets = baseData.slice(-12);
          else if (timeRange === 'yearly') slicedBuckets = baseData.slice(-5);
      }

      const mappedData = slicedBuckets.map((bucket) => {
          const stats = calculateFinancials(bucket.orders);
          let nameDisplay = bucket.date;
          if (timeRange === 'weekly') {
              nameDisplay = bucket.date.split('년 ')[1] || bucket.date;
          } else if (timeRange === 'monthly') {
              nameDisplay = bucket.date.split('년 ')[1] || bucket.date;
          } else if (timeRange === 'daily') {
              nameDisplay = bucket.date.substring(5);
          }

          return { 
              fullDate: bucket.date,
              name: nameDisplay, 
              revenue: stats.revenue > 0 ? stats.revenue : null,
              profit: stats.profit > 0 ? stats.profit : null,
              aov: stats.count > 0 ? Math.round(stats.revenue / stats.count) : null,
              marginRate: stats.revenue > 0 ? Number(((stats.profit / stats.revenue) * 100).toFixed(1)) : null
          };
      });

      // Calculate trends
      return mappedData.map((item, index) => {
          let prevRevenue = 0;
          let prevProfit = 0;
          
          if (index > 0) {
              prevRevenue = mappedData[index - 1].revenue || 0;
              prevProfit = mappedData[index - 1].profit || 0;
          } else {
             if (timeRange !== 'daily') {
                 if (baseData.length > slicedBuckets.length) {
                     const prevBucket = baseData[baseData.length - slicedBuckets.length - 1];
                     if (prevBucket) {
                         const prevStats = calculateFinancials(prevBucket.orders);
                         prevRevenue = prevStats.revenue;
                         prevProfit = prevStats.profit;
                     }
                 }
              } else {
                 const firstDate = new Date(item.fullDate.substring(0, 10)); // Safe parse
                 firstDate.setDate(firstDate.getDate() - 1);
                 const days = ['일', '월', '화', '수', '목', '금', '토'];
                 const prevDateStr = `${firstDate.getFullYear()}-${String(firstDate.getMonth()+1).padStart(2,'0')}-${String(firstDate.getDate()).padStart(2,'0')} (${days[firstDate.getDay()]})`;
                 const prevBucket = groupedBuckets.find(b => b.date === prevDateStr);
                 if (prevBucket) {
                     const prevStats = calculateFinancials(prevBucket.orders);
                     prevRevenue = prevStats.revenue;
                     prevProfit = prevStats.profit;
                 }
              }
          }
          
          const currentRev = item.revenue || 0;
          const currentProf = item.profit || 0;
          
          const revChange = prevRevenue > 0 || currentRev > 0 ? currentRev - prevRevenue : 0;
          const profChange = prevProfit > 0 || currentProf > 0 ? currentProf - prevProfit : 0;

          const revChangePercent = prevRevenue > 0 ? (revChange / prevRevenue) * 100 : (currentRev > 0 ? 100 : 0);
          const profChangePercent = prevProfit > 0 ? (profChange / prevProfit) * 100 : (currentProf > 0 ? 100 : 0);
          
          return {
              ...item,
              revenueChange: revChange,
              profitChange: profChange,
              revenueChangePercent: revChangePercent,
              profitChangePercent: profChangePercent
          };
      });
  }, [groupedBuckets, timeRange, calculateFinancials, startDate, endDate]);


  const customerInsights = useMemo(() => {
      const spendMap: Record<string, { totalSpend: number; frequency: number }> = {};
      groupedBuckets.forEach(bucket => {
          bucket.orders.filter(o => o.isPaid).forEach(order => {
              if (!spendMap[order.userId]) spendMap[order.userId] = { totalSpend: 0, frequency: 0 };
              spendMap[order.userId].totalSpend += order.totalPrice;
              spendMap[order.userId].frequency += 1;
          });
      });
      
      const vvip = Object.entries(spendMap).sort((a, b) => b[1].totalSpend - a[1].totalSpend).slice(0, 50);
      const fans = Object.entries(spendMap).sort((a, b) => b[1].frequency - a[1].frequency).slice(0, 50);
      return { vvip, fans };
  }, [groupedBuckets]);

  // Top Products filtered by selectedBarForTop50 if set
  const topProductsList = useMemo(() => {
      const productCounts: Record<string, { quantity: number; revenue: number; profit: number }> = {};
      
      const filteredBuckets = selectedBarForTop50 
          ? groupedBuckets.filter(b => b.date === selectedBarForTop50)
          : groupedBuckets;

      filteredBuckets.forEach(bucket => {
          bucket.orders.filter(o => o.isPaid).forEach(order => {
              order.items.forEach(item => {
                  let itemCost = item.purchasePrice;
                  if (itemCost === undefined || itemCost === 0) {
                      const currentProduct = products.find(p => p.name === item.productName);
                      itemCost = currentProduct?.purchasePrice || 0;
                  }
                  
                  const estimatedProfit = (item.price - itemCost) * item.quantity;

                  if (!productCounts[item.productName]) productCounts[item.productName] = { quantity: 0, revenue: 0, profit: 0 };
                  productCounts[item.productName].quantity += item.quantity;
                  productCounts[item.productName].revenue += (item.price * item.quantity);
                  productCounts[item.productName].profit += estimatedProfit;
              });
          });
      });
      
      return Object.entries(productCounts)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => top50SortBy === 'quantity' ? b.quantity - a.quantity : b.profit - a.profit)
          .slice(0, 50);
  }, [groupedBuckets, selectedBarForTop50, top50SortBy, products]);

  const topProductsChartData = topProductsList.slice(0, 5).map(item => ({ name: item.name, value: item.quantity }));
  const COLORS = ['#673ab7', '#8e24aa', '#e91e63', '#f44336', '#ff9800'];

  const handleGenerateMock = () => {
    if (!confirm("주의: 현재 데이터가 덮어씌워집니다! 계속하시겠습니까? (25년 1월 ~ 26년 3월 테스트 데이터 생성)")) return;
    
    const initialNames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "전", "홍", "고", "문", "양", "손", "배", "백", "허", "유", "남"];
    const middleNames = ["민", "서", "도", "예", "시", "지", "하", "주", "수", "건", "현", "율", "은", "연", "우", "준", "승", "채", "윤", "유", "진", "영", "다", "태", "재", "소", "아", "정"];
    const lastNames = ["준", "윤", "우", "원", "호", "영", "빈", "현", "율", "서", "연", "아", "은", "진", "하", "수", "민", "희", "인", "정", "훈", "기", "태", "비", "경", "환", "성", "건", "재", "승"];

    const mockUsers = [];
    for(let i=1; i<=200; i++) {
        const name = initialNames[Math.floor(Math.random()*initialNames.length)] + middleNames[Math.floor(Math.random()*middleNames.length)] + (Math.random() > 0.3 ? lastNames[Math.floor(Math.random()*lastNames.length)] : "");
        mockUsers.push({
            nickname: `@user${i}`,
            name: name,
            phone: `010-${String(Math.floor(Math.random()*9000)+1000)}-${String(i).padStart(4, '0')}`,
            address: `서울시 강남구 테헤란로 ${Math.floor(Math.random()*100)+1}길 ${Math.floor(Math.random()*50)+1}`,
            registeredAt: new Date(new Date('2025-01-01').getTime() + Math.random() * (new Date('2026-03-03').getTime() - new Date('2025-01-01').getTime())).toISOString()
        });
    }

    const mockProducts = [];
    const productTypes = ["고급 수제청", "프리미엄 원두", "디퓨저 세트", "핸드크림", "유기농 비누", "아로마 오일", "티 세트", "에스프레소 잔", "텀블러", "바스밤"];
    for(let i=1; i<=300; i++) {
        const type = productTypes[Math.floor(Math.random() * productTypes.length)];
        const pPrice = Math.floor(Math.random() * 5 + 1) * 3000;
        const price = pPrice + Math.floor(Math.random() * 8 + 2) * 2000;
        mockProducts.push({
            id: `mp${i}`,
            name: `${type} (No.${i})`,
            price: price,
            stock: 500,
            purchasePrice: pPrice,
            isActive: true
        });
    }

    const mockArchives = [];
    const currentD = new Date('2025-01-01T08:00:00Z');
    const endD = new Date('2026-03-03T23:59:59Z');
    
    while(currentD <= endD) {
        const monthIndex = (currentD.getFullYear() - 2025) * 12 + currentD.getMonth(); 
        const baseOrders = 3 + monthIndex * 0.9;
        const numOrders = Math.floor(Math.random() * (baseOrders * 0.5)) + Math.floor(baseOrders);
        
        if (numOrders > 0) {
            const orders = [];
            for(let j=0; j<numOrders; j++) {
                const user = mockUsers[Math.floor(Math.random() * mockUsers.length)];
                const isPaid = Math.random() > 0.12; 
                const items = [];
                const numItems = Math.floor(Math.random() * 3) + 1 + Math.floor(monthIndex / 6);
                let totalPrice = 0;
                for(let k=0; k<numItems; k++) {
                    const product = mockProducts[Math.floor(Math.random() * mockProducts.length)];
                    const qty = Math.floor(Math.random() * 3) + 1;
                    items.push({
                        productName: product.name,
                        price: product.price,
                        quantity: qty,
                        purchasePrice: product.purchasePrice
                    });
                    totalPrice += product.price * qty;
                }
                
                const orderDate = new Date(currentD);
                orderDate.setHours(Math.floor(Math.random() * 14) + 9);
                
                orders.push({
                    id: `mord_${currentD.getTime()}_${j}`,
                    userId: user.phone,
                    items: items,
                    totalPrice: totalPrice,
                    createdAt: orderDate.toISOString(),
                    isPaid: isPaid
                });
            }
            mockArchives.push({ date: currentD.toISOString(), orders: orders });
        }
        currentD.setDate(currentD.getDate() + 1);
    }
    
    localStorage.setItem('boramall_users', JSON.stringify(mockUsers));
    localStorage.setItem('boramall_products', JSON.stringify(mockProducts));
    localStorage.setItem('boramall_archives', JSON.stringify(mockArchives));
    alert('테스트 데이터 생성 완료!');
    window.location.reload();
  };

  // Helper to safely format labels on Recharts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCustomBarLabel = (props: any, dataKey: 'revenue' | 'profit') => {
      const { x, y, width, value, index } = props;
      if (!value) return null;
      let displayValue = "";
      if (value >= 10000) {
          displayValue = `${(value / 10000).toFixed(value % 10000 === 0 ? 0 : 1)}만`;
      } else {
          displayValue = value.toLocaleString();
      }
      
      const dataPoint = chartData[index];
      const changePercent = dataKey === 'revenue' ? dataPoint?.revenueChangePercent : dataPoint?.profitChangePercent;
      
      let trendLabel = null;
      if (changePercent !== undefined && changePercent !== 0) {
          const isUp = changePercent > 0;
          // User requested red for UP and blue for DOWN (Korean stock chart style)
          const color = isUp ? '#ef4444' : '#2563eb'; 
          trendLabel = (
               <text x={x + width / 2} y={y - 26} fill={color} textAnchor="middle" fontSize="12" fontWeight="bold">
                   {isUp ? '▲' : '▼'}{Math.abs(Math.round(changePercent))}%
               </text>
          );
      }
      
      return (
          <g>
              {trendLabel}
              <text x={x + width / 2} y={y - 10} fill="#374151" textAnchor="middle" fontSize="13" fontWeight="900" className="drop-shadow-md">
                  {displayValue}
              </text>
          </g>
      );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
          const data = payload[0].payload;
          
          const reqMetrics = [];
          if (activeChartMetrics.includes('revenue')) reqMetrics.push({ value: `${(data.revenue || 0).toLocaleString()}원`, label: "매출액", color: "text-[#8b5cf6]" });
          if (activeChartMetrics.includes('profit')) reqMetrics.push({ value: `${(data.profit || 0).toLocaleString()}원`, label: "순이익", color: "text-[#10b981]" });
          if (activeChartMetrics.includes('aov')) reqMetrics.push({ value: `${(data.aov || 0).toLocaleString()}원`, label: "결제 건당 객단가", color: "text-[#0ea5e9]" });
          if (activeChartMetrics.includes('margin')) reqMetrics.push({ value: `${(data.marginRate || 0).toLocaleString()}%`, label: "평균 마진율", color: "text-[#3b82f6]" });
          
          return (
              <div className="bg-white p-4 border rounded-xl shadow-lg text-sm z-50 min-w-[180px]">
                  <p className="font-bold text-gray-800 mb-3 text-base border-b pb-1">{label}</p>
                  <div className="space-y-2">
                      {reqMetrics.map((m, idx) => (
                          <div key={idx} className="flex justify-between items-center gap-4">
                              <span className={`${m.color} font-bold`}>{m.label}:</span> 
                              <span className="font-black text-gray-800">{m.value}</span>
                          </div>
                      ))}
                  </div>
              </div>
          );
      }
      return null;
  };

  const setQuickDate = (type: 'thisMonth' | 'thisYear' | 'today' | 'yesterday' | 'thisWeek' | 'lastBroadcast') => {
      const today = new Date();
      if (type === 'thisMonth') {
          const start = new Date(today.getFullYear(), today.getMonth(), 1);
          const end = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of month
          setStartDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`);
          setEndDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`);
          setTimeRange('daily');
      } else if (type === 'thisYear') {
          setStartDate(`${today.getFullYear()}-01-01`);
          setEndDate(`${today.getFullYear()}-12-31`);
          setTimeRange('monthly');
      } else if (type === 'today') {
          const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          setStartDate(dateStr);
          setEndDate(dateStr);
          setTimeRange('daily');
      } else if (type === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          setStartDate(dateStr);
          setEndDate(dateStr);
          setTimeRange('daily');
      } else if (type === 'thisWeek') {
          const start = new Date(today);
          const day = start.getDay();
          const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
          start.setDate(diff);
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          setStartDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`);
          setEndDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`);
          setTimeRange('daily');
      } else if (type === 'lastBroadcast') {
          // combinedArchives is already sorted desc
          const latest = combinedArchives.find(a => a.orders && a.orders.length > 0);
          if (latest) {
              const formattedDate = latest.date.substring(0, 10);
              setStartDate(formattedDate);
              setEndDate(formattedDate);
              setTimeRange('daily');
          } else {
              alert('이전 방송 기록이 없습니다.');
          }
      }
  };

  const handleDateInput = (val: string, setter: (val: string) => void) => {
      let cleaned = val.replace(/[^0-9]/g, '');
      if (cleaned.length > 8) cleaned = cleaned.substring(0, 8);
      
      if (cleaned.length >= 6) {
          setter(`${cleaned.substring(0,4)}-${cleaned.substring(4,6)}-${cleaned.substring(6)}`);
      } else if (cleaned.length >= 4) {
          setter(`${cleaned.substring(0,4)}-${cleaned.substring(4)}`);
      } else {
          setter(cleaned);
      }
  };

  return (
    <div className="space-y-8 pb-10">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
            <div>
                <h2 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                    <span className="text-[#673ab7]">📊</span> 통계 및 비즈니스 대시보드
                </h2>
                <p className="text-sm text-gray-500 mt-1 font-medium">모든 지표는 &apos;결제 완료&apos;를 기준으로 계산됩니다.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto items-start sm:items-center">
                
                {/* Redesigned Premium Date Picker */}
                <div className="flex flex-col sm:flex-row gap-3 items-center bg-gray-50 p-2 sm:p-2 rounded-xl border border-gray-200 shadow-inner w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto px-2">
                        <span className="text-gray-400">📅</span>
                        <input 
                            type="text" 
                            placeholder="YYYYMMDD"
                            maxLength={10}
                            value={startDate} 
                            onChange={(e) => handleDateInput(e.target.value, setStartDate)}
                            className="bg-transparent font-bold text-gray-700 outline-none hover:text-[#673ab7] transition-colors w-[110px] text-center"
                        />
                        <span className="text-gray-300 font-bold mx-1">~</span>
                        <input 
                            type="text" 
                            placeholder="YYYYMMDD"
                            maxLength={10}
                            value={endDate} 
                            onChange={(e) => handleDateInput(e.target.value, setEndDate)}
                            className="bg-transparent font-bold text-gray-700 outline-none hover:text-[#673ab7] transition-colors w-[110px] text-center"
                        />
                    </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto justify-end">
                    <button 
                        onClick={handleGenerateMock}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm"
                        title="1~3월 테스트용 데이터 자동 생성"
                    >🧪 Mock 데이터</button>
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner flex-nowrap shrink-0 overflow-x-auto">
                        <button onClick={() => {setTimeRange('daily'); setSelectedBarForTop50(null)}} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${timeRange === 'daily' ? 'bg-white shadow-sm text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}>일간</button>
                        <button onClick={() => {setTimeRange('weekly'); setSelectedBarForTop50(null)}} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${timeRange === 'weekly' ? 'bg-white shadow-sm text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}>주간</button>
                        <button onClick={() => {setTimeRange('monthly'); setSelectedBarForTop50(null)}} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${timeRange === 'monthly' ? 'bg-white shadow-sm text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}>월간</button>
                        <button onClick={() => {setTimeRange('yearly'); setSelectedBarForTop50(null)}} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${timeRange === 'yearly' ? 'bg-white shadow-sm text-[#673ab7]' : 'text-gray-500 hover:text-gray-700'}`}>연간</button>
                    </div>
                </div>
            </div>
        </div>

        {/* Metrics Row (Clickable for Chart Toggling) */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div 
                onClick={() => toggleChartMetric('revenue')}
                className={`cursor-pointer transition-all bg-white p-5 rounded-xl shadow-sm border-l-4 border-[#673ab7] flex flex-col justify-between ${activeChartMetrics.includes('revenue') ? 'ring-2 ring-[#673ab7] scale-[1.02]' : 'opacity-70 hover:opacity-100'}`}
            >
                <h2 className="text-gray-500 text-[10px] sm:text-xs font-bold mb-2">누적 매출액 (확정)</h2>
                <p className="text-lg md:text-xl xl:text-2xl font-black text-[#673ab7] truncate">{overallMetrics.totalRevenue.toLocaleString()}원</p>
            </div>
            <div 
                onClick={() => toggleChartMetric('profit')}
                className={`cursor-pointer transition-all bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500 flex flex-col justify-between ${activeChartMetrics.includes('profit') ? 'ring-2 ring-green-500 scale-[1.02]' : 'opacity-70 hover:opacity-100'}`}
            >
                <h2 className="text-gray-500 text-[10px] sm:text-xs font-bold mb-2">순이익 (확정)</h2>
                <p className="text-lg md:text-xl xl:text-2xl font-black text-green-600 truncate">{overallMetrics.totalProfit.toLocaleString()}원</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-400 flex flex-col justify-between">
                <h2 className="text-gray-500 text-[10px] sm:text-xs font-bold mb-2 leading-tight">예상 총 이익 <br/><span className="text-[9px] font-normal text-gray-400">(미입금 완판 가정시)</span></h2>
                <p className="text-lg md:text-xl xl:text-2xl font-black text-orange-500 truncate">{overallMetrics.totalExpectedProfit.toLocaleString()}원</p>
            </div>
            <div 
                onClick={() => toggleChartMetric('aov')}
                className={`cursor-pointer transition-all bg-white p-5 rounded-xl shadow-sm border-l-4 border-sky-500 flex flex-col justify-between ${activeChartMetrics.includes('aov') ? 'ring-2 ring-sky-500 scale-[1.02]' : 'opacity-70 hover:opacity-100'}`}
            >
                <h2 className="text-gray-500 text-[10px] sm:text-xs font-bold mb-2">결제 건당 객단가</h2>
                <p className="text-lg md:text-xl xl:text-2xl font-black text-sky-600 truncate">
                    {overallMetrics.totalSalesCount > 0 ? Math.round(overallMetrics.totalRevenue / overallMetrics.totalSalesCount).toLocaleString() : 0}원
                </p>
            </div>
            <div 
                onClick={() => toggleChartMetric('margin')}
                className={`cursor-pointer transition-all bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500 flex flex-col justify-between ${activeChartMetrics.includes('margin') ? 'ring-2 ring-blue-500 scale-[1.02]' : 'opacity-70 hover:opacity-100'}`}
            >
                <h2 className="text-gray-500 text-[10px] sm:text-xs font-bold mb-2">평균 마진율</h2>
                <p className="text-lg md:text-xl xl:text-2xl font-black text-blue-600 truncate">{overallMetrics.avgMargin.toFixed(1)}%</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-gray-400 flex flex-col justify-between opacity-70">
                <h2 className="text-gray-500 text-[10px] sm:text-xs font-bold mb-2">입금 완료 건수</h2>
                <p className="text-lg md:text-xl xl:text-2xl font-black text-gray-700 truncate">{overallMetrics.totalSalesCount.toLocaleString()}건</p>
            </div>
        </div>

        {/* Charts & Analytics Stack (Vertical Layout) */}
        <div className="flex flex-col gap-8 mt-8">
            {/* 1. Full Width Chart */}
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm flex flex-col group border border-gray-100">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 mt-2 gap-4">
                    <div>
                        <h3 className="font-bold text-xl text-gray-800">📈 추이 분석 ({timeRange === 'daily' ? '일간' : timeRange === 'weekly' ? '주간' : timeRange === 'monthly' ? '월간' : '연간'})</h3>
                        <p className="text-sm text-gray-400 mt-2">막대를 클릭하면 해당 기간의 결제/미입금 상세 내역을 심층 분석합니다.</p>
                    </div>
                    <div className="flex bg-gray-50 p-1.5 rounded-lg border border-gray-200 gap-1 w-full sm:w-auto shadow-inner">
                        <button onClick={() => setQuickDate('lastBroadcast')} className="flex-1 sm:flex-none px-4 py-1.5 text-sm font-bold bg-[#673ab7]/10 text-[#673ab7] hover:bg-[#673ab7] hover:text-white rounded-md transition-all shadow-sm">이전 방송</button>
                        <button onClick={() => setQuickDate('today')} className="flex-1 sm:flex-none px-4 py-1.5 text-sm font-bold text-gray-600 hover:text-[#673ab7] hover:bg-white rounded-md transition-all shadow-sm">오늘</button>
                        <button onClick={() => setQuickDate('yesterday')} className="flex-1 sm:flex-none px-4 py-1.5 text-sm font-bold text-gray-600 hover:text-[#673ab7] hover:bg-white rounded-md transition-all shadow-sm">어제</button>
                        <button onClick={() => setQuickDate('thisWeek')} className="flex-1 sm:flex-none px-4 py-1.5 text-sm font-bold text-gray-600 hover:text-[#673ab7] hover:bg-white rounded-md transition-all shadow-sm">이번주</button>
                        <button onClick={() => setQuickDate('thisMonth')} className="flex-1 sm:flex-none px-4 py-1.5 text-sm font-bold text-gray-600 hover:text-[#673ab7] hover:bg-white rounded-md transition-all shadow-sm">이번달</button>
                    </div>
                </div>
                
                {groupedBuckets.length === 0 ? (
                    <div className="h-[400px] w-full mt-4 flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <span className="text-4xl mb-4 opacity-30">📭</span>
                        <p className="text-gray-500 font-bold text-lg mb-1">선택하신 기간의 데이터가 없습니다.</p>
                        <p className="text-gray-400 text-sm">상단 퀵버튼을 눌러 다른 기간을 조회해보세요.</p>
                    </div>
                ) : (
                    <div className="h-[480px] w-full mt-4 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <BarChart margin={{top: 30, right: 10, left: 10, bottom: 20}} data={chartData} onClick={(e: any) => {
                                if (e && e.activePayload && e.activePayload.length > 0) {
                                    const fullDate = e.activePayload[0].payload.fullDate;
                                    if(fullDate) {
                                        setSelectedDate(fullDate);
                                        setSelectedBarForTop50(fullDate);
                                        // Scroll down to Top 50 slightly
                                        setTimeout(() => {
                                            document.getElementById('top50-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }, 100);
                                    }
                                }
                            }} className="cursor-pointer">
                                <XAxis dataKey="name" tick={{fontSize: 14, fill: '#4b5563', fontWeight: 'bold'}} axisLine={{stroke: '#e5e7eb'}} tickLine={false} dy={10} />
                                <YAxis yAxisId="left" domain={[0, 'auto']} tickFormatter={(value) => `${(value === 0 ? 0 : value / 10000 + '만')}`} width={80} axisLine={{stroke: '#e5e7eb'}} tickLine={false} tick={{fontSize: 14, fill: '#4b5563', fontWeight: 'bold'}} />
                                {(activeChartMetrics.includes('aov') || activeChartMetrics.includes('margin')) && (
                                    <YAxis yAxisId="right" orientation="right" domain={[0, 'auto']} tickFormatter={(value) => value.toLocaleString()} width={80} axisLine={{stroke: '#e5e7eb'}} tickLine={false} tick={{fontSize: 14, fill: '#4b5563', fontWeight: 'bold'}} />
                                )}
                                <Tooltip cursor={{fill: 'rgba(200,200,200,0.1)'}} content={<CustomTooltip />} />
                                <Legend wrapperStyle={{paddingTop: '20px'}}/>
                                
                                {activeChartMetrics.includes('revenue') && (
                                    <Bar yAxisId="left" dataKey="revenue" name="매출액" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={70}>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <LabelList dataKey="revenue" content={(props: any) => renderCustomBarLabel(props, 'revenue')} />
                                    </Bar>
                                )}
                                {activeChartMetrics.includes('profit') && (
                                    <Bar yAxisId="left" dataKey="profit" name="순이익" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={70}>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <LabelList dataKey="profit" content={(props: any) => renderCustomBarLabel(props, 'profit')} />
                                    </Bar>
                                )}
                                {activeChartMetrics.includes('aov') && (
                                    <Bar yAxisId="right" dataKey="aov" name="결제 건당 객단가" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={70}>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <LabelList dataKey="aov" content={(props: any) => renderCustomBarLabel(props, 'revenue')} />
                                    </Bar>
                                )}
                                {activeChartMetrics.includes('margin') && (
                                    <Bar yAxisId="right" dataKey="marginRate" name="평균 마진율" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={70}>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <LabelList dataKey="marginRate" content={(props: any) => renderCustomBarLabel(props, 'revenue')} />
                                    </Bar>
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
            
            {groupedBuckets.length > 0 && (
                <>
                    {/* 2. Full Width Top 50 Breakdown */}
                    <div id="top50-section" className="bg-white p-6 rounded-lg shadow-sm flex flex-col">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                            <div>
                            <h3 className="font-bold text-lg text-gray-800">
                                🏆 누적 인기 상품 Top 50 
                                {selectedBarForTop50 && <span className="ml-2 bg-[#673ab7] text-white text-xs px-2 py-1 rounded inline-block">{selectedBarForTop50} 기준</span>}
                                {selectedBarForTop50 && (
                                    <button onClick={() => setSelectedBarForTop50(null)} className="ml-2 text-xs text-red-500 hover:underline">
                                        초기화 (전체 보기)
                                    </button>
                                )}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">입금 완료 건만 포함됩니다.</p>
                        </div>
                        <div className="flex bg-gray-100 p-1 rounded-lg self-end md:self-auto">
                            <button 
                                onClick={() => setTop50SortBy('quantity')} 
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${top50SortBy === 'quantity' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                            >판매량순</button>
                            <button 
                                onClick={() => setTop50SortBy('profit')} 
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${top50SortBy === 'profit' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >순이익순</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1">
                        <div className="min-h-[250px] flex items-center justify-center md:col-span-1">
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={topProductsChartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={4}
                                        dataKey="value"
                                        label={({name}: {name?: string}) => `${(name || '').substring(0,8)}..`}
                                        labelLine={true}
                                    >
                                        {topProductsChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar border rounded-xl p-0 bg-white md:col-span-2 shadow-inner">
                            <table className="w-full text-left table-fixed">
                                <thead className="text-gray-500 border-b bg-gray-50 sticky top-0 shadow-sm z-10 text-sm">
                                    <tr>
                                        <th className="py-3 px-4 w-[50%]">순위 / 상품명</th>
                                        <th className="py-3 px-4 w-[20%] text-right">수량</th>
                                        <th className="py-3 px-4 w-[30%] text-right text-green-600">발생 순이익</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topProductsList.map((item, idx) => {
                                        let rankBadge = <span className="text-xs font-bold text-gray-400 bg-gray-200 rounded-lg w-7 h-6 inline-flex items-center justify-center mr-3 shadow-inner">{idx + 1}</span>;
                                        if (idx === 0) rankBadge = <span className="text-2xl mr-2 leading-none inline-block align-middle" title="1위">🥇</span>;
                                        if (idx === 1) rankBadge = <span className="text-2xl mr-2 leading-none inline-block align-middle" title="2위">🥈</span>;
                                        if (idx === 2) rankBadge = <span className="text-2xl mr-2 leading-none inline-block align-middle" title="3위">🥉</span>;
                                        
                                        return (
                                            <tr key={idx} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${idx < 3 ? 'bg-indigo-50/20' : ''}`}>
                                                <td className="py-3 px-4 truncate flex items-center">
                                                    {rankBadge}
                                                    <span title={item.name} className={`truncate ${idx < 3 ? 'font-bold text-gray-800' : 'text-gray-700 font-medium'}`}>{item.name}</span>
                                                </td>
                                                <td className="py-3 px-4 text-right font-black text-[#673ab7]">{item.quantity}개</td>
                                                <td className="py-3 px-4 text-right font-bold text-green-600">{item.profit.toLocaleString()}원</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Top VIP Cards (Moved Below Top 50) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                    <div className="bg-gradient-to-r from-[#673ab7] to-[#8e24aa] p-6 rounded-xl shadow-md text-white relative overflow-hidden flex flex-col justify-between h-64 border border-purple-800/20">
                        <div className="absolute -right-6 -top-6 opacity-[0.08] text-9xl leading-none rotate-12">👑</div>
                        <div>
                            <h3 className="font-bold mb-5 opacity-90 border-b border-white/20 pb-2 z-10 relative">VVIP 고객 (누적 구매액)</h3>
                            <ol className="space-y-4 z-10 relative mb-4">
                                {customerInsights.vvip.slice(0,3).map(([id, data], i) => {
                                    const user = users.find(u => u.phone === id || u.nickname === id);
                                    return (
                                        <li key={i} className="flex justify-between items-center text-sm md:text-base">
                                            <span className="flex items-center gap-3">
                                                <span className={`font-black w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 shadow-inner ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-800' : i === 2 ? 'bg-amber-600 text-white' : 'bg-white/20'}`}>{i+1}</span>
                                                <span className="truncate max-w-[120px] font-bold">{user?.name || '미등록'}</span> 
                                                <span className="opacity-70 text-xs hidden sm:inline">({user?.nickname || id})</span>
                                            </span>
                                            <span className="font-black shrink-0 tracking-tight">{data.totalSpend.toLocaleString()}원</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                        <button onClick={() => setShowVipModal(true)} className="w-full bg-white/10 hover:bg-white/20 py-2.5 rounded-lg font-bold text-sm transition-colors z-10 border border-white/10">
                            전체 보기 (Top 50)
                        </button>
                    </div>
                    
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-6 rounded-xl shadow-md text-white relative overflow-hidden flex flex-col justify-between h-64 border border-emerald-800/20">
                        <div className="absolute -right-6 -top-6 opacity-[0.08] text-9xl leading-none -rotate-12">⭐</div>
                        <div>
                            <h3 className="font-bold mb-5 opacity-90 border-b border-white/20 pb-2 z-10 relative">우수 팬 (주문 횟수)</h3>
                            <ol className="space-y-4 z-10 relative mb-4">
                                {customerInsights.fans.slice(0,3).map(([id, data], i) => {
                                    const user = users.find(u => u.phone === id || u.nickname === id);
                                    return (
                                        <li key={i} className="flex justify-between items-center text-sm md:text-base">
                                            <span className="flex items-center gap-3">
                                                <span className={`font-black w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 shadow-inner ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-800' : i === 2 ? 'bg-amber-600 text-white' : 'bg-white/20'}`}>{i+1}</span>
                                                <span className="truncate max-w-[120px] font-bold">{user?.name || '미등록'}</span> 
                                                <span className="opacity-70 text-xs hidden sm:inline">({user?.nickname || id})</span>
                                            </span>
                                            <span className="font-black shrink-0 tracking-tight">{data.frequency}회 참여</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                        <button onClick={() => setShowFanModal(true)} className="w-full bg-white/10 hover:bg-white/20 py-2.5 rounded-lg font-bold text-sm transition-colors z-10 border border-white/10">
                            전체 보기 (Top 50)
                        </button>
                    </div>
                </div>
            </>
        )}
        </div>

        {/* Grouped Archive List (Horizontal Redesign & Search) */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-4">
                <div>
                    <h2 className="font-bold text-xl text-gray-800">
                         📦 {globalSearch ? '전체 기간 검색 결과' : `기간별 보관함 요약 (${timeRange === 'daily' ? '일간' : timeRange === 'weekly' ? '주간' : '월간'})`}
                    </h2>
                </div>
                <div className="flex items-center gap-2 border rounded-lg p-2 bg-white w-full sm:w-72 shadow-inner">
                    <span className="text-sm">🔍</span>
                    <input 
                        type="text" 
                        placeholder="이름, 폰번호, 주문번호 전체 검색..." 
                        className="bg-transparent outline-none text-sm w-full font-medium text-gray-700"
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                    />
                    {globalSearch && (
                        <button onClick={() => setGlobalSearch('')} className="text-gray-400 hover:text-red-500 font-bold text-xs shrink-0">✕</button>
                    )}
                </div>
            </div>
            
            {globalSearch ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-center text-sm md:text-sm whitespace-nowrap">
                        <thead className="bg-white text-gray-500 border-b">
                            <tr>
                                <th className="p-3 font-medium text-left pl-6">보관 날짜</th>
                                <th className="p-3 font-medium text-left">주문자/연락처</th>
                                <th className="p-3 font-medium text-left">주문번호</th>
                                <th className="p-3 font-medium text-right">결제상태</th>
                                <th className="p-3 font-medium text-right">상품/총액</th>
                                <th className="p-3 font-medium pr-6 text-right">상세</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {globalSearchResults.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-400 font-bold bg-gray-50/50">검색 결과가 없습니다. 조건을 바꿔보세요.</td>
                                </tr>
                            ) : globalSearchResults.map((res, i) => (
                                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="p-3 font-bold text-gray-800 text-left pl-6">
                                        {res.formattedDate}
                                    </td>
                                    <td className="p-3 text-left">
                                        <div className="font-bold text-gray-800">{res.user?.name || '미등록'}</div>
                                        <div className="text-xs text-[11px] text-gray-500">{res.user?.phone || res.order.userId}</div>
                                    </td>
                                    <td className="p-3 text-left font-mono text-[11px] text-gray-500 select-all">
                                        {res.order.id}
                                    </td>
                                    <td className="p-3 text-right">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${res.order.isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {res.order.isPaid ? '입금완료' : '미입금'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="text-xs text-gray-500">{res.order.items.length}개 품목</div>
                                        <div className="font-black text-[#673ab7]">{res.order.totalPrice.toLocaleString()}원</div>
                                    </td>
                                    <td className="p-3 text-right pr-6">
                                        <button 
                                            onClick={() => {
                                                setStartDate('');
                                                setEndDate('');
                                                setTimeRange('daily');
                                                const d = new Date(res.rawDate);
                                                const days = ['일', '월', '화', '수', '목', '금', '토'];
                                                const dayStr = days[d.getDay()];
                                                const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} (${dayStr})`;
                                                setTimeout(() => {
                                                    setSelectedDate(dateKey);
                                                    if (!expandedOrders.includes(res.order.id)) {
                                                         setExpandedOrders(prev => [...prev, res.order.id]);
                                                    }
                                                }, 0);
                                            }}
                                            className="text-[11px] bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded font-bold transition-colors shadow-sm"
                                        >해당일 보기</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-center text-sm md:text-sm whitespace-nowrap">
                    <thead className="bg-white text-gray-500 border-b">
                        <tr>
                            <th className="p-3 font-medium text-left pl-6">기간</th>
                            <th className="p-3 font-medium text-blue-600">입금률</th>
                            <th className="p-3 font-medium">총 매출액</th>
                            <th className="p-3 font-medium text-green-600">순이익</th>
                            <th className="p-3 font-medium">건수 (결제/미입금)</th>
                            <th className="p-3 font-medium pr-6 text-right">상세</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {groupedBuckets.map((bucket, index) => {
                            const paidOrders = bucket.orders.filter(o => o.isPaid);
                            const unpaidOrders = bucket.orders.filter(o => !o.isPaid);
                            const stats = calculateFinancials(bucket.orders);
                            
                            const totalOrders = bucket.orders.length;
                            const paidRate = totalOrders > 0 ? (paidOrders.length / totalOrders) * 100 : 0;
                            
                            return (
                                <tr key={index} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="p-3 font-bold text-gray-800 text-left pl-6">
                                        {bucket.date}
                                    </td>
                                    <td className="p-3 font-black text-blue-600">
                                        {paidRate.toFixed(1)}%
                                    </td>
                                    <td className="p-3 font-bold text-gray-700">
                                        {stats.revenue.toLocaleString()}원
                                    </td>
                                    <td className="p-3 font-bold text-green-600">
                                        {stats.profit.toLocaleString()}원
                                        <span className="text-[10px] text-gray-400 ml-1 font-normal">({stats.margin.toFixed(1)}%)</span>
                                    </td>
                                    <td className="p-3 font-medium text-gray-700">
                                        <span className="text-[#673ab7] font-bold">{paidOrders.length}</span> / <span className="text-yellow-600">{unpaidOrders.length}</span>
                                    </td>
                                    <td className="p-3 text-right pr-6">
                                        <button 
                                            onClick={() => setSelectedDate(bucket.date)}
                                            className="text-xs bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded font-bold transition-colors shadow-sm"
                                        >내역 보기</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            )}
        </div>

        {/* Detail Modal (Accordions & Top Summaries) */}
        {selectedDate && (() => {
            const bucket = groupedBuckets.find(b => b.date === selectedDate);
            if (!bucket) return null;
            const paidOrders = bucket!.orders.filter(o => o.isPaid);
            const unpaidOrders = bucket!.orders.filter(o => !o.isPaid);
            const displayOrders = detailTab === 'paid' ? paidOrders : unpaidOrders;
            const stats = calculateFinancials(bucket!.orders);
            
            // Calculate unpaid macro
            const unpaidTotal = unpaidOrders.reduce((acc, curr) => acc + curr.totalPrice, 0);
            
            return (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
                        
                        {/* Header & Macro Summaries */}
                        <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 rounded-t-xl gap-4">
                            <div>
                                <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2 mb-2">📅 {selectedDate} 상세 내역</h3>
                                <div className="flex gap-3 text-sm flex-wrap">
                                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold">✅ 입금 총합: {stats.revenue.toLocaleString()}원</span>
                                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-bold">⏳ 미입금 총합: {unpaidTotal.toLocaleString()}원</span>
                                    <span className="bg-[#673ab7]/10 text-[#673ab7] px-3 py-1 rounded-full font-bold">순이익: {stats.profit.toLocaleString()}원 ({stats.margin.toFixed(1)}%)</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedDate(null)} className="absolute right-4 top-4 bg-white border border-gray-200 text-gray-500 rounded p-1 hover:bg-gray-100 font-bold w-8 h-8 flex items-center justify-center">X</button>
                        </div>
                        
                        <div className="flex border-b">
                            <button onClick={() => setDetailTab('paid')} className={`flex-1 py-3 font-bold ${detailTab === 'paid' ? 'border-b-2 border-green-500 text-green-600 bg-green-50/50' : 'text-gray-500 hover:bg-gray-50'}`}>✅ 결제 완료 ({paidOrders.length}건)</button>
                            <button onClick={() => setDetailTab('unpaid')} className={`flex-1 py-3 font-bold ${detailTab === 'unpaid' ? 'border-b-2 border-yellow-500 text-yellow-600 bg-yellow-50/50' : 'text-gray-500 hover:bg-gray-50'}`}>⏳ 미입금 ({unpaidOrders.length}건)</button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 bg-gray-50/30 p-4">
                            {displayOrders.length === 0 ? (
                                <div className="p-10 text-center text-gray-400 font-bold">해당 내역이 없습니다.</div>
                            ) : (
                                <div className="space-y-3">
                                    {displayOrders.map(order => {
                                        const user = users.find(u => u.phone === order.userId || u.nickname === order.userId);
                                        const isExpanded = expandedOrders.includes(order.id);
                                        
                                        return (
                                            <div key={order.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                                {/* Accordion Header */}
                                                <div 
                                                    className="p-4 flex flex-wrap justify-between items-center cursor-pointer hover:bg-blue-50/30 transition-colors gap-4"
                                                    onClick={() => toggleOrderAccordion(order.id)}
                                                >
                                                    <div className="flex items-center gap-4 min-w-[200px]">
                                                        <div className="bg-gray-100 rounded-full w-10 h-10 flex items-center justify-center text-xl shrink-0">
                                                            {detailTab === 'paid' ? '🎉' : '💤'}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-800 text-lg">{user?.name || '미등록 고객'}</div>
                                                            <div className="text-xs text-gray-500 block">{user?.phone || order.userId}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-400 font-medium mb-0.5">총 {order.items.length}개 품목</div>
                                                            <div className="font-black text-lg text-gray-800">{order.totalPrice.toLocaleString()}원</div>
                                                        </div>
                                                        <div className="text-gray-400 mx-2 text-xl font-bold bg-gray-100 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200">
                                                            {isExpanded ? '▲' : '▼'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Accordion Body (Details) */}
                                                {isExpanded && (
                                                    <div className="bg-gray-50 p-4 border-t px-6">
                                                        <ul className="space-y-2">
                                                            {order.items.map((item, idx) => {
                                                                const itemCost = item.purchasePrice || products.find(p=>p.name===item.productName)?.purchasePrice || 0;
                                                                const isConsignment = item.isConsignment;
                                                                return (
                                                                    <li key={idx} className="bg-white p-3 border rounded-md shadow-sm flex flex-wrap justify-between items-center text-sm gap-2">
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="font-bold text-gray-800">{item.productName}</span> 
                                                                            <span className="text-[#673ab7] font-black bg-purple-100 px-2 py-0.5 rounded text-xs">{item.quantity}개</span>
                                                                            {isConsignment && <span className="text-[10px] tracking-tight bg-teal-100 text-teal-700 px-1 py-0.5 rounded border border-teal-200 font-bold">위탁({item.vendorName})</span>}
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <span className="text-gray-700 font-bold">{(item.price * item.quantity).toLocaleString()}원</span>
                                                                            {detailTab === 'paid' && itemCost > 0 && (
                                                                                <span className="text-xs text-green-600 block mt-0.5 font-medium border-t border-gray-100 pt-0.5">
                                                                                    마진 +{((item.price - itemCost) * item.quantity).toLocaleString()}원
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </li>
                                                                )
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        })()}

        {/* VIP / Fan Modals */}
        {(showVipModal || showFanModal) && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                    <div className={`p-5 flex justify-between rounded-t-xl text-white font-bold text-lg ${showVipModal ? 'bg-[#673ab7]' : 'bg-emerald-600'}`}>
                        {showVipModal ? '👑 VVIP 전체 보기 (Top 50)' : '⭐ 우수 팬 전체 보기 (Top 50)'}
                        <button onClick={() => {setShowVipModal(false); setShowFanModal(false)}} className="w-8 h-8 flex items-center justify-center font-bold text-lg hover:bg-white/20 rounded">X</button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-0">
                        <table className="w-full text-left text-sm md:text-base">
                            <thead className="bg-gray-50 sticky top-0 shadow-sm">
                                <tr>
                                    <th className="p-4 pl-6 border-b">순위</th>
                                    <th className="p-4 border-b">이름/연락처</th>
                                    <th className="p-4 border-b text-right pr-6">{showVipModal ? '누적 구매액' : '총 주문 횟수'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(showVipModal ? customerInsights.vvip : customerInsights.fans).map(([id, data], i) => {
                                    const user = users.find(u => u.phone === id || u.nickname === id);
                                    return (
                                        <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="p-4 pl-6 font-black text-gray-400 w-16 text-center">{i+1}</td>
                                            <td className="p-4">
                                                <div className="font-bold text-gray-800 text-lg">{user?.name || '미등록'}</div>
                                                <div className="text-gray-500 text-sm mt-0.5">{user?.nickname || id}</div>
                                            </td>
                                            <td className="p-4 text-right pr-6 font-black text-lg text-gray-800">
                                                {showVipModal ? <span className="text-[#673ab7]">{data.totalSpend.toLocaleString()}원</span> : <span className="text-emerald-600">{data.frequency}회</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
