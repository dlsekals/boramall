"use client";

import { useState, useMemo } from 'react';
import { useApp, User } from '../../context/AppContext';
import * as XLSX from 'xlsx';

export default function UserManagementTab() {
  const { users, registerUser, updateUser, deleteUser, toggleUserBlacklist } = useApp();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [formData, setFormData] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showBlacklistOnly, setShowBlacklistOnly] = useState(false);
  const [sortUserConfig, setSortUserConfig] = useState<{ direction: 'desc' | 'asc' }>({ direction: 'desc' });

  const todayCount = useMemo(() => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    return users.filter(u => {
      const d = new Date(u.registeredAt);
      return d.getFullYear() === todayYear && d.getMonth() === todayMonth && d.getDate() === todayDate;
    }).length;
  }, [users]);

  const sortedUsers = [...users].sort((a, b) => {
      const dateA = new Date(a.registeredAt).getTime();
      const dateB = new Date(b.registeredAt).getTime();
      return sortUserConfig.direction === 'desc' ? dateB - dateA : dateA - dateB;
  });

  const filteredUsers = sortedUsers.filter(user => {
    const matchesSearch = user.name.includes(searchTerm) || 
                          user.nickname.includes(searchTerm) || 
                          user.phone.includes(searchTerm) ||
                          user.address.includes(searchTerm);
    if (showBlacklistOnly) {
        return matchesSearch && user.isBlacklisted;
    }
    return matchesSearch;
  });

  const handleEditClick = (user: User) => {
    setIsAddingMode(false);
    setEditingUser(user);
    setFormData({ ...user });
  };

  const handleAddClick = () => {
    setIsAddingMode(true);
    setEditingUser(null);
    setFormData({
      nickname: '',
      name: '',
      phone: '',
      address: '',
      registeredAt: new Date().toISOString()
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (formData) {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  };

  const handleSave = () => {
    if (formData) {
      if (isAddingMode) {
        // Prevent duplicate phone/nickname if necessary (registerUser handles some inside context theoretically)
        if (!formData.nickname || !formData.name || !formData.phone) {
           alert("닉네임, 이름, 전화번호는 필수 입력입니다.");
           return;
        }
        const newUserToRegister = {
            ...formData,
            registeredAt: new Date().toISOString()
        };
        const success = registerUser(newUserToRegister);
        if (success) {
          setIsAddingMode(false);
          setFormData(null);
          alert('회원이 성공적으로 추가되었습니다.');
        } else {
            alert('중복된 전화번호 또는 닉네임이 존재합니다.');
        }
      } else if (editingUser) {
        const success = updateUser(editingUser, formData);
        if (success) {
          setEditingUser(null);
          setFormData(null);
          alert('회원 정보가 수정되었습니다.');
        } else {
             alert('수정 실패: 중복된 전화번호 또는 닉네임이 존재합니다.');
        }
      }
    }
  };

  const handleDownloadExcel = () => {
      if (users.length === 0) {
          alert("다운로드할 회원 데이터가 없습니다.");
          return;
      }

      // Sort by registeredAt descending (newest first)
      const sorted = [...users].sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());

      const data = sorted.map(u => ({
        '닉네임': u.nickname,
        '이름': u.name,
        '전화번호': u.phone,
        '주소': u.address,
        '가입일': new Date(u.registeredAt).toLocaleDateString('ko-KR'),
        '블랙리스트': u.isBlacklisted ? 'O' : 'X'
      }));

      const ws = XLSX.utils.json_to_sheet(data);

      // Auto-size columns
      const colWidths = Object.keys(data[0]).map(key => ({
        wch: Math.max(key.length * 2, ...data.map(row => String((row as Record<string, string>)[key] || '').length)) + 2
      }));
      ws['!cols'] = colWidths;

      // Add autofilter on all columns (so user can sort by 가입일 in Excel)
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: Object.keys(data[0]).length - 1 } }) };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '회원목록');
      XLSX.writeFile(wb, `보라몰_회원목록_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar & Total Count */}
      <div className="bg-white p-4 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-lg font-bold text-gray-700">
                총 회원: <span className="text-[#673ab7]">{users.length}</span>명
                {searchTerm && <span className="text-sm font-normal text-gray-500 ml-2">(검색됨: {filteredUsers.length}명)</span>}
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm transition-all ${
                todayCount > 0 
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                <span>{todayCount > 0 ? '🎉' : '📅'}</span>
                <span>오늘 가입: {todayCount}명</span>
              </div>
            </div>
            
            <label className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-full cursor-pointer hover:bg-red-100 transition-colors">
                <input 
                    type="checkbox" 
                    checked={showBlacklistOnly}
                    onChange={(e) => setShowBlacklistOnly(e.target.checked)}
                    className="accent-red-600 w-4 h-4"
                />
                🚨 블랙리스트만 보기
            </label>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:max-w-md bg-gray-50 p-2 rounded border flex-1">
              <span className="text-xl">🔍</span>
              <input 
                type="text"
                placeholder="회원 검색 (이름, 닉네임, 전화번호, 주소)"
                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={handleAddClick}
                    className="whitespace-nowrap bg-[#673ab7] text-white font-bold px-3 py-2 sm:px-4 sm:py-2.5 rounded hover:bg-[#5e35b1] shadow-sm flex items-center gap-2 transition"
                >
                    ＋ 회원 추가
                </button>
                <button 
                    onClick={handleDownloadExcel}
                className="whitespace-nowrap bg-emerald-100 text-emerald-800 font-bold px-3 py-2 sm:px-4 sm:py-2.5 rounded hover:bg-emerald-200 border border-emerald-200 shadow-sm flex items-center gap-2 transition"
            >
                📥 엑셀 다운로드
            </button>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-base">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">닉네임</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">회원명</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">유튜브 ID</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">전화번호</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">주소</th>
                <th 
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setSortUserConfig(prev => ({ direction: prev.direction === 'desc' ? 'asc' : 'desc' }))}
                    title="가입일순 정렬"
                >
                    가입일 {sortUserConfig.direction === 'desc' ? '▼' : '▲'}
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y relative">
              {filteredUsers.map(user => (
                <tr key={`${user.nickname}-${user.phone}-${user.registeredAt}`} className={`hover:bg-gray-50 transition-colors border-l-4 ${user.isBlacklisted ? 'bg-red-50/50 text-red-900 border-l-red-500' : 'bg-white border-l-transparent'}`}>
                  <td className="py-2 px-3 font-bold text-[#673ab7] whitespace-nowrap">{user.nickname}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{user.name}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {user.youtubeHandle ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-800 border border-pink-200">
                          {user.youtubeHandle}
                        </span>
                    ) : (
                        <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{user.phone}</td>
                  <td className="py-2 px-3 truncate max-w-[100px] sm:max-w-xs" title={user.address}>{user.address}</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{new Date(user.registeredAt).toLocaleDateString().slice(2)}</td>
                  <td className="py-1 px-1 sm:py-1.5 sm:px-4 text-center whitespace-nowrap w-[80px]">
                    {user.isBlacklisted ? (
                      <span className="inline-flex items-center justify-center w-[70px] py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        블랙리스트
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-[70px] py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        정상
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-1 sm:py-1.5 sm:px-4 text-center whitespace-nowrap">
                    <div className="flex justify-center items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => handleEditClick(user)}
                          className="bg-blue-100 text-blue-700 px-2 py-0.5 sm:px-3 sm:py-1.5 rounded hover:bg-blue-200 font-medium text-[10px] sm:text-sm transition-colors"
                        >
                          수정
                        </button>
                        <span className="text-gray-300 hidden sm:inline">|</span>
                        <button
                          onClick={() => toggleUserBlacklist(user)}
                          className={`w-[75px] sm:w-[90px] py-0.5 sm:py-1.5 rounded font-bold text-[10px] sm:text-sm transition-colors border shadow-sm text-center ${user.isBlacklisted ? 'bg-white text-gray-600 hover:bg-gray-100 border-gray-300' : 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200'}`}
                        >
                          {user.isBlacklisted ? '✅ 분류해제' : '🚨 블랙등록'}
                        </button>
                        <button
                          onClick={() => {
                              if(confirm(`'${user.name}(${user.nickname})' 회원을 영구적으로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
                                  deleteUser(user);
                              }
                          }}
                          className="bg-white text-gray-500 border border-gray-300 px-2 py-0.5 sm:px-3 sm:py-1.5 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-300 font-medium text-[10px] sm:text-sm transition-colors"
                        >
                          삭제
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">가입된 회원이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Modal */}
      {(editingUser || isAddingMode) && formData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold mb-4">{isAddingMode ? '회원 정보 추가' : '회원 정보 수정'}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">닉네임</label>
                <input 
                  type="text" 
                  name="nickname"
                  value={formData.nickname} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-[#673ab7] outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-[#673ab7] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input 
                  type="text" 
                  name="phone"
                  value={formData.phone} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-[#673ab7] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">유튜브 ID (선택)</label>
                <input 
                  type="text" 
                  name="youtubeHandle"
                  value={formData.youtubeHandle || ''} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-[#673ab7] outline-none"
                  placeholder="예: 35Z 또는 없음"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                <input 
                  type="text" 
                  name="address"
                  value={formData.address} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-[#673ab7] outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => {
                    setEditingUser(null);
                    setIsAddingMode(false);
                    setFormData(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                취소
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-[#673ab7] text-white rounded font-bold hover:bg-[#5e35b1]"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
