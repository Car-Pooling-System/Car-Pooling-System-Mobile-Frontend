import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function Home() {

  const router = useRouter();

  return (

    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f4f6f8",
        padding: 20,
      }}
    >

      {/* TITLE */}

      <Text
        style={{
          fontSize: 26,
          fontWeight: "bold",
          marginBottom: 30,
        }}
      >
        Car Pooling App
      </Text>


      {/* PAYMENT BUTTON */}

      <Pressable
        onPress={() => router.push("/payment")}
        style={{
          backgroundColor: "#0a84ff",
          paddingVertical: 15,
          paddingHorizontal: 30,
          borderRadius: 10,
          marginBottom: 15,
        }}
      >

        <Text
          style={{
            color: "white",
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          Open Payment Module
        </Text>

      </Pressable>


      {/* DRIVER PROFILE BUTTON (optional future use) */}

      <Pressable
        onPress={() => router.push("/profile")}
        style={{
          backgroundColor: "#34c759",
          paddingVertical: 15,
          paddingHorizontal: 30,
          borderRadius: 10,
        }}
      >

        <Text
          style={{
            color: "white",
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          Driver Profile
        </Text>

      </Pressable>

    </View>

  );

}