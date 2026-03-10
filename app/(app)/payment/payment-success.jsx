import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function PaymentSuccess() {

  const router = useRouter();

  const goHome = () => {
    router.replace("/");
  };

  return (

    <View style={styles.container}>

      <Text style={styles.icon}>🎉</Text>

      <Text style={styles.title}>
        Payment Successful
      </Text>

      <Text style={styles.subtitle}>
        Your ride has been booked successfully.
      </Text>

      <View style={{ marginTop: 30 }}>
        <Button
          title="Go to Home"
          onPress={goHome}
        />
      </View>

    </View>

  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },

  icon: {
    fontSize: 60,
    marginBottom: 20
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10
  },

  subtitle: {
    fontSize: 16,
    color: "gray"
  }

});