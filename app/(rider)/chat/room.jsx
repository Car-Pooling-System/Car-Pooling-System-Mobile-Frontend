import {
    View, Text, FlatList, TouchableOpacity, Image, TextInput,
    ActivityIndicator, useColorScheme, KeyboardAvoidingView, Platform,
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
    const flatListRef = useRef(null);
    const typingTimeout = useRef(null);

    console.log(`[ChatRoom] mounted — conversationId=${conversationId}, title=${title}, type=${type}`);

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
        return () => { socket.off("new-message", onNewMessage); socket.off("user-typing", onTyping); socket.off("user-stop-typing", onStopTyping); };
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

    const renderMessage = ({ item: msg, index }) => {
        const isMine = msg.senderId === user?.id;
        const isGroup = type === "group";
        const showAvatar = isGroup && !isMine;
        const showName = isGroup && !isMine;
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const showDate = !prevMsg || !isSameDay(msg.createdAt, prevMsg.createdAt);

        return (
            <View>
                {showDate && (
                    <View style={tw`items-center my-3`}>
                        <View style={[tw`px-3 py-1 rounded-full`, { backgroundColor: colors.surfaceMuted }]}>
                            <Text style={[tw`text-[10px] font-bold`, { color: colors.textMuted }]}>{formatDateSep(msg.createdAt)}</Text>
                        </View>
                    </View>
                )}
                <View style={[tw`flex-row px-4 mb-1.5`, isMine ? tw`justify-end` : tw`justify-start`]}>
                    {showAvatar && (
                        msg.senderImage ? (
                            <Image source={{ uri: msg.senderImage }} style={tw`w-7 h-7 rounded-full mr-2 mt-1`} />
                        ) : (
                            <View style={[tw`w-7 h-7 rounded-full mr-2 mt-1 items-center justify-center`, { backgroundColor: colors.surfaceMuted }]}>
                                <Ionicons name="person" size={14} color={colors.textMuted} />
                            </View>
                        )
                    )}
                    <View style={[tw`max-w-[75%]`]}>
                        {showName && (
                            <Text style={[tw`text-[10px] font-bold mb-0.5 ml-1`, { color: colors.textSecondary }]}>{msg.senderName?.split(" ")[0] || "User"}</Text>
                        )}
                        <View style={[tw`px-3.5 py-2.5 rounded-2xl`, isMine ? [{ backgroundColor: colors.primary }, tw`rounded-br-md`] : [{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, tw`rounded-bl-md`]]}>
                            <Text style={[tw`text-sm leading-5`, { color: isMine ? "#fff" : colors.textPrimary }]}>{msg.text}</Text>
                        </View>
                        <Text style={[tw`text-[9px] mt-0.5 mx-1`, { color: colors.textMuted, textAlign: isMine ? "right" : "left" }]}>{formatTime(msg.createdAt)}</Text>
                    </View>
                </View>
            </View>
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
        <KeyboardAvoidingView style={[tw`flex-1`, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[tw`flex-row items-center px-4 pt-3 pb-3 border-b`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={tw`mr-3`}>
                    <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                {image ? (
                    <Image source={{ uri: image }} style={tw`w-9 h-9 rounded-full mr-3 bg-gray-100`} />
                ) : (
                    <View style={[tw`w-9 h-9 rounded-full mr-3 items-center justify-center`, { backgroundColor: type === "group" ? colors.primarySoft : colors.surfaceMuted }]}>
                        <Ionicons name={type === "group" ? "people" : "person"} size={18} color={type === "group" ? colors.primary : colors.textMuted} />
                    </View>
                )}
                <View style={tw`flex-1`}>
                    <Text style={[tw`text-base font-bold`, { color: colors.textPrimary }]} numberOfLines={1}>{title || "Chat"}</Text>
                    {typingUsers.length > 0 && (
                        <Text style={[tw`text-[10px]`, { color: colors.primary }]}>{typingUsers.map((t) => t.name?.split(" ")[0]).join(", ")} typing…</Text>
                    )}
                </View>
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item._id}
                renderItem={renderMessage}
                contentContainerStyle={tw`py-2`}
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

            {typingUsers.length > 0 && (
                <View style={[tw`flex-row items-center px-5 py-1`, { backgroundColor: colors.surface }]}>
                    <View style={tw`flex-row gap-1 mr-2`}>
                        <View style={[tw`w-1.5 h-1.5 rounded-full`, { backgroundColor: colors.textMuted }]} />
                        <View style={[tw`w-1.5 h-1.5 rounded-full`, { backgroundColor: colors.textMuted }]} />
                        <View style={[tw`w-1.5 h-1.5 rounded-full`, { backgroundColor: colors.textMuted }]} />
                    </View>
                    <Text style={[tw`text-[10px]`, { color: colors.textMuted }]}>{typingUsers.map((t) => t.name?.split(" ")[0]).join(", ")} typing…</Text>
                </View>
            )}

            <View style={[tw`flex-row items-end px-4 py-3 border-t`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
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
        </KeyboardAvoidingView>
    );
}
