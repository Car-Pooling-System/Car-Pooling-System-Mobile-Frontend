import React, { useState } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  StyleSheet
} from "react-native";
import RazorpayCheckout from "react-native-razorpay";
import axios from "axios";
import { useRouter, useLocalSearchParams } from "expo-router";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function PaymentScreen() {

  const router = useRouter();

  const params = useLocalSearchParams();

  const rideId = params.rideId;
  const passengerId = params.passengerId;
  const driverId = params.driverId;

  const boardingKm = Number(params.boardingKm);
  const dropKm = Number(params.dropKm);

  const [loading, setLoading] = useState(false);

  /* distance */
  const distance = dropKm - boardingKm;

  /* same logic as backend */
  const costPerKm = 600 / 300;

  const price = distance * costPerKm;

  const startPayment = async () => {

    try {

      setLoading(true);

      const paymentRes = await axios.post(`${API_URL}/payment`, {

        rideId,
        passengerId,
        driverId,
        boardingKm,
        dropKm,
        paymentMethod: "razorpay"

      });

      const createdPaymentId = paymentRes.data.paymentId;

      const orderRes = await axios.post(`${API_URL}/razorpay/create-order`, {
        rideId,
        amount: paymentRes.data.amount
      });

      const order = orderRes.data.order;

      const options = {

        description: "Ride Payment",
        currency: "INR",

        key: "rzp_test_SOlYwfWqc5ynRn",

        amount: order.amount,
        order_id: order.id,

        name: "Car Pooling System",

        theme: { color: "#2563eb" }

      };

      const payment = await RazorpayCheckout.open(options);

      await axios.post(`${API_URL}/razorpay/verify-payment`, {

        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,

        paymentId: createdPaymentId

      });

      router.replace("/payment/payment-success");

    }

    catch (error) {

      console.log("PAYMENT ERROR:", error);

      router.replace("/payment/payment-failed");

    }

    finally {

      setLoading(false);

    }

  };


  return (

    <View style={styles.container}>

      <Text style={styles.title}>Ride Payment</Text>

      <Text style={styles.subtitle}>
        Distance: {distance} km
      </Text>

      <Text style={styles.price}>
        Price: ₹{price}
      </Text>

      {loading ? (

        <ActivityIndicator size="large" />

      ) : (

        <Button
          title="Pay Now"
          onPress={startPayment}
        />

      )}

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

  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10
  },

  subtitle: {
    fontSize: 18,
    marginBottom: 10
  },

  price: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 30
  }

});