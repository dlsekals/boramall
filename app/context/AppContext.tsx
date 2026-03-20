"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

// --- Types ---
export interface User {
  nickname: string; // Unique ID (e.g., @gildong)
  name: string;
  phone: string;
  address: string;
  registeredAt: string;
  youtubeHandle?: string;
  isBlacklisted?: boolean;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  purchasePrice?: number; // Cost of goods
  isActive: boolean; // Is available for today's broadcast
  updatedAt?: string; // Latest stock update timestamp
  isConsignment?: boolean; // 위탁 상품 여부
  vendorName?: string; // 업체명/발주처
  expirationDate?: string; // 유통기한 (YYYY-MM-DD)
}

export interface OrderItem {
  productName: string;
  price: number;
  quantity: number;
  purchasePrice?: number; // Snapshot of cost at time of order
  isConsignment?: boolean;
  vendorName?: string;
}

export interface Order {
  id: string;
  userId: string; // References User.nickname
  items: OrderItem[];
  totalPrice: number;
  createdAt: string;
  isPaid: boolean;
  trackingNumber?: string;
  deliveryStatus?: '배송준비중' | '배송중' | '배송완료' | '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료';
  isExportedToExcel?: boolean; // 롯데택배 엑셀로 추출되었는지 여부
}


interface AppContextType {
  users: User[];
  products: Product[];
  orders: Order[];
  
  // User Actions
  registerUser: (user: User) => { success: boolean; message?: string };
  getUser: (phoneOrNickname: string) => User | undefined;
  getUserByHandle: (handle: string) => User | undefined;

  updateUser: (targetUser: User, updatedUser: User) => boolean;
  deleteUser: (targetUser: User) => void;
  toggleUserBlacklist: (targetUser: User) => void;
  linkUserHandle: (targetUser: User, handle: string) => void;

  // Product Actions
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  toggleProductActive: (id: string) => void;
  toggleAllProductsActive: (isActive: boolean) => void;

  // Order Actions
  createOrder: (userId: string, productIds: string[], quantities: number[], skipUserCheck?: boolean) => { success: boolean; message: string };
  markOrderPaid: (orderId: string, isPaid: boolean) => void;
  updateOrder: (orderId: string, updatedItems: OrderItem[]) => void;
  deleteOrder: (orderId: string) => void;
  mergeDuplicateOrders: () => { success: boolean; message: string };
  
  // Delivery & Post-Purchase Actions
  updateDeliveryStatus: (orderId: string, status: '배송준비중' | '배송중' | '배송완료' | '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료') => void;
  updateTrackingNumber: (orderId: string, trackingNumber: string) => void;
  bulkUpdateTracking: (mappingData: { orderId: string; trackingNumber: string }[]) => { success: number; failed: number };
  markOrdersAsExported: (orderIds: string[]) => void;
  processOrderCancellation: (orderId: string, newStatus: '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료', restoreStock: boolean) => void;
  
  // Admin Actions
  resetOrders: (archive?: boolean) => void;
  archiveOrders: () => void; // Explicit archive
  refreshOrders: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  refreshUsers: () => Promise<void>;
}

