import {
    View, Text, FlatList, TouchableOpacity, Image, TextInput,
    ActivityIndicator, useColorScheme, Platform,
    Keyboard, Pressable, Modal, ScrollView, Animated, Easing,
} from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { useSocket } from "../../../context/SocketContext";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/* ── Animated typing dots (WhatsApp-style) ───── */
function TypingDots({ color }) {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animate = (dot, delay) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: 1, duration: 300, easing: Easing.ease, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.ease, useNativeDriver: true }),
                ]),
            );
        const a1 = animate(dot1, 0);
        const a2 = animate(dot2, 150);
        const a3 = animate(dot3, 300);
        a1.start(); a2.start(); a3.start();
        return () => { a1.stop(); a2.stop(); a3.stop(); };
    }, []);

    const dotStyle = (dot) => ({
        width: 6, height: 6, borderRadius: 3, backgroundColor: color,
        marginHorizontal: 2,
        transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
        opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
    });

    return (
        <View style={tw`flex-row items-center py-1`}>
            <Animated.View style={dotStyle(dot1)} />
            <Animated.View style={dotStyle(dot2)} />
            <Animated.View style={dotStyle(dot3)} />
        </View>
    );
}

export default function RiderChatRoomScreen() {
    const params = useLocalSearchParams();
    const { conversationId: rawConversationId, title, image, type } = params;
    const conversationId = (Array.isArray(rawConversationId) ? rawConversationId[0] : rawConversationId)?.trim?.() || "";
    const hasValidConversationId = OBJECT_ID_RE.test(conversationId);

    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const { socket } = useSocket();

    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [typingUsers, setTypingUsers] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [showMembers, setShowMembers] = useState(false);
    const [profileUser, setProfileUser] = useState(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const flatListRef = useRef(null);
    const typingTimeout = useRef(null);
    const inputRef = useRef(null);

    console.log(`[ChatRoom] mounted — conversationId=${conversationId}, title=${title}, type=${type}`);

    /* ── Keyboard tracking ─────────────────────── */
    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const onShow = (e) => {
            setKeyboardHeight(e.endCoordinates.height);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        };
        const onHide = () => setKeyboardHeight(0);

        const sub1 = Keyboard.addListener(showEvent, onShow);
        const sub2 = Keyboard.addListener(hideEvent, onHide);
        return () => { sub1.remove(); sub2.remove(); };
    }, []);

    /* ── Fetch conversation participants ──────── */
    useEffect(() => {
        if (!hasValidConversationId || !user?.id) return;
        (async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/chat/conversations?userId=${user.id}`);
                const data = await res.json();
                if (res.ok) {
                    const convo = (data.conversations || []).find(c => c._id === conversationId);
                    if (convo?.participants) setParticipants(convo.participants);
                }
            } catch (err) { console.error("Fetch participants error:", err); }
        })();
    }, [conversationId, hasValidConversationId, user?.id]);

    const fetchMessages = useCallback(async (pg = 1) => {
        if (!hasValidConversationId) {
            console.warn("[ChatRoom] No valid conversationId, skipping fetch");
            setLoading(false);
            return;
        }
        try {
            const res = await fetch(`${BACKEND_URL}/api/chat/messages/${conversationId}?page=${pg}&limit=50`);
            const data = await res.json();
            if (res.ok) {
                if (pg === 1) setMessages(data.messages || []);
                else setMessages((prev) => [...(data.messages || []), ...prev]);
                setHasMore(data.hasMore);
                setPage(pg);
            }
        } catch (err) { console.error("Fetch messages error:", err); }
        finally { setLoading(false); setLoadingMore(false); }
    }, [conversationId, hasValidConversationId]);

    useEffect(() => { fetchMessages(1); }, [fetchMessages]);

    useEffect(() => {
        if (!socket || !hasValidConversationId) return;
        socket.emit("join-room", conversationId);
        socket.emit("mark-read", { conversationId });

        const onNewMessage = (msg) => {
            if (msg.conversationId === conversationId) {
                setMessages((prev) => prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]);
                socket.emit("mark-read", { conversationId });
            }
        };
        const onTyping = ({ userId: uid, senderName, conversationId: cid }) => {
            if (cid === conversationId && uid !== user?.id) {
                setTypingUsers((prev) => prev.some((t) => t.userId === uid) ? prev : [...prev, { userId: uid, name: senderName }]);
            }
        };
        const onStopTyping = ({ userId: uid, conversationId: cid }) => {
            if (cid === conversationId) setTypingUsers((prev) => prev.filter((t) => t.userId !== uid));
        };

        socket.on("new-message", onNewMessage);
        socket.on("user-typing", onTyping);
        socket.on("user-stop-typing", onStopTyping);

        const onMessagesRead = ({ conversationId: cid, userId: readerId }) => {
            if (cid === conversationId && readerId !== user?.id) {
                setMessages((prev) =>
                    prev.map((msg) => {
                        if (msg.readBy && !msg.readBy.includes(readerId)) {
                            return { ...msg, readBy: [...msg.readBy, readerId] };
                        }
                        if (!msg.readBy) {
                            return { ...msg, readBy: [readerId] };
                        }
                        return msg;
                    }),
                );
            }
        };
        socket.on("messages-read", onMessagesRead);

        return () => { socket.off("new-message", onNewMessage); socket.off("user-typing", onTyping); socket.off("user-stop-typing", onStopTyping); socket.off("messages-read", onMessagesRead); };
    }, [socket, conversationId, hasValidConversationId, user?.id]);

    const handleSend = () => {
        if (!text.trim() || !socket || sending || !hasValidConversationId) {
            console.log(`[ChatRoom] handleSend blocked: text="${text.trim()}", socket=${!!socket}, sending=${sending}`);
            return;
        }
        const msgText = text.trim();
        console.log(`[ChatRoom] sending to ${conversationId}: "${msgText.slice(0, 50)}"`);
        setText("");
        setSending(true);
        socket.emit("stop-typing", { conversationId });
        socket.emit("send-message", {
            conversationId, text: msgText,
            senderName: user?.fullName || user?.firstName || "",
            senderImage: user?.imageUrl || "",
        }, (ack) => { setSending(false); if (!ack?.ok) console.error("Send failed:", ack?.error); });
    };

    const handleTextChange = (val) => {
        setText(val);
        if (!socket || !hasValidConversationId) return;
        socket.emit("typing", { conversationId, senderName: user?.fullName || user?.firstName || "" });
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => { socket.emit("stop-typing", { conversationId }); }, 2000);
    };

    const loadMore = () => { if (loadingMore || !hasMore) return; setLoadingMore(true); fetchMessages(page + 1); };

    const isSameDay = (d1, d2) => { const a = new Date(d1); const b = new Date(d2); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
    const formatTime = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const formatDateSep = (d) => {
        const dt = new Date(d); const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(dt, today)) return "Today";
        if (isSameDay(dt, yesterday)) return "Yesterday";
        return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    };

    const isSameMinute = (d1, d2) => {
        const a = new Date(d1);
        const b = new Date(d2);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate() && a.getHours() === b.getHours()
            && a.getMinutes() === b.getMinutes();
    };

    /* ── Read receipt helpers ─────────────────── */
    const isLastMessageByMe = (index) => {
        for (let i = index + 1; i < messages.length; i++) {
            if (messages[i].senderId === user?.id) return false;
        }
        return true;
    };

    const renderReadReceipt = (msg, index) => {
        const isMine = msg.senderId === user?.id;
        if (!isMine) return null;
        if (!isLastMessageByMe(index)) return null;

        const readers = (msg.readBy || []).filter((uid) => uid !== msg.senderId);
        const isGroup = type === "group";

        if (isGroup) {
            if (readers.length === 0) return null;
            const readerParticipants = readers
                .map((uid) => participants.find((p) => p.userId === uid))
                .filter(Boolean);
            if (readerParticipants.length === 0) return null;

            return (
                <View style={tw`flex-row justify-end mt-0.5 mr-1`}>
                    {readerParticipants.slice(0, 5).map((p) =>
                        p.profileImage ? (
                            <Image key={p.userId} source={{ uri: p.profileImage }}
                                style={tw`w-3.5 h-3.5 rounded-full -ml-1 border border-white`} />
                        ) : (
                            <View key={p.userId}
                                style={[tw`w-3.5 h-3.5 rounded-full -ml-1 border border-white items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                                <Ionicons name="person" size={6} color={colors.textMuted} />
                            </View>
                        ),
                    )}
                    {readerParticipants.length > 5 && (
                        <View style={[tw`w-3.5 h-3.5 rounded-full -ml-1 border border-white items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                            <Text style={[tw`text-[5px]`, { color: colors.textMuted }]}>+{readerParticipants.length - 5}</Text>
                        </View>
                    )}
                </View>
            );
        } else {
            const otherParticipant = participants.find((p) => p.userId !== user?.id);
            const hasBeenRead = otherParticipant && readers.includes(otherParticipant.userId);
            if (!hasBeenRead) return null;

            return (
                <View style={tw`flex-row justify-end items-center mt-0.5 mr-1 gap-1`}>
                    {otherParticipant?.profileImage ? (
                        <Image source={{ uri: otherParticipant.profileImage }}
                            style={tw`w-3 h-3 rounded-full`} />
                    ) : null}
                    <Text style={[tw`text-[9px]`, { color: colors.primary }]}>Seen</Text>
                </View>
            );
        }
    };

    const renderMessage = ({ item: msg, index }) => {
        const isMine = msg.senderId === user?.id;
        const isGroup = type === "group";
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const showDate = !prevMsg || !isSameDay(msg.createdAt, prevMsg.createdAt);

        // Show sender name only on the first message in a consecutive group
        const showName = isGroup && !isMine && (!prevMsg || prevMsg.senderId !== msg.senderId || showDate);
        const showAvatar = isGroup && !isMine && showName;
        const avatarSpacer = isGroup && !isMine && !showName;

        // Group same-time messages: hide time if next msg is same sender & same minute
        const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
        const showTime = !nextMsg || nextMsg.senderId !== msg.senderId
            || !isSameMinute(msg.createdAt, nextMsg.createdAt);

        const handleAvatarPress = () => {
            const participant = participants.find(p => p.userId === msg.senderId);
            if (participant) setProfileUser(participant);
            else setProfileUser({ userId: msg.senderId, name: msg.senderName, profileImage: msg.senderImage, role: "rider" });
        };

        return (
            <Pressable onPress={Keyboard.dismiss}>
                {showDate && (
                    <View style={tw`items-center my-3`}>
                        <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                            <Text style={[tw`text-[10px] font-bold`, { color: colors.textMuted }]}>{formatDateSep(msg.createdAt)}</Text>
                        </View>
                    </View>
                )}
                <View style={[tw`flex-row px-4`, isMine ? tw`justify-end` : tw`justify-start`, showTime ? tw`mb-1.5` : tw`mb-0.5`]}>
                    {/* Tappable avatar for others in group */}
                    {showAvatar && (
                        <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7}>
                            {msg.senderImage ? (
                                <Image source={{ uri: msg.senderImage }} style={tw`w-7 h-7 rounded-full mr-2 mt-1`} />
                            ) : (
                                <View style={[tw`w-7 h-7 rounded-full mr-2 mt-1 items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                                    <Ionicons name="person" size={14} color={colors.textMuted} />
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    {avatarSpacer && <View style={tw`w-7 mr-2`} />}
                    <View style={[tw`max-w-[75%]`]}>
                        {showName && (
                            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7}>
                                <Text style={[tw`text-[10px] font-bold mb-0.5 ml-1`, { color: colors.textSecondary }]}>{msg.senderName?.split(" ")[0] || "User"}</Text>
                            </TouchableOpacity>
                        )}
                        <View style={[tw`px-3.5 py-2.5 rounded-2xl`, isMine ? [{ backgroundColor: colors.primary }, tw`rounded-br-md`] : [{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, tw`rounded-bl-md`]]}>
                            <Text style={[tw`text-sm leading-5`, { color: isMine ? "#fff" : colors.textPrimary }]}>{msg.text}</Text>
                        </View>
                        {showTime && (
                            <Text style={[tw`text-[9px] mt-0.5 mx-1`, { color: colors.textMuted, textAlign: isMine ? "right" : "left" }]}>{formatTime(msg.createdAt)}</Text>
                        )}
                        {renderReadReceipt(msg, index)}
                    </View>
                </View>
            </Pressable>
        );
    };

    if (loading) {
        return (
            <View style={[tw`flex-1 items-center justify-center`, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[tw`flex-1`, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[tw`flex-row items-center px-4 pt-3 pb-3 border-b`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={tw`mr-3`}>
                    <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={tw`flex-row items-center flex-1`}
                    activeOpacity={type === "group" ? 0.7 : 1}
                    onPress={() => type === "group" && setShowMembers(true)}
                >
                    {image ? (
                        <Image source={{ uri: image }} style={tw`w-9 h-9 rounded-full mr-3 bg-gray-100`} />
                    ) : (
                        <View style={[tw`w-9 h-9 rounded-full mr-3 items-center justify-center`, { backgroundColor: type === "group" ? colors.primarySoft : colors.surfaceMuted }]}>
                            <Ionicons name={type === "group" ? "people" : "person"} size={18} color={type === "group" ? colors.primary : colors.textMuted} />
                        </View>
                    )}
                    <View style={tw`flex-1`}>
                        <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]} numberOfLines={1}>{title || "Chat"}</Text>
                        {typingUsers.length > 0 ? (
                            <View style={tw`flex-row items-center gap-1`}>
                                <TypingDots color={colors.primary} />
                                <Text style={[tw`text-[10px]`, { color: colors.primary }]}>
                                    {typingUsers.map((t) => t.name?.split(" ")[0]).join(", ")}
                                </Text>
                            </View>
                        ) : type === "group" && participants.length > 0 ? (
                            <Text style={[tw`text-[10px]`, { color: colors.textMuted }]}>
                                {participants.length} members · tap for info
                            </Text>
                        ) : null}
                    </View>
                </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item._id}
                renderItem={renderMessage}
                contentContainerStyle={tw`py-2`}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => { if (messages.length > 0 && !loadingMore) flatListRef.current?.scrollToEnd({ animated: false }); }}
                ListHeaderComponent={
                    loadingMore ? <View style={tw`py-3 items-center`}><ActivityIndicator size="small" color={colors.primary} /></View>
                    : hasMore ? <TouchableOpacity onPress={loadMore} style={tw`py-3 items-center`}><Text style={[tw`text-xs font-bold`, { color: colors.primary }]}>Load older messages</Text></TouchableOpacity> : null
                }
                ListEmptyComponent={
                    <View style={tw`flex-1 items-center justify-center py-16`}>
                        <Ionicons name="chatbubble-outline" size={40} color={colors.textMuted} />
                        <Text style={[tw`text-sm mt-3`, { color: colors.textMuted }]}>No messages yet. Say hello! 👋</Text>
                    </View>
                }
            />

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
                <View style={[tw`flex-row items-center px-5 py-1.5`, { backgroundColor: colors.surface }]}>
                    <TypingDots color={colors.textMuted} />
                    <Text style={[tw`text-[10px] ml-1`, { color: colors.textMuted }]}>
                        {typingUsers.map((t) => t.name?.split(" ")[0]).join(", ")} typing…
                    </Text>
                </View>
            )}

            {/* Input bar */}
            <View style={[tw`flex-row items-end px-4 py-2 border-t`, {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Platform.OS === "ios" ? Math.max(keyboardHeight, 8) : 8,
            }]}>
                <TextInput
                    ref={inputRef}
                    value={text} onChangeText={handleTextChange} placeholder="Type a message…" placeholderTextColor={colors.textMuted}
                    multiline maxLength={2000}
                    style={[tw`flex-1 text-sm px-4 py-2.5 rounded-2xl mr-2`, { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, maxHeight: 100, borderWidth: 1, borderColor: colors.border }]}
                />
                <TouchableOpacity
                    onPress={handleSend} disabled={!text.trim() || sending} activeOpacity={0.7}
                    style={[tw`w-10 h-10 rounded-full items-center justify-center`, { backgroundColor: text.trim() ? colors.primary : colors.surfaceMuted }]}
                >
                    {sending ? <ActivityIndicator size="small" color={text.trim() ? "#fff" : colors.textMuted} /> : <Ionicons name="send" size={18} color={text.trim() ? "#fff" : colors.textMuted} />}
                </TouchableOpacity>
            </View>

            {/* Members Modal (Group chats) */}
            <Modal visible={showMembers} animationType="slide" transparent>
                <View style={[tw`flex-1 justify-end`, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                    <Pressable style={tw`flex-1`} onPress={() => setShowMembers(false)} />
                    <View style={[tw`rounded-t-3xl px-5 pt-5 pb-8`, { backgroundColor: colors.surface, maxHeight: "70%" }]}>
                        <View style={tw`flex-row items-center justify-between mb-4`}>
                            <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>Group Members</Text>
                            <TouchableOpacity onPress={() => setShowMembers(false)}>
                                <Ionicons name="close" size={24} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {participants.map((p) => (
                                <TouchableOpacity
                                    key={p.userId}
                                    style={tw`flex-row items-center py-3`}
                                    activeOpacity={0.7}
                                    onPress={() => { setShowMembers(false); setProfileUser(p); }}
                                >
                                    {p.profileImage ? (
                                        <Image source={{ uri: p.profileImage }} style={tw`w-11 h-11 rounded-full bg-gray-100`} />
                                    ) : (
                                        <View style={[tw`w-11 h-11 rounded-full items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                                            <Ionicons name="person" size={20} color={colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={tw`ml-3 flex-1`}>
                                        <Text style={[tw`text-sm font-bold`, { color: colors.textPrimary }]}>
                                            {p.name || "User"}{p.userId === user?.id ? " (You)" : ""}
                                        </Text>
                                        <Text style={[tw`text-xs capitalize`, { color: colors.textSecondary }]}>{p.role}</Text>
                                    </View>
                                    <View style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: p.role === "driver" ? colors.primarySoft : colors.surfaceMuted }]}>
                                        <Text style={[tw`text-[10px] font-bold capitalize`, { color: p.role === "driver" ? colors.primary : colors.textMuted }]}>{p.role}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Profile Modal */}
            <Modal visible={!!profileUser} animationType="fade" transparent>
                <View style={[tw`flex-1 items-center justify-center`, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                    <Pressable style={tw`absolute inset-0`} onPress={() => setProfileUser(null)} />
                    <View style={[tw`w-72 rounded-3xl items-center px-6 py-8`, { backgroundColor: colors.surface }]}>
                        {profileUser?.profileImage ? (
                            <Image source={{ uri: profileUser.profileImage }} style={tw`w-24 h-24 rounded-full bg-gray-100 mb-4`} />
                        ) : (
                            <View style={[tw`w-24 h-24 rounded-full items-center justify-center mb-4`, { backgroundColor: colors.surfaceMuted }]}>
                                <Ionicons name="person" size={44} color={colors.textMuted} />
                            </View>
                        )}
                        <Text style={[tw`text-lg font-bold`, { color: colors.textPrimary }]}>
                            {profileUser?.name || "User"}
                        </Text>
                        <View style={[tw`px-3 py-1 rounded-full mt-2`, { backgroundColor: profileUser?.role === "driver" ? colors.primarySoft : colors.surfaceMuted }]}>
                            <Text style={[tw`text-xs font-bold capitalize`, { color: profileUser?.role === "driver" ? colors.primary : colors.textMuted }]}>
                                {profileUser?.role || "rider"}
                            </Text>
                        </View>
                        {profileUser?.userId !== user?.id && (
                            <TouchableOpacity
                                onPress={async () => {
                                    try {
                                        const res = await fetch(`${BACKEND_URL}/api/chat/conversations/direct`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                user1: {
                                                    userId: user?.id,
                                                    name: user?.fullName || user?.firstName || "",
                                                    profileImage: user?.imageUrl || "",
                                                    role: "rider",
                                                },
                                                user2: {
                                                    userId: profileUser.userId,
                                                    name: profileUser.name || "",
                                                    profileImage: profileUser.profileImage || "",
                                                    role: profileUser.role || "rider",
                                                },
                                            }),
                                        });
                                        const convo = await res.json();
                                        if (res.ok && convo._id) {
                                            setProfileUser(null);
                                            setShowMembers(false);
                                            router.push({
                                                pathname: "/(rider)/chat/room",
                                                params: {
                                                    conversationId: convo._id,
                                                    title: profileUser.name || "Chat",
                                                    image: profileUser.profileImage || "",
                                                    type: "direct",
                                                },
                                            });
                                        }
                                    } catch (err) {
                                        console.error("Create DM error:", err);
                                    }
                                }}
                                style={[tw`mt-4 px-8 py-2.5 rounded-full flex-row items-center gap-2`, { backgroundColor: colors.primary }]}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="chatbubble" size={14} color="#fff" />
                                <Text style={tw`text-sm font-bold text-white`}>Message</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() => setProfileUser(null)}
                            style={[tw`mt-3 px-8 py-2.5 rounded-full`, { backgroundColor: colors.surfaceMuted }]}
                        >
                            <Text style={[tw`text-sm font-bold`, { color: colors.textMuted }]}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
