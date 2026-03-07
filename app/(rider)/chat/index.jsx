import {
    View, Text, FlatList, TouchableOpacity, Image,
    ActivityIndicator, useColorScheme, RefreshControl,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import tw from "twrnc";
import { theme } from "../../../constants/Colors";
import { useSocket } from "../../../context/SocketContext";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function RiderChatListScreen() {
    const { user } = useUser();
    const router = useRouter();
    const scheme = useColorScheme();
    const colors = theme[scheme ?? "light"];
    const { socket } = useSocket();

    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchConversations = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/chat/conversations?userId=${user.id}`,
            );
            const data = await res.json();
            if (res.ok) setConversations(data.conversations || []);
        } catch (err) {
            console.error("Fetch conversations error:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchConversations(); }, [fetchConversations]);

    useEffect(() => {
        if (!socket) return;
        const handler = () => fetchConversations();
        socket.on("new-message", handler);
        return () => socket.off("new-message", handler);
    }, [socket, fetchConversations]);

    const onRefresh = () => { setRefreshing(true); fetchConversations(); };

    const openChat = (convo) => {
        router.push({
            pathname: "/(rider)/chat/room",
            params: {
                conversationId: convo._id,
                title: getConvoTitle(convo),
                image: getConvoImage(convo),
                type: convo.type,
            },
        });
    };

    const getConvoTitle = (convo) => {
        if (convo.type === "group") return convo.title || "Group Chat";
        const other = convo.participants.find((p) => p.userId !== user?.id);
        return other?.name || "Chat";
    };

    const getConvoImage = (convo) => {
        if (convo.type === "group") return convo.image || "";
        const other = convo.participants.find((p) => p.userId !== user?.id);
        return other?.profileImage || "";
    };

    const timeAgo = (date) => {
        if (!date) return "";
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "now";
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d`;
        return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    };

    const renderConvo = ({ item: convo }) => {
        const title = getConvoTitle(convo);
        const image = getConvoImage(convo);
        const isGroup = convo.type === "group";
        const unread = convo.unreadCount || 0;
        const lastMsg = convo.lastMessage;
        const isMine = lastMsg?.senderId === user?.id;

        return (
            <TouchableOpacity
                onPress={() => openChat(convo)}
                activeOpacity={0.7}
                style={[tw`flex-row items-center px-5 py-4`, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            >
                <View style={tw`relative mr-3.5`}>
                    {image ? (
                        <Image source={{ uri: image }} style={tw`w-13 h-13 rounded-full bg-gray-100`} />
                    ) : (
                        <View style={[tw`w-13 h-13 rounded-full items-center justify-center`, { backgroundColor: isGroup ? colors.primarySoft : colors.surfaceMuted }]}>
                            <Ionicons name={isGroup ? "people" : "person"} size={24} color={isGroup ? colors.primary : colors.textMuted} />
                        </View>
                    )}
                    {isGroup && (
                        <View style={[tw`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full items-center justify-center border-2 border-white`, { backgroundColor: colors.primary }]}>
                            <MaterialCommunityIcons name="car" size={10} color="white" />
                        </View>
                    )}
                </View>
                <View style={tw`flex-1 mr-2`}>
                    <View style={tw`flex-row items-center gap-1.5`}>
                        <Text style={[tw`text-sm flex-1`, { color: colors.textPrimary, fontWeight: unread > 0 ? "800" : "600" }]} numberOfLines={1}>{title}</Text>
                        {lastMsg?.sentAt && (
                            <Text style={[tw`text-[10px]`, { color: unread > 0 ? colors.primary : colors.textMuted }]}>{timeAgo(lastMsg.sentAt)}</Text>
                        )}
                    </View>
                    {lastMsg?.text ? (
                        <Text style={[tw`text-xs mt-0.5`, { color: unread > 0 ? colors.textPrimary : colors.textSecondary, fontWeight: unread > 0 ? "600" : "400" }]} numberOfLines={1}>
                            {isMine ? "You: " : isGroup ? `${lastMsg.senderName?.split(" ")[0] || ""}: ` : ""}{lastMsg.text}
                        </Text>
                    ) : (
                        <Text style={[tw`text-xs mt-0.5 italic`, { color: colors.textMuted }]}>No messages yet</Text>
                    )}
                </View>
                {unread > 0 && (
                    <View style={[tw`min-w-5 h-5 rounded-full items-center justify-center px-1`, { backgroundColor: colors.primary }]}>
                        <Text style={tw`text-[10px] font-bold text-white`}>{unread > 99 ? "99+" : unread}</Text>
                    </View>
                )}
            </TouchableOpacity>
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
            <View style={[tw`px-5 pt-4 pb-3 flex-row items-center gap-3 border-b`, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="chatbubbles" size={24} color={colors.primary} />
                <Text style={[tw`text-lg font-bold flex-1`, { color: colors.textPrimary }]}>Messages</Text>
            </View>

            {conversations.length === 0 ? (
                <View style={tw`flex-1 items-center justify-center px-8`}>
                    <Ionicons name="chatbubble-ellipses-outline" size={56} color={colors.textMuted} />
                    <Text style={[tw`text-base font-bold mt-4`, { color: colors.textPrimary }]}>No conversations yet</Text>
                    <Text style={[tw`text-sm text-center mt-1`, { color: colors.textSecondary }]}>
                        Start a chat from a ride&apos;s details page — tap the chat button next to the driver or riders.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item._id}
                    renderItem={renderConvo}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                />
            )}
        </View>
    );
}
