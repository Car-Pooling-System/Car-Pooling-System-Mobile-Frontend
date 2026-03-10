import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function PaymentFailed() {

  const router = useRouter();

  const retryPayment = () => {
    router.back();
  };

  const goHome = () => {
    router.replace("/");
  };

  return (

    <View style={styles.container}>

      <Text style={styles.icon}>❌</Text>

      <Text style={styles.title}>
        Payment Failed
      </Text>

      <Text style={styles.subtitle}>
        Something went wrong during payment.
      </Text>

      <View style={styles.buttonContainer}>

        <Button
          title="Retry Payment"
          onPress={retryPayment}
        />

        <View style={{ height: 10 }} />

        <Button
          title="Go Home"
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
    color: "gray",
    marginBottom: 30
  },

  buttonContainer: {
    width: "60%"
  }

});