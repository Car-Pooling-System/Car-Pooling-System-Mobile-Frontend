import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useUser } from "@clerk/clerk-expo";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const SocketContext = createContext({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }) {
  const { user } = useUser();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user?.id || !BACKEND_URL) return;

    const s = io(BACKEND_URL, {
      query: { userId: user.id },
      transports: ["websocket"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    s.on("connect", () => {
      console.log("[Socket] connected:", s.id);
      setIsConnected(true);
      s.emit("join-conversations");
    });

    s.on("disconnect", () => {
      console.log("[Socket] disconnected");
      setIsConnected(false);
    });

    s.on("connect_error", (err) => {
      console.log("[Socket] connection error:", err.message);
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [user?.id]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
