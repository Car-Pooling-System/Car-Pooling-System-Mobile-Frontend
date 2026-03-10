import { View, Text, TextInput, Button, Alert, StyleSheet } from "react-native";
import React, { useState } from "react";

import { createPayment, updatePaymentStatus } from "../utils/paymentApi";

export default function PaymentScreen() {

  const [boardingKm, setBoardingKm] = useState("");
  const [dropKm, setDropKm] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {

    if (!boardingKm || !dropKm) {
      Alert.alert("Error", "Enter boarding and drop KM");
      return;
    }

    if (Number(dropKm) <= Number(boardingKm)) {
      Alert.alert("Error", "Drop KM must be greater than Boarding KM");
      return;
    }

    try {

      setLoading(true);

      const paymentData = {

        rideId: "RIDE100",
        passengerId: "USER100",
        driverId: "DRIVER100",

        boardingKm: Number(boardingKm),
        dropKm: Number(dropKm),

        paymentMethod: "upi"

      };

      console.log("Sending Payment Data:", paymentData);

      const paymentResponse = await createPayment(paymentData);

      console.log("Payment Created:", paymentResponse);

      const paymentId = paymentResponse.payment._id;

      /*
      SIMULATE SUCCESS PAYMENT
      */

      await updatePaymentStatus(paymentId, {
        status: "success",
        transactionId: "TXN" + Date.now()
      });

      Alert.alert("Success", "Payment Completed");

      setBoardingKm("");
      setDropKm("");

    } catch (error) {

      console.log("Payment Error:", error);

      Alert.alert("Payment Failed", JSON.stringify(error));

    } finally {

      setLoading(false);

    }

  };

  return (

    <View style={styles.container}>

      <Text style={styles.title}>
        Passenger Payment
      </Text>

      <TextInput
        placeholder="Boarding KM"
        keyboardType="numeric"
        value={boardingKm}
        onChangeText={setBoardingKm}
        style={styles.input}
      />

      <TextInput
        placeholder="Drop KM"
        keyboardType="numeric"
        value={dropKm}
        onChangeText={setDropKm}
        style={styles.input}
      />

      <Button
        title={loading ? "Processing..." : "Pay Now"}
        onPress={handlePayment}
        disabled={loading}
      />

    </View>

  );

}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20
  },

  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: "bold",
    textAlign: "center"
  },

  input: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    borderRadius: 8
  }

});