// --- Context ---
const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // --- State ---
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  

  // --- Database Sync Hook ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function useDbSync(currentData: any[], endpoint: string, idKey: string, isLoaded: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevData = React.useRef<any[] | null>(null);

    useEffect(() => {
      if (!isLoaded) return;
      if (prevData.current === null) {
        prevData.current = currentData;
        return;
      }

      const addedOrChanged = currentData.filter(item => {
        const prevItem = prevData.current!.find(p => p[idKey] === item[idKey]);
        return JSON.stringify(prevItem) !== JSON.stringify(item);
      });

      const deletedIds = prevData.current!
        .filter(p => !currentData.find(item => item[idKey] === p[idKey]))
        .map(p => p[idKey]);

      if (addedOrChanged.length > 0) {
        fetch(endpoint, { method: 'POST', body: JSON.stringify(addedOrChanged) }).catch(console.error);
      }
      deletedIds.forEach(id => {
        const queryParam = idKey === 'nickname' ? 'nickname' : 'id';
        fetch(`${endpoint}?${queryParam}=${id}`, { method: 'DELETE' }).catch(console.error);
      });

      prevData.current = currentData;
    }, [currentData, endpoint, idKey, isLoaded]);
  }

  // --- Persistence & Initialization ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, productsRes, ordersRes] = await Promise.all([
          fetch('/api/users').then(res => res.json()),
          fetch('/api/products').then(res => res.json()),
          fetch('/api/orders').then(res => res.json())
        ]);
        
        setUsers(Array.isArray(usersRes) ? usersRes : []);
        setProducts(Array.isArray(productsRes) ? productsRes : []);
        setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      } catch (err) {
        console.error("Failed to load initial data from DB", err);
      } finally {
        setIsLoaded(true);
      }
    };
    fetchData();
  }, []);

  const refreshOrders = async () => {
    try {
      const ordersRes = await fetch('/api/orders').then(res => res.json());
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
    } catch (err) {
      console.error("Failed to refresh orders", err);
    }
  };

  const refreshProducts = async () => {
    try {
      const productsRes = await fetch('/api/products').then(res => res.json());
      setProducts(Array.isArray(productsRes) ? productsRes : []);
    } catch (err) {
      console.error("Failed to refresh products", err);
    }
  };

  const refreshUsers = async () => {
    try {
      const usersRes = await fetch('/api/users').then(res => res.json());
      setUsers(Array.isArray(usersRes) ? usersRes : []);
    } catch (err) {
      console.error("Failed to refresh users", err);
    }
  };

  useDbSync(users, '/api/users', 'nickname', isLoaded);
  useDbSync(products, '/api/products', 'id', isLoaded);
  useDbSync(orders, '/api/orders', 'id', isLoaded);

  // --- Actions ---

  const registerUser = (user: User) => {
    // Check if nickname already exists (case-insensitive just in case)
    const existingNickname = users.find(u => u.nickname.toLowerCase() === user.nickname.toLowerCase());
    
    if (existingNickname) {
      return { success: false, message: `${user.nickname}은(는) 기존에 존재하는 아이디 입니다. 유튜브 페이지에서 @핸들명을 변경 부탁드립니다.` };
    }

    setUsers(prev => [...prev, user]);
    return { success: true };
  };

  const getUser = (phoneOrNickname: string) => {
      // Try finding by phone first, then nickname for backward compatibility
      return users.find(u => u.phone === phoneOrNickname) || users.find(u => u.nickname === phoneOrNickname);
  };

  const updateUser = (targetUser: User, updatedUser: User) => {
    // Check duplication if nickname changed
    if (targetUser.nickname !== updatedUser.nickname) {
        if (users.some(u => u.nickname.toLowerCase() === updatedUser.nickname.toLowerCase())) {
            alert(`${updatedUser.nickname}은(는) 이미 존재하는 아이디입니다.`);
            return false;
        }
    }

    updatedUser.updatedAt = new Date().toISOString();

    // Cascade update to orders (userId is phone or legacy nickname)
    setOrders(prev => prev.map(o => {
        let newUserId = o.userId;
        if (o.userId === targetUser.phone) newUserId = updatedUser.phone;
        else if (o.userId === targetUser.nickname) newUserId = updatedUser.nickname;
        return { ...o, userId: newUserId };
    }));

    setUsers(prev => prev.map(u => 
        (u.nickname === targetUser.nickname && u.phone === targetUser.phone && u.registeredAt === targetUser.registeredAt)
        ? updatedUser : u
    ));
    return true;
  };

  const deleteUser = (targetUser: User) => {
    setUsers(prev => prev.filter(u => !(u.nickname === targetUser.nickname && u.phone === targetUser.phone && u.registeredAt === targetUser.registeredAt)));
  };

  const toggleUserBlacklist = (targetUser: User) => {
    setUsers(prev => prev.map(u => 
        (u.nickname === targetUser.nickname && u.phone === targetUser.phone && u.registeredAt === targetUser.registeredAt)
        ? { ...u, isBlacklisted: !u.isBlacklisted } : u
    ));
  };

  const linkUserHandle = (targetUser: User, handle: string) => {
      // 1. Transfer any existing orders from the auto-created guest user (handle) to the real targetUser
      setOrders(prev => prev.map(o => 
          o.userId === handle ? { ...o, userId: targetUser.nickname } : o
      ));

      // 2. Delete the auto-created guest user if it exists
      setUsers(prev => {
          let updatedUsers = prev.filter(u => u.nickname !== handle);
          // 3. Update the real targetUser's youtubeHandle
          updatedUsers = updatedUsers.map(u => 
              (u.nickname === targetUser.nickname && u.phone === targetUser.phone && u.registeredAt === targetUser.registeredAt)
              ? { ...u, youtubeHandle: handle } : u
          );
          return updatedUsers;
      });
  };

  const getUserByHandle = (handle: string) => {
      return users.find(u => u.youtubeHandle === handle);
  };

  const addProduct = (product: Product) => {
    setProducts(prev => [product, ...prev]);
  };

  const updateProduct = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const toggleProductActive = (id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  const toggleAllProductsActive = (isActive: boolean) => {
    setProducts(prev => prev.map(p => ({ ...p, isActive })));
  };

  const createOrder = (userId: string, productIds: string[], quantities: number[], skipUserCheck?: boolean) => {
    if (!skipUserCheck) {
        const user = getUser(userId);
        if (!user) return { success: false, message: `사용자를 찾을 수 없습니다.` };
    }

    // 1. Prepare new items and calculate total price change
    const newItems: OrderItem[] = [];
    let addPrice = 0;

    for (let i = 0; i < productIds.length; i++) {
        const product = products.find(p => p.id === productIds[i]);
        const qty = quantities[i];

        if (!product) return { success: false, message: "상품을 찾을 수 없습니다." };
        if (product.stock < qty) return { success: false, message: `재고 부족: ${product.name} (남은 수량: ${product.stock})` };

        newItems.push({
            productName: product.name,
            price: product.price,
            quantity: qty,
            purchasePrice: product.purchasePrice || 0,
            isConsignment: product.isConsignment,
            vendorName: product.vendorName
        });
        addPrice += product.price * qty;
    }

    // Atomic Stock Deduction! This prevents stale closure overwrites in batch processing
    setProducts(prevProducts => {
        const updatedProducts = [...prevProducts];
        productIds.forEach((pid, i) => {
            const qty = quantities[i];
            const pIndex = updatedProducts.findIndex(p => p.id === pid);
            if (pIndex > -1) {
                updatedProducts[pIndex] = { ...updatedProducts[pIndex], stock: updatedProducts[pIndex].stock - qty };
            }
        });
        return updatedProducts;
    });

    // 2. Update Orders State Atomically
    setOrders(prevOrders => {
        const timestamp = Date.now();
        const todayStr = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
        const existingOrderIndex = prevOrders.findIndex(o => o.userId === userId && !o.isPaid && o.createdAt === todayStr);

        if (existingOrderIndex > -1) {
            // MERGE into existing order from TODAY
            const existingOrder = prevOrders[existingOrderIndex];
            const updatedItems = existingOrder.items.map(item => ({...item})); // Deep copy

            newItems.forEach(newItem => {
                const existingItemIndex = updatedItems.findIndex(i => i.productName === newItem.productName);
                if (existingItemIndex > -1) {
                    updatedItems[existingItemIndex].quantity += newItem.quantity;
                } else {
                    updatedItems.push({...newItem});
                }
            });

            const updatedOrder = {
                ...existingOrder,
                items: updatedItems,
                totalPrice: existingOrder.totalPrice + addPrice,
            };

            // Move the merged order to the top (index 0) so it reflects as the most recent activity
            const remainingOrders = prevOrders.filter((_, idx) => idx !== existingOrderIndex);
            return [updatedOrder, ...remainingOrders];

        } else {
            // CREATE new order (for today, tracking separately from past unpaid orders)
            const newOrder: Order = {
                id: `${timestamp}-${Math.floor(Math.random() * 1000)}`,
                userId: userId, // Now stores the phone number
                items: newItems,
                totalPrice: addPrice,
                createdAt: todayStr,
                isPaid: false,
                deliveryStatus: '배송준비중'
            };
            return [newOrder, ...prevOrders];
        }
    });

    return { success: true, message: "주문 완료" };
  };
  
  const markOrderPaid = (orderId: string, isPaid: boolean) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, isPaid } : o));
  };

  const updateOrder = (orderId: string, updatedItems: OrderItem[]) => {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    
    const oldOrder = orders[orderIndex];
    let newTotalPrice = 0;

    // Calculate Stock Changes safely
    // We clone products to avoid mutation
    const newProducts = [...products];
    
    const adjustStock = (productName: string, amount: number) => {
        const idx = newProducts.findIndex(p => p.name === productName);
        if (idx > -1) {
            newProducts[idx] = { 
                ...newProducts[idx], 
                stock: newProducts[idx].stock + amount 
            };
        }
    };

    // 1. Revert stock for all old items (add back)
    oldOrder.items.forEach(item => {
        adjustStock(item.productName, item.quantity);
    });

    // 2. Deduct stock for new items (remove)
    updatedItems.forEach(item => {
        adjustStock(item.productName, -item.quantity);
        newTotalPrice += item.price * item.quantity;
    });

    // 3. Commit Product Changes
    setProducts(newProducts);

    // 4. Update Order
    const newOrders = [...orders];
    if (updatedItems.length === 0) {
        // If no items, delete order? Or keep empty? 
        // Let's delete it to be clean if empty. 
        newOrders.splice(orderIndex, 1);
    } else {
        newOrders[orderIndex] = {
            ...oldOrder,
            items: updatedItems,
            totalPrice: newTotalPrice
        };
    }
    setOrders(newOrders);
  };

  const deleteOrder = (orderId: string) => {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    
    const orderToDel = orders[orderIndex];
    
    // Restore stock
    const newProducts = [...products];
    orderToDel.items.forEach(item => {
        const idx = newProducts.findIndex(p => p.name === item.productName);
        if (idx > -1) {
            newProducts[idx] = {
                ...newProducts[idx],
                stock: newProducts[idx].stock + item.quantity
            };
        }
    });

    setProducts(newProducts);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const mergeDuplicateOrders = () => {
      let mergedCount = 0;
      
      const newOrders = [...orders];
      const unpaidOrders = newOrders.filter(o => !o.isPaid);
      
      // Group unpaid orders by userId
      const groupedByUserId: Record<string, Order[]> = {};
      unpaidOrders.forEach(o => {
          if (!groupedByUserId[o.userId]) groupedByUserId[o.userId] = [];
          groupedByUserId[o.userId].push(o);
      });
      
      Object.keys(groupedByUserId).forEach(userId => {
          const userOrders = groupedByUserId[userId];
          if (userOrders.length > 1) {
              // Sort to keep the oldest createdAt
              userOrders.sort((a, b) => a.id.localeCompare(b.id)); // Oldest first based on timestamp id
              
              const baseOrder = userOrders[0];
              let combinedTotalPrice = baseOrder.totalPrice;
              const combinedItems: OrderItem[] = baseOrder.items.map(item => ({...item}));
              
              // Merge items from other orders into baseOrder
              for (let i = 1; i < userOrders.length; i++) {
                  const orderToMerge = userOrders[i];
                  combinedTotalPrice += orderToMerge.totalPrice;
                  
                  orderToMerge.items.forEach(itemToMerge => {
                      const existingItemIdx = combinedItems.findIndex(i => i.productName === itemToMerge.productName);
                      if (existingItemIdx > -1) {
                          combinedItems[existingItemIdx].quantity += itemToMerge.quantity;
                      } else {
                          combinedItems.push({...itemToMerge});
                      }
                  });
                  
                  // Remove merged order from list
                  const indexToRemove = newOrders.findIndex(o => o.id === orderToMerge.id);
                  if (indexToRemove > -1) {
                      newOrders.splice(indexToRemove, 1);
                  }
              }
              
              // Update base order
              const baseIndex = newOrders.findIndex(o => o.id === baseOrder.id);
              if (baseIndex > -1) {
                 newOrders[baseIndex] = {
                     ...baseOrder,
                     totalPrice: combinedTotalPrice,
                     items: combinedItems
                 };
              }
              
              mergedCount++;
          }
      });
      
      if (mergedCount > 0) {
          setOrders(newOrders);
      }
      
      return { 
          success: mergedCount > 0, 
          message: mergedCount > 0 ? `${mergedCount}명 회원의 동일인 미입금 주문이 합쳐졌습니다.` : "합칠 수 있는 동일인 중복 주문이 없습니다." 
      };
  };

  const updateDeliveryStatus = (orderId: string, status: '배송준비중' | '배송중' | '배송완료' | '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료') => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deliveryStatus: status } : o));
  };

  const updateTrackingNumber = (orderId: string, trackingNumber: string) => {
      setOrders(prev => prev.map(o => 
          o.id === orderId ? { 
              ...o, 
              trackingNumber, 
              deliveryStatus: trackingNumber && (!o.deliveryStatus || o.deliveryStatus === '배송준비중') ? '배송중' : o.deliveryStatus 
          } : o
      ));
  };

  const bulkUpdateTracking = (mappingData: { orderId: string; trackingNumber: string }[]) => {
      let successCount = 0;
      let failedCount = 0;

      const newOrders = [...orders];
      mappingData.forEach(mapping => {
          const orderIndex = newOrders.findIndex(o => o.id === mapping.orderId);
          if (orderIndex > -1) {
              const cleanedTracking = mapping.trackingNumber.trim();
              const currentStatus = newOrders[orderIndex].deliveryStatus || '배송준비중';
              newOrders[orderIndex] = {
                  ...newOrders[orderIndex],
                  trackingNumber: cleanedTracking,
                  deliveryStatus: cleanedTracking && currentStatus === '배송준비중' ? '배송중' : currentStatus
              };
              successCount++;
          } else {
              failedCount++;
          }
      });

      if (successCount > 0) {
          setOrders(newOrders);
      }

      return { success: successCount, failed: failedCount };
  };

  const markOrdersAsExported = (orderIds: string[]) => {
      setOrders(prev => prev.map(o => 
          orderIds.includes(o.id) ? { ...o, isExportedToExcel: true } : o
      ));
  };

  const processOrderCancellation = (orderId: string, newStatus: '취소완료' | '반품요청' | '반품완료' | '교환요청' | '교환완료', restoreStock: boolean) => {
      const orderToCancel = orders.find(o => o.id === orderId);
      if (!orderToCancel) return;

      if (restoreStock) {
          setProducts(prevProducts => {
              const updatedProducts = [...prevProducts];
              orderToCancel.items.forEach(item => {
                  const idx = updatedProducts.findIndex(p => p.name === item.productName);
                  if (idx > -1) {
                      updatedProducts[idx] = { ...updatedProducts[idx], stock: updatedProducts[idx].stock + item.quantity };
                  }
              });
              return updatedProducts;
          });
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deliveryStatus: newStatus } : o));
  };

  const archiveOrders = async () => {
     try {
         const response = await fetch('/api/orders/archive', { method: 'POST' });
         const data = await response.json();
         if (data.success) {
             console.log(`${data.count} orders archived successfully to DB.`);
         } else {
             console.error("Failed to archive orders:", data.error);
         }
     } catch (err) {
         console.error("Error calling archive API", err);
     }
  };

  const resetOrders = async (archive = true) => {
    if (archive && orders.length > 0) {
        await archiveOrders();
    }
    setOrders([]);
    // Note: We do NOT reset stock here by default, as requested.
  };

  return (
    <AppContext.Provider value={{
      users, products, orders,
      registerUser, getUser, getUserByHandle, updateUser, deleteUser, toggleUserBlacklist, linkUserHandle,
      addProduct,
      updateProduct,
      deleteProduct,
      toggleProductActive,
      toggleAllProductsActive,
      
      createOrder, markOrderPaid, updateOrder, deleteOrder, mergeDuplicateOrders,
      updateDeliveryStatus, updateTrackingNumber, bulkUpdateTracking, markOrdersAsExported, processOrderCancellation,
      resetOrders, archiveOrders, refreshOrders, refreshProducts, refreshUsers
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
