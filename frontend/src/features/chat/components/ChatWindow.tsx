import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCentrifugo } from '../hooks/useCentrifugo';
import { useConversations } from '../hooks/useConversations';
import { useChat } from '../hooks/useChat';
import { useChatStore } from '../store';
import { useAuthStore } from '../../auth/store';
import { apiFetch } from '../../../lib/api';
import { formatPrice } from '../../properties/utils';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ChatBadge } from './ChatBadge';
import { useOrderUpdates } from '../../orders/hooks/useOrderUpdates';
import { CreateOrderModal } from '../../orders/components/CreateOrderModal';
import { OrderCard } from '../../orders/components/OrderCard';
import { OrdersPanel } from '../../orders/components/OrdersPanel';
import type { Conversation } from '../types';
import { MagicDogButton } from './MagicDogButton';
import type { Property } from '../../properties/types';

/* ── Relative time helper ── */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface PropertyGroup {
  propertyId: string;
  property: Property | null;
  conversations: Conversation[];
  latestMessageAt: string | null;
  totalUnread: number;
}

interface UserName {
  id: string;
  display_name: string;
}

export function ChatWindow() {
  const centrifugoRef = useCentrifugo();
  const { conversations, refetch } = useConversations();
  const { activeConversationId, setActiveConversation, clearUnread, unreadCounts } = useChatStore();
  const { token } = useAuthStore();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [swipedConvId, setSwipedConvId] = useState<string | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showOrdersPanel, setShowOrdersPanel] = useState(false);
  const [property, setProperty] = useState<Property | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const { user } = useAuthStore();
  const currentUserId = user?.id || '';

  // Auto-open conversation passed from PropertyDetailPage
  useEffect(() => {
    const state = location.state as { conversation?: Conversation } | null;
    if (state?.conversation) {
      setSelectedConversation(state.conversation);
      setActiveConversation(state.conversation.id);
      clearUnread(state.conversation.id);
      refetch();
      // Clear the state so it doesn't re-trigger on re-renders
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const activeConv = useMemo(
    () => selectedConversation || conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId, selectedConversation],
  );

  const channel = useMemo(() => {
    if (!activeConv) return null;
    return `property:${activeConv.property_id}:chat:${activeConv.loaner_id}`;
  }, [activeConv]);

  const { messages, sendMessage, loadMore } = useChat(
    centrifugoRef,
    activeConv?.id || null,
    channel,
  );

  const { orders, chatOrders, loadOrders } = useOrderUpdates(centrifugoRef, activeConv?.id || null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const handlePhotoSend = useCallback(async (file: File) => {
    if (!activeConv || !token) return;
    setPhotoUploading(true);
    try {
      // 1. Get presigned upload URL
      const { upload_url, file_key } = await apiFetch<{ upload_url: string; file_key: string }>(
        `/conversations/${activeConv.id}/photos/upload-url`,
        { method: 'POST', body: JSON.stringify({ file_name: file.name }) },
        token,
      );
      // 2. Upload directly to MinIO
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      // 3. Register photo message
      await apiFetch(`/conversations/${activeConv.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ file_key, caption: '' }),
      }, token);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setPhotoUploading(false);
    }
  }, [activeConv, token]);

  useEffect(() => {
    if (!selectedConversation) return;
    apiFetch<Property>(`/properties/${selectedConversation.property_id}`)
      .then(setProperty)
      .catch(() => setProperty(null));
  }, [selectedConversation?.property_id]);

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setActiveConversation(conv.id);
    clearUnread(conv.id);
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await apiFetch(`/conversations/${convId}`, { method: 'DELETE' }, token);
      refetch();
      setSwipedConvId(null);
    } catch {}
  };

  // Caches for list view
  const [propertyCache, setPropertyCache] = useState<Record<string, Property>>({});
  const [userCache, setUserCache] = useState<Record<string, string>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Fetch property & user details for conversation list
  useEffect(() => {
    if (selectedConversation || conversations.length === 0) return;

    const propIds = [...new Set(conversations.map(c => c.property_id))];
    const userIds = [...new Set(conversations.flatMap(c => [c.landlord_id, c.loaner_id]))].filter(id => id !== currentUserId);

    for (const pid of propIds) {
      if (propertyCache[pid]) continue;
      apiFetch<Property>(`/properties/${pid}`).then(p => {
        setPropertyCache(prev => ({ ...prev, [pid]: p }));
      }).catch(() => {});
    }

    for (const uid of userIds) {
      if (userCache[uid]) continue;
      apiFetch<UserName & { wallet_address?: string }>(`/users/${uid}`, {}, token).then(u => {
        const name = u.display_name && u.display_name !== u.wallet_address
          ? u.display_name
          : u.wallet_address
            ? `${u.wallet_address.slice(0, 4)}...${u.wallet_address.slice(-4)}`
            : uid.slice(0, 6) + '...';
        setUserCache(prev => ({ ...prev, [uid]: name }));
      }).catch(() => {});
    }
  }, [conversations, selectedConversation, currentUserId, token]);

  // Group conversations by property
  const groups = useMemo((): PropertyGroup[] => {
    const map = new Map<string, Conversation[]>();
    for (const conv of conversations) {
      const list = map.get(conv.property_id) || [];
      list.push(conv);
      map.set(conv.property_id, list);
    }

    const result: PropertyGroup[] = [];
    for (const [propertyId, convs] of map) {
      // Sort conversations within group by latest message
      convs.sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      });
      const latestMessageAt = convs[0].last_message_at;
      const totalUnread = convs.reduce((sum, c) => sum + (unreadCounts[c.id] || 0), 0);
      result.push({
        propertyId,
        property: propertyCache[propertyId] || null,
        conversations: convs,
        latestMessageAt,
        totalUnread,
      });
    }

    // Sort groups by latest message
    result.sort((a, b) => {
      const ta = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0;
      const tb = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0;
      return tb - ta;
    });

    return result;
  }, [conversations, propertyCache, unreadCounts]);

  // Search filter
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g => {
      const propMatch = g.property?.title?.toLowerCase().includes(q) || g.property?.location?.toLowerCase().includes(q);
      const msgMatch = g.conversations.some(c => c.last_message?.toLowerCase().includes(q));
      const userMatch = g.conversations.some(c => {
        const otherId = c.landlord_id === currentUserId ? c.loaner_id : c.landlord_id;
        return (userCache[otherId] || '').toLowerCase().includes(q);
      });
      return propMatch || msgMatch || userMatch;
    });
  }, [groups, searchQuery, userCache, currentUserId]);

  const isLandlord = (conv: Conversation) => conv.landlord_id === currentUserId;
  const shortWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  const getUserName = useCallback((id: string) => userCache[id] || shortWallet(id), [userCache]);

  if (selectedConversation) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0f', color: '#fff', zIndex: 1000 }}>
        {/* Premium Header with Glassmorphism */}
        <div style={{
          flexShrink: 0,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button
              onClick={() => { setSelectedConversation(null); setShowOrdersPanel(false); }}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E07840',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(224,120,64,0.15)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(224,120,64,0.3)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)'
              }}
            >
              ←
            </button>
            <div
              onClick={() => navigate(`/listings/${selectedConversation.property_id}`)}
              style={{ cursor: 'pointer', flex: 1, marginLeft: 16 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <p style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#F0F0F5',
                letterSpacing: '-0.3px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {property?.title || `Property: ${selectedConversation.property_id.slice(0, 8)}...`}
                <span style={{ fontSize: 10, color: '#E07840' }}>↗</span>
              </p>
              <p style={{ fontSize: 11, color: '#888890', marginTop: 3 }}>
                {property ? `${formatPrice(property.price, property.token_mint)} ${property.token_mint}/${property.period_type}` : ''}
                {property ? ' • ' : ''}
                {isLandlord(selectedConversation)
                  ? `Loaner: ${shortWallet(selectedConversation.loaner_id)}`
                  : `Landlord: ${shortWallet(selectedConversation.landlord_id)}`}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowOrderModal(true)}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'linear-gradient(135deg, rgba(224,120,64,0.2), rgba(224,120,64,0.1))',
                color: '#E07840',
                border: '1px solid rgba(224,120,64,0.25)',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(10px)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(224,120,64,0.3), rgba(224,120,64,0.15))'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(224,120,64,0.2), rgba(224,120,64,0.1))'
              }}
            >
              <span style={{ marginRight: 6 }}>✨</span>Create Order
            </button>
            <button
              onClick={() => setShowOrdersPanel(!showOrdersPanel)}
              style={{
                flex: 1,
                padding: '10px 14px',
                background: showOrdersPanel ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                color: '#D0D0D8',
                border: `1px solid ${showOrdersPanel ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              📋 Orders {orders.length > 0 && (
                <span style={{
                  background: '#E07840',
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: 700,
                  marginLeft: 6,
                }}>{orders.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Chat body + optional side panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <MessageList
                messages={messages}
                currentUserId={currentUserId}
                onLoadMore={loadMore}
              />
              {chatOrders.map((order) => (
                <OrderCard key={order.id} order={order} onUpdated={loadOrders} property={property} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '12px 12px 16px' }}>
              <MagicDogButton orders={orders} currentUserId={currentUserId} onActionComplete={loadOrders} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <MessageInput onSend={sendMessage} onPhoto={handlePhotoSend} uploading={photoUploading} />
              </div>
            </div>
          </div>
          {showOrdersPanel && (
            <OrdersPanel orders={orders} property={property} onUpdated={loadOrders} onClose={() => setShowOrdersPanel(false)} />
          )}
        </div>

        {/* Create order modal */}
        {showOrderModal && (
          <CreateOrderModal
            conversation={selectedConversation}
            property={property}
            onClose={() => setShowOrderModal(false)}
            onCreated={loadOrders}
          />
        )}

      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 100px', minHeight: '100vh', background: '#0a0a0f', color: '#fff' }}>
      {/* Header Section */}
      <div style={{ paddingTop: 24, paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #F0F0F5, #B0B0BA)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
          }}>
            Messages
          </h1>
          <button
            onClick={() => setShowSearch(!showSearch)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: showSearch ? 'linear-gradient(135deg, rgba(224,120,64,0.2), rgba(224,120,64,0.1))' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${showSearch ? 'rgba(224,120,64,0.25)' : 'rgba(255,255,255,0.12)'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)',
            }}
            onMouseEnter={(e) => {
              if (!showSearch) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
              }
            }}
            onMouseLeave={(e) => {
              if (!showSearch) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showSearch ? '#E07840' : '#8A8A9A'} strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
        </div>
        {showSearch && (
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <input
              type="text"
              placeholder="Search messages, listings, people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px 10px 40px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#e2e8f0',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: "'DM Sans',sans-serif",
                backdropFilter: 'blur(10px)',
              }}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6A6A7A" strokeWidth="2.2" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
        )}
      </div>

      {/* Conversations List */}
      {filteredGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#6A6A7A' }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5" style={{ margin: '0 auto 20px' }}>
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
          </svg>
          <p style={{ fontSize: 15, marginBottom: 6, fontWeight: 600, color: '#8A8A9A' }}>No conversations yet</p>
          <p style={{ fontSize: 13, color: '#5A5A6A' }}>Start chatting with landlords or tenants</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredGroups.map((group) => {
            const isExpanded = expandedGroup === group.propertyId;
            const prop = group.property;
            const img = prop?.media?.[0]?.url;
            const latestConv = group.conversations[0];
            const isSingle = group.conversations.length === 1;
            const singleSwiped = isSingle && swipedConvId === latestConv.id;

            return (
              <div key={group.propertyId}>
                {/* Property group header — swipeable for single-conv groups */}
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: isExpanded ? '16px 16px 0 0' : 16 }}>
                  {/* Delete button behind */}
                  {isSingle && singleSwiped && (
                    <button
                      onClick={() => handleDeleteConversation(latestConv.id)}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 80,
                        background: 'linear-gradient(135deg, #FF4D6A, #FF2E4D)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                        boxShadow: '0 4px 12px rgba(255,77,106,0.3)',
                      }}
                    >
                      Delete
                    </button>
                  )}
                  <div
                    style={{
                      transform: singleSwiped ? 'translateX(-80px)' : 'translateX(0)',
                      transition: 'transform 0.25s ease',
                      position: 'relative',
                      zIndex: 2,
                    }}
                    onTouchStart={(e) => {
                      if (!isSingle) return;
                      (e.currentTarget as any)._touchX = e.touches[0].clientX;
                    }}
                    onTouchEnd={(e) => {
                      if (!isSingle) return;
                      const startX = (e.currentTarget as any)._touchX;
                      if (startX == null) return;
                      const diff = startX - e.changedTouches[0].clientX;
                      if (diff > 60) setSwipedConvId(latestConv.id);
                      else if (diff < -30) setSwipedConvId(null);
                    }}
                  >
                    <button
                      onClick={() => {
                        if (singleSwiped) {
                          setSwipedConvId(null);
                          return;
                        }
                        if (isSingle) handleSelectConversation(latestConv);
                        else setExpandedGroup(isExpanded ? null : group.propertyId);
                      }}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: isExpanded ? '16px 16px 0 0' : 16,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.1)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))'
                        ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))'
                        ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 14,
                          flexShrink: 0,
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      >
                        {img ? (
                          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3A3A4A" strokeWidth="1.5"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <p style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: '#F0F0F5',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            letterSpacing: '-0.2px',
                          }}>
                            {prop?.title || `Property ${group.propertyId.slice(0, 8)}...`}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                            <span style={{ fontSize: 11, color: '#6A6A7A', fontWeight: 500 }}>{timeAgo(group.latestMessageAt)}</span>
                            {group.totalUnread > 0 && <ChatBadge count={group.totalUnread} />}
                          </div>
                        </div>
                        <p style={{
                          fontSize: 12,
                          color: '#8A8A9A',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          opacity: 0.8,
                        }}>
                          {isSingle
                            ? (latestConv.last_message || 'No messages yet')
                            : `${group.conversations.length} conversations`
                          }
                        </p>
                      </div>
                      {!isSingle && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#5A5A6A"
                          strokeWidth="2.2"
                          style={{
                            flexShrink: 0,
                            transition: 'transform 0.3s ease',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded sub-conversations with swipe-to-delete */}
                {isExpanded && !isSingle && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '0 0 16px 16px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderTop: 'none',
                      overflow: 'hidden',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    {group.conversations.map((conv, idx) => {
                      const otherUserId = isLandlord(conv) ? conv.loaner_id : conv.landlord_id;
                      const unread = unreadCounts[conv.id] || 0;
                      const isLast = idx === group.conversations.length - 1;
                      const isSwiped = swipedConvId === conv.id;

                      return (
                        <div key={conv.id} style={{ position: 'relative', overflow: 'hidden' }}>
                          {isSwiped && (
                            <button
                              onClick={() => handleDeleteConversation(conv.id)}
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: 80,
                                background: 'linear-gradient(135deg, #FF4D6A, #FF2E4D)',
                                border: 'none',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1,
                                boxShadow: '0 4px 12px rgba(255,77,106,0.3)',
                              }}
                            >
                              Delete
                            </button>
                          )}
                          <div
                            style={{
                              transform: isSwiped ? 'translateX(-80px)' : 'translateX(0)',
                              transition: 'transform 0.25s ease',
                              position: 'relative',
                              zIndex: 2,
                              background: 'rgba(255,255,255,0.02)',
                            }}
                            onTouchStart={(e) => {
                              (e.currentTarget as any)._touchX = e.touches[0].clientX;
                            }}
                            onTouchEnd={(e) => {
                              const startX = (e.currentTarget as any)._touchX;
                              if (startX == null) return;
                              const diff = startX - e.changedTouches[0].clientX;
                              if (diff > 60) setSwipedConvId(conv.id);
                              else if (diff < -30) setSwipedConvId(null);
                            }}
                          >
                            <button
                              onClick={() => {
                                if (isSwiped) {
                                  setSwipedConvId(null);
                                  return;
                                }
                                handleSelectConversation(conv);
                              }}
                              style={{
                                width: '100%',
                                padding: '12px 16px 12px 28px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: 'transparent',
                                border: 'none',
                                borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  flexShrink: 0,
                                  background: 'linear-gradient(135deg, #E07840, #7A3020)',
                                  border: '1px solid rgba(224,120,64,0.2)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: 'white',
                                  boxShadow: '0 4px 12px rgba(224,120,64,0.2)',
                                }}
                              >
                                {getUserName(otherUserId).charAt(0).toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                  <p style={{
                                    fontWeight: 600,
                                    fontSize: 13,
                                    color: '#e2e8f0',
                                    letterSpacing: '-0.2px',
                                  }}>
                                    {getUserName(otherUserId)}
                                  </p>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                    <span style={{ fontSize: 10, color: '#6A6A7A', fontWeight: 500 }}>{timeAgo(conv.last_message_at)}</span>
                                    {unread > 0 && <ChatBadge count={unread} />}
                                  </div>
                                </div>
                                {conv.last_message && (
                                  <p style={{
                                    fontSize: 12,
                                    color: '#7A7A8A',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}>
                                    {conv.last_message}
                                  </p>
                                )}
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
